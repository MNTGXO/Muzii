import type { Playlist, Track } from './types';
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

export async function getPlaylists(): Promise<Playlist[]> {
  try {
    return await apiFetch<Playlist[]>('/api/playlists');
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
