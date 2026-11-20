import type { Track } from '../api/types';

/**
 * The listener's own playlists — created, renamed, filled and reordered here,
 * on this device.
 *
 * Why local and not on the Worker: there is no account, so there is nothing to
 * key server-side storage to. A signed and rotating cookie id would be the
 * alternative, but it buys cross-device sync for a lot of machinery — and this
 * app already treats "yours" as local (likes, dislikes, the play log).
 *
 * Storage mirrors the taste profile's approach: one localStorage key, written
 * on every change, read back on boot. localStorage (not a cookie) because a
 * playlist holds whatever songs you put in it and would blow the 4KB
 * per-cookie limit instantly. Playlists are also *not* needed by the Worker
 * the way the taste profile is — nothing server-side reads them.
 *
 * The one rule that matters: a playlist stores **whole Tracks**, not ids.
 * Ids from an imported list belong to another app (or to a demo fallback),
 * and a playlist that can only render its songs while the original search
 * results happen to still be in memory is a playlist that looks empty on
 * reload.
 */

const STORAGE_KEY = 'muzii_playlists_v1';


export interface UserPlaylist {
  id: string;
  title: string;
  /** Free-text, optional. Shown under the title on the detail page. */
  description: string;
  tracks: Track[];
  /** CSS gradient for the artwork tile (kept consistent with provider lists). */
  gradient: string;
  createdAt: number;
  updatedAt: number;
  /** Where the songs came from, when the list was imported. */
  importedFrom?: string;
}

export const PLAYLIST_GRADIENTS = [
  'linear-gradient(135deg,#FA2D48,#FC3C44)',
  'linear-gradient(135deg,#5E5CE6,#BF5AF2)',
  'linear-gradient(135deg,#30D158,#0A84FF)',
  'linear-gradient(135deg,#FF9F0A,#FF375F)',
  'linear-gradient(135deg,#64D2FF,#30D158)',
  'linear-gradient(135deg,#BF5AF2,#64D2FF)',
];

