import type { Env } from './types';
import type { MusicProvider } from './providers/types';
import { DemoProvider } from './providers/demo';
import { providerChain } from './providers';
import { adBlockedResponse, isAdRequest } from './adblock';
import { handleStream } from './stream';
import { buildRadio } from './radio';
import { JamRoom, newCode } from './jam';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Short browser cache: catalogs are cheap to rebuild, and the Worker
      // itself caches upstreams.
      'Cache-Control': 'public, max-age=60',
      ...CORS,
    },
  });
}

/**
 * Run a call against each provider in the chain until one returns a
 * non-empty result. An empty result counts as a failure: unofficial APIs
 * frequently answer 200 with no items (stale client version, blocked
 * datacenter IP), which used to surface as "No results" in the app.
 */
async function withFallback<T>(
  chain: MusicProvider[],
  fn: (p: MusicProvider) => Promise<T>,
  isEmpty: (value: T) => boolean,
): Promise<{ value: T; provider: string }> {
  let lastValue: T | undefined;
  for (const provider of chain) {
    try {
      const value = await fn(provider);
      if (!isEmpty(value)) return { value, provider: provider.name };
      lastValue = value;
    } catch {
      // Try the next provider.
    }
  }
  if (lastValue !== undefined) return { value: lastValue, provider: 'empty' };
  // Last resort so the app never hard-fails.
  const demo = new DemoProvider();
  return { value: await fn(demo), provider: demo.name };
}

const itemListIsEmpty = <T,>(value: T) => Array.isArray(value) && value.length === 0;

/**
 * Playlists are only useful if they carry playable tracks: clients render
 * a playlist from `tracks` (YouTube/JioSaavn ids are not in the catalog).
 * A list of track-less playlists counts as empty so the chain continues.
 */
const playlistListIsEmpty = (value: unknown) =>
  !Array.isArray(value) ||
  value.length === 0 ||
  value.every((pl: any) => !Array.isArray(pl?.tracks) || pl.tracks.length === 0);
const isNullish = (value: unknown) => value === null || value === undefined;

/**
 * Dev fallback for jam rooms. Durable Objects require a binding (see
 * wrangler.toml); when it is absent — plain `wrangler dev`, tests — jams are
 * kept in module memory on the single local instance. Ephemeral by design,
 * and it keeps `npm run dev` fully usable without provisioning anything.
 */
const localRooms = new Map<string, JamRoom>();

function localJamFetch(request: Request, code: string): Promise<Response> {
  // Reuse one room instance per code so its in-memory state is kept when no
  // Durable Object binding is available (plain `wrangler dev`, tests).
  let room = localRooms.get(code);
  if (!room) {
    room = new JamRoom({} as unknown as DurableObjectStorage);
    localRooms.set(code, room);
  }
  return room.fetch(request);
}

export { JamRoom };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // Edge ad-blocker: drop ad/tracker requests before anything else runs.
    if (isAdRequest(url)) return adBlockedResponse(url);

    const chain = providerChain(env);
    const primary = chain[0];

    try {
      if (url.pathname === '/health') {
        return json({
          ok: true,
          app: env.APP_NAME,
          provider: primary.name,
          chain: chain.map((p) => p.name),
          adblock: 'enabled',
        });
      }

      if (url.pathname === '/api/catalog') {
        const { value } = await withFallback(chain, (p) => p.getCatalog(), itemListIsEmpty);
        return json(value);
      }

      if (url.pathname === '/api/playlists') {
        const { value } = await withFallback(chain, (p) => p.getPlaylists(), playlistListIsEmpty);
        return json(value);
      }

      if (url.pathname === '/api/search') {
        const q = (url.searchParams.get('q') ?? '').trim();
        if (!q) return json([]);
        const { value } = await withFallback(chain, (p) => p.search(q), itemListIsEmpty);
        return json(value);
      }

      const trackMatch = url.pathname.match(/^\/api\/track\/([^/]+)$/);
      if (trackMatch) {
        const id = decodeURIComponent(trackMatch[1]);
        const { value } = await withFallback(chain, (p) => p.getTrack(id), isNullish);
        return value ? json(value) : json({ error: 'track-not-found' }, 404);
      }

      const lyricsMatch = url.pathname.match(/^\/api\/lyrics\/([^/]+)$/);
      if (lyricsMatch) {
        const id = decodeURIComponent(lyricsMatch[1]);
        const { value } = await withFallback(chain, (p) => p.getLyrics(id), itemListIsEmpty);
        return json(value);
      }

      const streamMatch = url.pathname.match(/^\/api\/stream\/([^/]+)$/);
      if (streamMatch) {
        const id = decodeURIComponent(streamMatch[1]);
        // Stream from the provider that owns this id (YouTube ids are bare,
        // JioSaavn ids are prefixed `js:`), then fall back down the chain.
        const ordered = [...chain].sort((a, b) => {
          const owns = (p: MusicProvider) =>
            p.name === 'jiosaavn' ? id.startsWith('js:') : !id.startsWith('js:');
          return Number(owns(b)) - Number(owns(a));
        });
        for (const provider of ordered) {
          const res = await handleStream(request, provider, id, ctx);
          if (res.status !== 502) return res;
        }
        return json({ error: 'stream-unavailable' }, 502);
      }

      // Song radio — "play the next song in this lane, never the same one".
      if (url.pathname === '/api/radio') {
        const seedId = url.searchParams.get('seedId') ?? '';
        const seedTitle = url.searchParams.get('title') ?? '';
        const seedArtist = url.searchParams.get('artist') ?? '';
        if (!seedId && !seedTitle) return json([]);
        const exclude = (url.searchParams.get('exclude') ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const limit = Number(url.searchParams.get('limit') ?? 12);
        const tracks = await buildRadio(chain, {
          seedId,
          seedTitle,
          seedArtist,
          exclude,
          limit,
        });
        return json(tracks);
      }

      // ---- Muzii Jam (shared listening rooms) ----
      if (url.pathname === '/api/jam' && request.method === 'POST') {
        const body = (await request.json().catch(() => ({}))) as { name?: string };
        const code = newCode();
        const room = env.JAM_ROOMS ? env.JAM_ROOMS.get(env.JAM_ROOMS.idFromName(code)) : null;
        const roomRequest = new Request(`https://jam/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: body.name ?? 'Host', code }),
        });
        const res = room ? await room.fetch(roomRequest) : await localJamFetch(roomRequest, code);
        return new Response(res.body, {
          status: res.status,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      const jamMatch = url.pathname.match(/^\/api\/jam\/([A-Za-z0-9]+)(\/.*)?$/);
      if (jamMatch) {
        const code = jamMatch[1].toUpperCase();
        const sub = (jamMatch[2] ?? '').replace(/^\//, '');
        const room = env.JAM_ROOMS ? env.JAM_ROOMS.get(env.JAM_ROOMS.idFromName(code)) : null;
        const target = new Request(`https://jam/${sub}`, {
          method: request.method,
          headers: { 'Content-Type': 'application/json' },
          body: request.method === 'POST' ? await request.text() : undefined,
        });
        const res = room ? await room.fetch(target) : await localJamFetch(target, code);
        return new Response(res.body, {
          status: res.status,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      return json(
        {
          error: 'not-found',
          docs: 'GET /health | /api/catalog | /api/search?q= | /api/playlists | /api/track/:id | /api/stream/:id | /api/radio | /api/jam/:code',
        },
        404,
      );
    } catch (err) {
      return json({ error: 'internal', message: String(err) }, 500);
    }
  },
};
