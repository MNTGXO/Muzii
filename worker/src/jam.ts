/**
 * Muzii Jam — a shared listening session (the "Spotify Jam" equivalent).
 *
 * How it works:
 * - A host creates a jam and gets a short 5-character code plus a QR/link
 *   (`/#/jam/AB3K9`). The jam lives in a Durable Object named after the code,
 *   so all members of one jam are serialised through a single instance.
 * - Guests open the link, pick a display name, and get a guest token
 *   (stored in localStorage). Every member can add to the queue and skip —
 *   that is the point of a jam — and the host can lock it to listeners.
 * - The room state is a queue of tracks plus playback position. The host's
 *   device is the "speaker": it reports progress, and everyone else follows
 *   by seeking to `positionMs + elapsed`. This avoids needing the server to
 *   run a clock or stream audio.
 * - Clients poll `GET /api/jam/:code` every few seconds. Polling (rather than
 *   WebSockets) keeps this deployable on Workers free tier and works through
 *   corporate proxies that break WS.
 *
 * State is in-memory inside the Durable Object with a short TTL: a jam is
 * ephemeral by design (like a real party), and dying when the room empties is
 * the expected behaviour.
 */

export interface JamTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSec: number;
  streamUrl: string;
  artworkUrl: string;
  gradientSeed: number;
}

export interface JamMessage {
  id: string;
  author: string;
  text: string;
  at: number;
}

export interface JamState {
  code: string;
  hostName: string;
  hostToken: string;
  active: boolean;
  /** Listeners can't change the queue when the host locks the jam. */
  locked: boolean;
  queue: JamTrack[];
  index: number;
  /** Host-reported playback position, plus the server time it was reported. */
  positionMs: number;
  updatedAt: number;
  members: Record<string, { name: string; at: number }>;
  messages: JamMessage[];
  createdAt: number;
}

const MAX_QUEUE = 100;
const MAX_MESSAGES = 60;
const MEMBER_TTL_MS = 2 * 60 * 1000;
const JAM_TTL_MS = 6 * 60 * 60 * 1000;

export function newCode(): string {
  // Avoid look-alike characters (0/O, 1/I) so codes are readable out loud.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return code;
}

export function newId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function prune(state: JamState): JamState {
  const now = Date.now();
  const members: JamState['members'] = {};
  for (const [token, member] of Object.entries(state.members)) {
    if (now - member.at < MEMBER_TTL_MS) members[token] = member;
  }
  return {
    ...state,
    members,
    queue: state.queue.slice(0, MAX_QUEUE),
    messages: state.messages.slice(-MAX_MESSAGES),
  };
}

/** Public view — host token and member tokens never leave the server. */
export function publicJam(state: JamState) {
  const now = Date.now();
  const elapsed = state.active ? now - state.updatedAt : 0;
  const currentTrack = state.queue[state.index] ?? null;
  return {
    code: state.code,
    hostName: state.hostName,
    locked: state.locked,
    active: state.active,
    queue: state.queue,
    index: state.index,
    currentTrack,
    // Where the current song should be right now, for late joiners.
    positionMs: currentTrack ? Math.min(state.positionMs + elapsed, currentTrack.durationSec * 1000) : 0,
    members: Object.values(state.members).map((m) => m.name),
    messages: state.messages,
    createdAt: state.createdAt,
  };
}

/**
 * Durable Object holding one jam. Routes (all JSON):
 *   GET    /                 public state
 *   POST   /create           { name } -> host token
 *   POST   /join             { name } -> guest token
 *   POST   /queue            { token, track } add to queue
 *   POST   /play             { token, index? } host starts playback
 *   POST   /pause            { token }
 *   POST   /seek             { token, positionMs, index? } host reports progress
 *   POST   /skip             { token, direction }
 *   POST   /remove           { token, index }
 *   POST   /lock             { token, locked } host only
 *   POST   /message          { token, text }
 */
export class JamRoom {
  private state: JamState | null = null;

  /**
   * Persistence adapter. Durable Object storage uses `put`; some local
   * runtimes expose only `storage.storage.put` (sqlite-backed classes) or
   * nothing at all. Feature-detect once so a jam still works — the room is
   * ephemeral by design, so losing durability is acceptable, losing the
   * session is not.
   */
  private store: {
    get(): Promise<JamState | null>;
    put(value: JamState): Promise<void>;
    del(): Promise<void>;
  };

  constructor(storage: DurableObjectStorage) {
    const raw = (storage as unknown as { storage?: DurableObjectStorage }) ?? storage;
    const target: any = typeof (raw as any)?.put === 'function' ? raw : (raw as any)?.storage;
    const memory: { value: JamState | null } = { value: null };

    if (target && typeof target.put === 'function') {
      this.store = {
        get: async () => {
          const stored = await target.get('jam');
          return (stored as JamState | undefined) ?? null;
        },
        put: async (value) => {
          await target.put('jam', value);
        },
        del: async () => {
          await target.delete('jam');
        },
      };
    } else {
      this.store = {
        get: async () => memory.value,
        put: async (value) => {
          memory.value = value;
        },
        del: async () => {
          memory.value = null;
        },
      };
    }
  }