/** A fresh id. `crypto.randomUUID` is missing on older iOS Safari. */
function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return `upl-${c.randomUUID()}`;
  return `upl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function gradientFor(seedText: string): string {
  const n = [...seedText].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return PLAYLIST_GRADIENTS[n % PLAYLIST_GRADIENTS.length];
}

/**
 * Normalise a stored track.
 *
 * Older/partial writes and imported entries may miss fields the player needs
 * (durationSec, gradientSeed). Fill them here rather than letting the row
 * render "NaN:NaN" or a black artwork tile.
 */
function normaliseTrack(raw: unknown): Track | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Partial<Track>;
  if (!t.id || !t.title) return null;
  return {
    id: String(t.id),
    title: String(t.title),
    artist: t.artist ? String(t.artist) : 'Unknown Artist',
    album: t.album ? String(t.album) : '',
    durationSec: Number.isFinite(t.durationSec) ? Number(t.durationSec) : 0,
    streamUrl: typeof t.streamUrl === 'string' ? t.streamUrl : '',
    artworkUrl: typeof t.artworkUrl === 'string' ? t.artworkUrl : '',
    gradientSeed:
      typeof t.gradientSeed === 'number' && Number.isFinite(t.gradientSeed)
        ? t.gradientSeed
        : [...String(t.id)].reduce((a, c) => a + c.charCodeAt(0), 0) % 360,
    ...(t.language ? { language: String(t.language) } : {}),
    ...(typeof t.year === 'number' ? { year: t.year } : {}),
    ...(t.composer ? { composer: String(t.composer) } : {}),
  };
}

export function loadPlaylists(): UserPlaylist[] {
  if (typeof window === 'undefined') return [];
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode / storage disabled. An empty library is the honest result;
    // writes below will fail the same way and leave the in-memory copy intact.
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: UserPlaylist[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const p = item as Partial<UserPlaylist>;
      if (!p.id || !p.title) continue;
      const tracks = Array.isArray(p.tracks)
        ? p.tracks.map(normaliseTrack).filter((t): t is Track => t !== null)
        : [];
      out.push({
        id: String(p.id),
        title: String(p.title),
        description: typeof p.description === 'string' ? p.description : '',
        tracks,
        gradient: typeof p.gradient === 'string' ? p.gradient : gradientFor(String(p.id)),
        createdAt: Number.isFinite(p.createdAt) ? Number(p.createdAt) : Date.now(),
        updatedAt: Number.isFinite(p.updatedAt) ? Number(p.updatedAt) : Date.now(),
        ...(p.importedFrom ? { importedFrom: String(p.importedFrom) } : {}),
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function savePlaylists(playlists: UserPlaylist[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
    return true;
  } catch {
    /*
     * Storage can be full or disabled. The caller keeps the previous state
     * and reports the failure; no playlist is silently truncated or saved.
     */
    return false;
  }
}

/** Build a new playlist. Pure, so the caller decides when to persist. */
export function blankPlaylist(
  title: string,
  opts: { description?: string; tracks?: Track[]; importedFrom?: string } = {},
): UserPlaylist {
  const id = newId();
  const now = Date.now();
  return {
    id,
    title: title.trim() || 'New playlist',
    description: (opts.description ?? '').trim(),
    tracks: [...(opts.tracks ?? [])],
    gradient: gradientFor(id + title),
    createdAt: now,
    updatedAt: now,
    ...(opts.importedFrom ? { importedFrom: opts.importedFrom } : {}),
  };
}

/**
 * Identity used for "is this song already in the list?".
 *
 * Keyed on cleaned title, not id: the catalogue returns the same recording
 * under several ids (and an imported one carries an `ext:` id entirely), so
 * id comparison lets the same song in twice — the exact duplicate bug the
 * queue already had to fix.
 */
function songKeyOf(track: Track): string {
  return track.title
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s-\s.*$/, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function playlistHas(playlist: UserPlaylist, track: Track): boolean {
  const key = songKeyOf(track);
  if (!key) return playlist.tracks.some((t) => t.id === track.id);
  return playlist.tracks.some((t) => songKeyOf(t) === key);
}

/** Append, skipping duplicates. Returns null when nothing was added. */
export function withTrackAdded(playlist: UserPlaylist, track: Track): UserPlaylist | null {
  if (playlistHas(playlist, track)) return null;
  return { ...playlist, tracks: [...playlist.tracks, track], updatedAt: Date.now() };
}

/** Append many, skipping duplicates within the input as well. */
export function withTracksAdded(playlist: UserPlaylist, tracks: Track[]): UserPlaylist {
  let next = playlist;
  for (const track of tracks) {
    const added = withTrackAdded(next, track);
    if (added) next = added;
  }
  return next;
}

export function withTrackRemoved(playlist: UserPlaylist, trackId: string): UserPlaylist {
  return {
    ...playlist,
    tracks: playlist.tracks.filter((t) => t.id !== trackId),
    updatedAt: Date.now(),
  };
}

export function withTrackMoved(playlist: UserPlaylist, from: number, to: number): UserPlaylist {
  if (from === to) return playlist;
  const tracks = [...playlist.tracks];
  if (from < 0 || from >= tracks.length) return playlist;
  const clamped = Math.max(0, Math.min(tracks.length - 1, to));
  const [item] = tracks.splice(from, 1);
  tracks.splice(clamped, 0, item);
  return { ...playlist, tracks, updatedAt: Date.now() };
}

/** Sort count used by the Library tile; cheap and always accurate. */
export function playlistLength(playlist: UserPlaylist): number {
  return playlist.tracks.length;
}

/** How long the whole playlist runs, for the detail-page meta line. */
export function playlistDurationSec(playlist: UserPlaylist): number {
  return playlist.tracks.reduce((sum, t) => sum + (Number.isFinite(t.durationSec) ? t.durationSec : 0), 0);
}
