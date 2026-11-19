import type { MusicProvider } from './types';
import type { Playlist, Track } from '../types';
import { cleanTitle } from '../radio';

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
/**
 * Per-host timeout. Kept short on purpose.
 *
 * The catalog fans out to 5 searches in parallel, and the web client gives up
 * after 12s. With 9s per host and 3 mirrors a single dead mirror could burn
 * 27s, so the client aborted *before* the Worker answered and silently fell
 * back to the 16 bundled demo tracks (the "SoundHelix" songs). 3.5s is
 * plenty for these APIs and leaves room for the whole fan-out.
 */
const TIMEOUT_MS = 3500;
/** A whole apiGet call (all mirrors) may not exceed this. */
const BUDGET_MS = 8000;

async function apiGet(path: string): Promise<any> {
  let lastError: unknown = null;
  const deadline = Date.now() + BUDGET_MS;
  for (const host of API_HOSTS) {
    const remaining = deadline - Date.now();
    if (remaining < 300) break; // out of budget: fail fast, don't stall
    try {
      const res = await fetch(`${host}${path}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, remaining)),
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

const GRADIENTS = [
  'linear-gradient(135deg,#FA2D48,#FC3C44)',
  'linear-gradient(135deg,#30D158,#0A84FF)',
  'linear-gradient(135deg,#BF5AF2,#5E5CE6)',
  'linear-gradient(135deg,#64D2FF,#30D158)',
];

const LANGUAGE_LABEL: Record<string, string> = {
  malayalam: 'Malayalam',
  tamil: 'Tamil',
  telugu: 'Telugu',
  hindi: 'Hindi',
  kannada: 'Kannada',
  punjabi: 'Punjabi',
  english: 'English',
  marathi: 'Marathi',
  bengali: 'Bengali',
};

/**
 * Build the home-screen shelves for the listener's languages.
 *
 * Previously these were four fixed English/Malayalam shelves regardless of
 * what the listener picked, so a Malayalam-only user still saw "Bollywood
 * Hits" and "Chill Vibes". Now each chosen language gets its own shelves and
 * nothing else is shown.
 */
function playlistsFor(languages: string[]): {
  id: string;
  title: string;
  description: string;
  query: string;
  gradient: string;
}[] {
  if (!languages.length) {
    return [
      { id: 'js-trending', title: 'Trending Now', description: 'What everyone is playing today.', query: 'trending hits', gradient: GRADIENTS[0] },
      { id: 'js-malayalam', title: 'Malayalam Melodies', description: 'Evergreen and modern Malayalam songs.', query: 'malayalam hit songs', gradient: GRADIENTS[1] },
      { id: 'js-hindi', title: 'Bollywood Hits', description: 'The biggest Hindi tracks.', query: 'hindi hit songs', gradient: GRADIENTS[2] },
      { id: 'js-chill', title: 'Chill Vibes', description: 'Mellow tunes for slow evenings.', query: 'chill acoustic', gradient: GRADIENTS[3] },
    ];
  }

  const out: ReturnType<typeof playlistsFor> = [];
  languages.slice(0, 4).forEach((lang, i) => {
    const label = LANGUAGE_LABEL[lang] ?? lang;
    const gradient = GRADIENTS[i % GRADIENTS.length];
    out.push({
      id: `js-${lang}-hits`,
      title: `${label} Hits`,
      description: `The biggest ${label} tracks right now.`,
      query: `${lang} hit songs`,
      gradient,
    });
    out.push({
      id: `js-${lang}-melody`,
      title: `${label} Melodies`,
      description: `Mellow, evergreen ${label} songs.`,
      query: `${lang} melody songs`,
      gradient: GRADIENTS[(i + 2) % GRADIENTS.length],
    });
  });
  return out;
}

export class JioSaavnProvider implements MusicProvider {
  readonly name = 'jiosaavn';

  /**
   * Search. Deliberately returns everything the catalog has: search is the
   * one place that is NOT language-scoped, because an explicit lookup should
   * always find the song.
   *
   * It does collapse versions of the same recording ("Innale (K.J.Yesudas)
   * (from "Balettan")", "Innale (K.J.Yesudas)", "Innale (Chithra)..."), which
   * otherwise filled the entire result list with one song. The keepers are
   * the entries with a real cover image, which tend to be the canonical ones.
   */
  async search(query: string): Promise<Track[]> {
    const data = await apiGet(`/search/songs?query=${encodeURIComponent(query)}&limit=30`);
    const tracks = collectResults(data)
      .map(toTrack)
      .filter((t): t is Track => t !== null);

    const best = new Map<string, Track>();
    for (const track of tracks) {
      const key = cleanTitle(track.title);
      const existing = best.get(key);
      if (!existing) {
        best.set(key, track);
        continue;
      }
      // Prefer a version with artwork, and the longer (full) recording.
      const score = (t: Track) => (t.artworkUrl ? 2 : 0) + (t.durationSec > 90 ? 1 : 0);
      if (score(track) > score(existing)) best.set(key, track);
    }
    return [...best.values()];
  }

  async getCatalog(languages: string[] = []): Promise<Track[]> {
    // Scope the shelves to the languages the listener picked. With no
    // preference we still return a broad mix so nothing looks empty.
    const queries = languages.length
      ? languages.flatMap((lang) => [`${lang} hit songs`, `${lang} melody songs`])
      : ['top hits 2025', 'malayalam hits', 'hindi hits', 'tamil hits', 'punjabi hits'];
    const batches = await Promise.all(
      // Cap the fan-out: 2 queries per language, at most 6 total, or a
      // 9-language picker would fire 18 searches and blow the timeout.
      [...new Set(queries)].slice(0, 6).map((q) =>
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

  async getPlaylists(languages: string[] = []): Promise<Playlist[]> {
    const defs = playlistsFor(languages);
    const batches = await Promise.all(
      defs.map((def) => this.search(def.query).catch(() => [] as Track[])),
    );
    return defs.map((def, i) => {
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
