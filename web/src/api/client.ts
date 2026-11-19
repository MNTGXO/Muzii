import type { JamState, Playlist, Track } from './types';
import { DEMO_PLAYLISTS, DEMO_TRACKS } from '../data/demo';
import { fetchWithAdBlock } from '../adblock/blocker';

/**
 * API client for the Muzii Cloudflare Worker.
 * Falls back to the bundled demo catalog when the Worker is unreachable
 * (e.g. local preview without `wrangler dev`), so the app always works.
 *
 * API_BASE is empty in production: requests go to same-origin `/api/*`,
 * which Cloudflare Pages proxies to the Worker via `_redirects`
 * (generated at deploy time). VITE_API_BASE_URL can override with an
 * absolute Worker URL.
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

const REQUEST_TIMEOUT_MS = 12_000;

async function apiFetch<T>(path: string): Promise<T> {
  const candidates = API_BASE ? [`${API_BASE}${path}`, path] : [path];
  let lastError: unknown = null;
  for (const url of candidates) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetchWithAdBlock(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error(`API ${path} failed`);
}

export async function getCatalog(): Promise<Track[]> {
  try {
    return await apiFetch<Track[]>('/api/catalog');
  } catch {
    return DEMO_TRACKS;
  }
}

export async function searchTracks(q: string): Promise<Track[]> {
  const query = q.trim();
  if (!query) return [];
  try {
    return await apiFetch<Track[]>(`/api/search?q=${encodeURIComponent(query)}`);
  } catch {
    const s = query.toLowerCase();
    return DEMO_TRACKS.filter((t) =>
      [t.title, t.artist, t.album].join(' ').toLowerCase().includes(s),
    );
  }
}

/**
 * Playlists, scoped to the onboarding languages when given. The Worker builds
 * them from the same language list, so a Malayalam-only listener no longer
 * gets "Bollywood Hits" and "Chill Vibes" on their home screen.
 */
export async function getPlaylists(languages: string[] = []): Promise<Playlist[]> {
  const langs = languages.filter(Boolean);
  const qs = langs.length ? `?languages=${encodeURIComponent(langs.join(','))}` : '';
  try {
    return await apiFetch<Playlist[]>(`/api/playlists${qs}`);
  } catch {
    return DEMO_PLAYLISTS;
  }
}

/** Fetch a single track by id (used to resolve playlist tracks). */
export async function getTrack(id: string): Promise<Track | null> {
  try {
    return await apiFetch<Track>(`/api/track/${encodeURIComponent(id)}`);
  } catch {
    return DEMO_TRACKS.find((t) => t.id === id) ?? null;
  }
}

/**
 * Stream URL — always same-origin `/api/stream/:id` when no explicit Worker
 * URL is configured: Cloudflare Pages proxies it to the Worker via
 * `_redirects`, so there is no cross-origin/CORS hop. YouTube and JioSaavn
 * tracks have no usable direct URL (id-only, resolved server-side), so the
 * proxy is the only playable path; PlayerContext retries with the track's
 * own URL if that fails (works for demo tracks).
 */
export function streamUrl(track: Track): string {
  return `${API_BASE}/api/stream/${encodeURIComponent(track.id)}`;
}

// ---------------------------------------------------------------------------
// Song radio
// ---------------------------------------------------------------------------

/**
 * Ask the Worker for "what should play after this song" — same artist / same
 * vibe, never the seed and never anything already played this session.
 * Returns [] when the backend can't help; the player then falls back to the
 * locally loaded catalog (with the same no-repeat rules applied client-side).
 */
export async function getRadio(
  seed: Track,
  exclude: string[],
  limit = 12,
  /**
   * Taste profile + language lock. Sent as query params so the Worker can
   * filter disliked songs and keep the station in the seed's language.
   */
  taste?: URLSearchParams,
): Promise<Track[]> {
  const params = new URLSearchParams({
    seedId: seed.id,
    title: seed.title,
    artist: seed.artist,
    limit: String(limit),
  });
  // Seed metadata is what makes the station stay in its lane.
  if (seed.language) params.set('lang', seed.language);
  if (seed.composer) params.set('composer', seed.composer);
  if (seed.year) params.set('year', String(seed.year));
  if (exclude.length) params.set('exclude', exclude.slice(-40).join(','));
  taste?.forEach((value, key) => {
    if (value) params.set(key, value);
  });
  try {
    return await apiFetch<Track[]>(`/api/radio?${params.toString()}`);
  } catch {
    return [];
  }
}

/**
 * Language-scoped catalog for the home feed. Falls back to the unfiltered
 * catalog if the Worker can't scope it, so the feed is never empty.
 */
export async function getCatalogForLanguages(languages: string[]): Promise<Track[]> {
  const langs = languages.filter(Boolean);
  if (!langs.length) return getCatalog();
  try {
    const params = new URLSearchParams({ languages: langs.join(',') });
    return await apiFetch<Track[]>(`/api/catalog?${params.toString()}`);
  } catch {
    return getCatalog();
  }
}

// ---------------------------------------------------------------------------
// Muzii Jam (shared listening rooms)
// ---------------------------------------------------------------------------

export interface JamSession {
  state: JamState;
  token: string;
}

async function jamPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetchWithAdBlock(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? `jam request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

/**
 * Create a jam room, optionally seeded with the host's current queue.
 *
 * Seeding is what lets "start a jam" work from inside the player: the room
 * adopts the songs you were already listening to, and the exact position, so
 * guests drop into the same moment rather than an empty queue.
 */
export async function createJam(
  name: string,
  seed?: { queue?: Track[]; index?: number; positionMs?: number },
): Promise<JamSession> {
  const data = await jamPost<{ hostToken: string; code: string; state: JamState }>(
    '/api/jam',
    { name, ...(seed ?? {}) },
  );
  return { token: data.hostToken, state: data.state };
}

export async function joinJam(code: string, name: string): Promise<JamSession> {
  const data = await jamPost<{ token: string; state: JamState }>(
    `/api/jam/${code}/join`,
    { name },
  );
  return { token: data.token, state: data.state };
}

export async function getJam(code: string, token?: string | null): Promise<JamState> {
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  const res = await fetchWithAdBlock(`${API_BASE}/api/jam/${code}${qs}`);
  if (!res.ok) throw new Error('jam-not-found');
  return (await res.json()) as JamState;
}

export async function jamAction<T = JamState>(
  code: string,
  action: string,
  body: Record<string, unknown>,
): Promise<T> {
  return jamPost<T>(`/api/jam/${code}/${action}`, body);
}
