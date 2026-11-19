import type { MusicProvider } from './types';
import type { Playlist, Track } from '../types';

/**
 * JioSaavn provider (unofficial public web API).
 *
 * Why this exists alongside YouTube Music:
 * YouTube refuses most InnerTube player calls made from datacenter IPs
 * (Cloudflare Workers included) and its `googlevideo` media URLs are bound to
 * the IP that minted them — so from a Worker both search and playback are
 * unreliable. JioSaavn's API answers plain JSON and returns `cdn` links on a
 * public CDN that are NOT IP-bound, so the Worker can actually proxy audio.
 *
 * Catalog: JioSaavn is the deepest source for Indian-language music
 * (Hindi, Malayalam, Tamil, Telugu, Punjabi…), which is what this app's
 * users search for, plus a large western catalog.
 *
 * Reliability notes:
 * - Endpoint is unofficial; `saavn.dev` is a community mirror of it. If it
 *   stops answering, index.ts falls back to the next provider in the chain.
 * - Album art comes in `50x50`/`150x150`/`500x500` variants; the size token
 *   is replaced with 500x500 for display.
 */

/**
 * Public mirrors of the JioSaavn REST API. All of them speak the same
 * `{ success, data }` envelope; the first one that answers wins, so one dead
 * host cannot take the provider down.
 */
const API_HOSTS = [
  'https://saavn.dev/api',
  'https://jio.shnwaz.dev/api',
  'https://saavn.sumit.co/api',
];
const TIMEOUT_MS = 9000;