  private async load(): Promise<JamState | null> {
    if (this.state) {
      if (Date.now() - this.state.createdAt > JAM_TTL_MS) return null;
      return this.state;
    }
    const stored = await this.store.get();
    if (!stored) return null;
    if (Date.now() - stored.createdAt > JAM_TTL_MS) {
      await this.store.del();
      return null;
    }
    this.state = stored;
    return stored;
  }

  private async save(state: JamState): Promise<void> {
    this.state = prune(state);
    await this.store.put(this.state);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const route = url.pathname.replace(/^\/+/, '');
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });

    if (route === 'create') {
      const { name, code } = (await request.json().catch(() => ({}))) as {
        name?: string;
        code?: string;
      };
      const hostToken = newId();
      const state: JamState = {
        code: code ?? newCode(),
        hostName: (name ?? 'Host').slice(0, 24),
        hostToken,
        active: false,
        locked: false,
        queue: [],
        index: 0,
        positionMs: 0,
        updatedAt: Date.now(),
        members: { [hostToken]: { name: (name ?? 'Host').slice(0, 24), at: Date.now() } },
        messages: [],
        createdAt: Date.now(),
      };
      await this.save(state);
      return json({ hostToken, code: state.code, state: publicJam(this.state!) });
    }

    const state = await this.load();
    if (!state) return json({ error: 'jam-not-found' }, 404);

    if (route === '' || request.method === 'GET') {
      return json(publicJam(state));
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const token: string = body.token ?? '';
    const isHost = token === state.hostToken;

    // "Read" actions only need a valid token; anything that changes the queue
    // also respects the host's lock.
    const mutating = ['queue', 'skip', 'remove', 'play', 'pause', 'seek'].includes(route);
    if (route === 'join') {
      const guestToken = newId();
      const name = (body.name ?? 'Guest').toString().slice(0, 24);
      state.members[guestToken] = { name, at: Date.now() };
      await this.save(state);
      return json({ token: guestToken, state: publicJam(this.state!) });
    }

    const member = state.members[token];
    if (!member) return json({ error: 'bad-token' }, 401);
    member.at = Date.now();
    if (mutating && state.locked && !isHost) return json({ error: 'jam-locked' }, 403);

    switch (route) {
      case 'queue': {
        const track = body.track as JamTrack | undefined;
        if (track?.id && state.queue.length < MAX_QUEUE) {
          if (!state.queue.some((t) => t.id === track.id)) state.queue.push(track);
          // Adding to an idle jam starts it, so guests can kick things off.
          if (!state.active && state.queue.length === 1) {
            state.active = true;
            state.index = 0;
            state.positionMs = 0;
            state.updatedAt = Date.now();
          }
        }
        break;
      }
      case 'play': {
        if (typeof body.index === 'number') {
          state.index = Math.max(0, Math.min(body.index, Math.max(state.queue.length - 1, 0)));
          state.positionMs = 0;
        }
        state.active = true;
        state.updatedAt = Date.now();
        break;
      }
      case 'pause': {
        state.positionMs += Date.now() - state.updatedAt;
        state.active = false;
        state.updatedAt = Date.now();
        break;
      }
      case 'seek': {
        state.positionMs = Math.max(0, Number(body.positionMs) || 0);
        if (typeof body.index === 'number') {
          state.index = Math.max(0, Math.min(body.index, state.queue.length - 1));
        }
        state.updatedAt = Date.now();
        break;
      }
      case 'skip': {
        const dir = body.direction === 'prev' ? -1 : 1;
        if (state.queue.length) {
          state.index = Math.max(0, Math.min(state.index + dir, state.queue.length - 1));
          state.positionMs = 0;
          state.updatedAt = Date.now();
        }
        break;
      }
      case 'remove': {
        const i = Number(body.index);
        if (Number.isInteger(i) && i >= 0 && i < state.queue.length) {
          state.queue.splice(i, 1);
          if (i < state.index) state.index = Math.max(0, state.index - 1);
        }
        break;
      }
      case 'lock': {
        if (!isHost) return json({ error: 'host-only' }, 403);
        state.locked = Boolean(body.locked);
        break;
      }
      case 'message': {
        const text = String(body.text ?? '').trim().slice(0, 200);
        if (text) {
          state.messages.push({ id: newId(), author: member.name, text, at: Date.now() });
        }
        break;
      }
      default:
        return json({ error: 'unknown-route' }, 404);
    }

    await this.save(state);
    return json(publicJam(this.state!));
  }
}
