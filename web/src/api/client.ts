import type { Playlist, Track } from './types';
import { DEMO_PLAYLISTS, DEMO_TRACKS } from '../data/demo';
import { fetchWithAdBlock } from '../adblock/blocker';

/**
 * API client for the Muzii Cloudflare Worker.
 * Falls back to the bundled demo catalog when the Worker is unreachable
 * (e.g. local preview without `wrangler dev`), so the app always works.
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetchWithAdBlock(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export async function getCatalog(): Promise<Track[]> {
  try {
    return await apiFetch<Track[]>('/api/catalog');
  } catch {
    return DEMO_TRACKS;
  }
}

export async function searchTracks(q: string): Promise<Track[]> {
  try {
    return await apiFetch<Track[]>(`/api/search?q=${encodeURIComponent(q)}`);
  } catch {
    const s = q.toLowerCase();
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

/** Stream URL — proxied through the Worker (range + cache + ad-block) when available. */
export function streamUrl(track: Track): string {
  return API_BASE ? `${API_BASE}/api/stream/${track.id}` : track.streamUrl;
}