async function apiGet(path: string): Promise<any> {
  let lastError: unknown = null;
  for (const host of API_HOSTS) {
    try {
      const res = await fetch(`${host}${path}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`${host}${path} -> ${res.status}`);
      return (await res.json()) as any;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('JioSaavn unreachable');
}

function pickString(value: unknown): string {
  // The API returns strings, `{ text }`, `{ name }`, or arrays of those
  // (e.g. `artists.primary: [{ name }]`, `image: [{ quality, url }]`).
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(pickString).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    const obj = value as { text?: unknown; name?: unknown; title?: unknown };
    if (typeof obj.text === 'string' && obj.text) return obj.text;
    if (typeof obj.name === 'string' && obj.name) return obj.name;
    if (typeof obj.title === 'string' && obj.title) return obj.title;
  }
  return '';
}

function bigArtwork(url: string): string {
  if (!url) return '';
  return url.replace(/50x50|150x150/, '500x500');
}

/** `image: [{ quality: '500x500', url }]` → best URL. */
function pickImage(value: unknown): string {
  if (typeof value === 'string') return bigArtwork(value);
  if (!Array.isArray(value)) return '';
  const items = value.filter(
    (v): v is { quality?: string; url?: string } => !!v && typeof v === 'object',
  );
  const best =
    items.find((i) => i.quality === '500x500') ??
    items.find((i) => i.quality === '150x150') ??
    items[items.length - 1];
  return typeof best?.url === 'string' ? bigArtwork(best.url) : '';
}

/** `downloadUrl: [{ quality: '320kbps', url }]` → best URL. */
function pickDownloadUrl(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return undefined;
  const items = value.filter(
    (v): v is { quality?: string; url?: string } => !!v && typeof v === 'object',
  );
  const best =
    items.find((i) => i.quality === '320kbps') ??
    items.find((i) => i.quality === '160kbps') ??
    items[items.length - 1];
  return typeof best?.url === 'string' ? best.url : undefined;
}

/**
 * JioSaavn exposes a `language` field (lowercase, e.g. "malayalam"), and
 * sometimes `year` and `music`/`composer`. They are the best "same feel"
 * signals the catalog gives us, so surface them on the Track.
 */
function pickLanguage(song: any): string | undefined {
  const raw = pickString(song?.language).trim().toLowerCase();
  if (!raw) return undefined;
  // The API sometimes returns "hindi,english" or "unknown".
  const first = raw.split(/[,/|]/)[0]?.trim();
  return first && first !== 'unknown' ? first : undefined;
}

function pickYear(song: any): number | undefined {
  const raw = Number(song?.year ?? song?.releaseDate?.split?.('-')?.[0]);
  return Number.isFinite(raw) && raw > 1900 && raw < 2100 ? raw : undefined;
}

function pickComposer(song: any): string | undefined {
  const raw =
    pickString(song?.music) ||
    pickString(song?.composer) ||
    pickString(song?.musicDirector);
  return raw.trim() || undefined;
}

function toTrack(song: any): Track | null {
  const id: string | undefined = song?.id;
  const url = pickDownloadUrl(song?.downloadUrl) ?? pickDownloadUrl(song?.media_url);
  if (!id || !url) return null;

  const title = pickString(song.name) || pickString(song.title) || 'Unknown title';
  const artist = pickString(song.artists?.primary) || pickString(song.primaryArtists) || 'Unknown Artist';
  const album = pickString(song.album);
  const duration = Number(song.duration ?? 0);

  return {
    id: `js:${id}`,
    title: title.replace(/&quot;/g, '"').replace(/&amp;/g, '&'),
    artist,
    album,
    durationSec: Number.isFinite(duration) ? duration : 0,
    // Resolved lazily at stream time — JioSaavn links expire after a while.
    streamUrl: `jiosaavn://${id}`,
    artworkUrl: pickImage(song.image),
    gradientSeed: [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360,
    ...(() => {
      const language = pickLanguage(song);
      const year = pickYear(song);
      const composer = pickComposer(song);
      // Only set the keys when known: keeps the JSON small (this is a
      // 12KB-ish payload per search already) and lets clients treat
      // `undefined` as "unknown" rather than "".
      return {
        ...(language ? { language } : {}),
        ...(year ? { year } : {}),
        ...(composer ? { composer } : {}),
      };
    })(),
  };
}

function collectResults(data: any): any[] {
  const songs =
    data?.data?.results ??
    data?.data?.songs?.results ??
    data?.results ??
    data?.songs?.results;
  return Array.isArray(songs) ? songs : [];
}

const PLAYLISTS = [
  { id: 'js-trending', title: 'Trending Now', description: 'What everyone is playing today.', query: 'trending hits', gradient: 'linear-gradient(135deg,#FA2D48,#FC3C44)' },
  { id: 'js-malayalam', title: 'Malayalam Melodies', description: 'Evergreen and modern Malayalam songs.', query: 'malayalam hit songs', gradient: 'linear-gradient(135deg,#30D158,#0A84FF)' },
  { id: 'js-hindi', title: 'Bollywood Hits', description: 'The biggest Hindi tracks.', query: 'hindi hit songs', gradient: 'linear-gradient(135deg,#BF5AF2,#5E5CE6)' },
  { id: 'js-chill', title: 'Chill Vibes', description: 'Mellow tunes for slow evenings.', query: 'chill acoustic', gradient: 'linear-gradient(135deg,#64D2FF,#30D158)' },
];

export class JioSaavnProvider implements MusicProvider {
  readonly name = 'jiosaavn';

  async search(query: string): Promise<Track[]> {
    const data = await apiGet(`/search/songs?query=${encodeURIComponent(query)}&limit=30`);
    return collectResults(data)
      .map(toTrack)
      .filter((t): t is Track => t !== null);
  }

  async getCatalog(): Promise<Track[]> {
    const batches = await Promise.all(
      ['top hits 2025', 'malayalam hits', 'hindi hits', 'tamil hits', 'punjabi hits'].map((q) =>
        this.search(q).catch(() => [] as Track[]),
      ),
    );
    const seen = new Set<string>();
    const tracks: Track[] = [];
    for (const batch of batches) {
      for (const t of batch) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          tracks.push(t);
        }
      }
    }
    return tracks;
  }

  async getTrack(id: string): Promise<Track | null> {
    const songId = id.startsWith('js:') ? id.slice(3) : id;
    try {
      const data = await apiGet(`/songs/${encodeURIComponent(songId)}`);
      const song = Array.isArray(data?.data) ? data.data[0] : data?.data;
      return song ? toTrack(song) : null;
    } catch {
      return null;
    }
  }

  async getPlaylists(): Promise<Playlist[]> {
    const batches = await Promise.all(
      PLAYLISTS.map((def) => this.search(def.query).catch(() => [] as Track[])),
    );
    return PLAYLISTS.map((def, i) => {
      const tracks = batches[i].slice(0, 12);
      return {
        id: def.id,
        title: def.title,
        description: def.description,
        trackIds: tracks.map((t) => t.id),
        tracks,
        gradient: def.gradient,
      };
    });
  }

  async getLyrics(): Promise<string[]> {
    return [];
  }

  /** Fresh CDN URL for a song id — these links are not IP-bound. */
  async resolveStreamUrl(id: string): Promise<string | null> {
    const songId = id.startsWith('js:') ? id.slice(3) : id;
    try {
      const data = await apiGet(`/songs/${encodeURIComponent(songId)}`);
      const song = Array.isArray(data?.data) ? data.data[0] : data?.data;
      return pickDownloadUrl(song?.downloadUrl) ?? pickDownloadUrl(song?.media_url) ?? null;
    } catch {
      return null;
    }
  }
}
