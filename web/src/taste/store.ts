import type { Track } from '../api/types';

/**
 * The listener's taste profile, persisted in first-party cookies.
 *
 * Why cookies and not just localStorage: the Worker reads the same profile
 * to shape the radio, and cookies ride along on same-origin /api/* requests
 * automatically (Pages proxies those to the Worker). So the taste you build
 * on your phone follows the requests with no extra plumbing.
 *
 * ---- why this file got complicated -------------------------------------
 * The first version wrote the *whole* Track object for up to 40 liked and 40
 * disliked songs into a single cookie. A real JioSaavn track serialises to
 * ~327 bytes, so the payload reached ~26KB against the browser's ~4KB
 * per-cookie limit. Browsers drop oversized `document.cookie` writes without
 * throwing, so `persist()`'s try/catch never fired: likes silently stopped
 * saving after roughly 11 of them and nothing ever told the listener.
 *
 * The fix has three parts:
 *   1. Lean records - only the fields a card can render (id, title, artist,
 *      artwork) plus a compact play log. No stream URLs, no albums.
 *   2. Sharding - the payload is split across numbered cookies so the total
 *      budget is ~28KB instead of 4KB.
 *   3. Verification - every write is read back. If the browser refused it
 *      (cookies disabled, quota, private mode) the same payload is mirrored
 *      to localStorage and loaded from there next time. Storage failure is
 *      now a fallback, never a silent data loss.
 */

const BASE_COOKIE = 'muzii_taste';
const CHUNK_PREFIX = 'muzii_taste_';
const FALLBACK_KEY = 'muzii_taste_fallback';

/**
 * Browsers cap one cookie at ~4096 bytes *of the encoded value*, so the
 * budget is measured after encodeURIComponent - a JSON payload of quotes and
 * commas triples in size once encoded, which is what made a raw-character
 * split silently overflow and fall back.
 */
const CHUNK_ENCODED_BUDGET = 3200;
/** Ceiling on shards: 12 x 3.2KB ~= 38KB of profile. */
const MAX_CHUNKS = 12;
/** Hard ceiling for the whole serialised profile, before encoding. */
const PAYLOAD_BUDGET = 20_000;
const MAX_AGE = 60 * 60 * 24 * 365;

/** How many liked/disliked songs we keep as renderable records. */
const MAX_LIKED = 200;
const MAX_DISLIKED = 200;
/** Recent listens kept for "Recently played" / "On repeat". */
const MAX_PLAYS = 60;

export interface PlayEntry {
  /** Track id. */
  id: string;
  /** Number of completed listens. */
  count: number;
  /** Epoch ms of the most recent listen. */
  at: number;
  title: string;
  artist: string;
  artworkUrl: string;
  /** Language, so the home feed can stay in the listener's lanes. */
  language?: string;
}

export interface TasteSnapshot {
  like: string[];
  dislike: string[];
  /** Language codes picked at onboarding, e.g. ['malayalam', 'tamil']. */
  lang: string[];
  /** Lean records for liked/disliked ids, so cards can render offline. */
  liked: Track[];
  disliked: Track[];
  /** Every track the listener has actually listened to, most recent last. */
  plays: PlayEntry[];
  /** True once the listener has completed (or skipped) onboarding. */
  onboarded: boolean;
}

const EMPTY: TasteSnapshot = {
  like: [],
  dislike: [],
  lang: [],
  liked: [],
  disliked: [],
  plays: [],
  onboarded: false,
};

/* -------------------------------------------------------------------------
 * Cookie plumbing
 * ---------------------------------------------------------------------- */

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${MAX_AGE}; SameSite=Lax`;
}

function deleteCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

/** localStorage mirror, used when cookies won't hold the profile. */
function readFallback(): string | null {
  try {
    return window.localStorage.getItem(FALLBACK_KEY);
  } catch {
    return null;
  }
}

function writeFallback(value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(FALLBACK_KEY);
    else window.localStorage.setItem(FALLBACK_KEY, value);
  } catch {
    /* private mode - nothing more we can do */
  }
}

/**
 * Split a string into cookie-sized pieces and write them, then **read them
 * back**: a browser that rejects the write (too large, cookies off) is
 * detected here rather than discovered as missing likes a week later.
 *
 * Returns true only when the round-trip matched.
 */
/**
 * Split by *encoded* size: each shard must survive encodeURIComponent and
 * still fit one cookie. Encoding is monotonic in length, so a running total
 * avoids re-encoding the whole shard for every character.
 */
function chunkByEncodedSize(payload: string): string[] {
  const chunks: string[] = [];
  let current = '';
  let encoded = 0;
  for (const ch of payload) {
    const cost = encodeURIComponent(ch).length;
    if (encoded + cost > CHUNK_ENCODED_BUDGET && current) {
      chunks.push(current);
      current = ch;
      encoded = cost;
    } else {
      current += ch;
      encoded += cost;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function writeSharded(payload: string): boolean {
  const chunks = chunkByEncodedSize(payload);
  if (chunks.length > MAX_CHUNKS) return false;

  // Announce the new count first so a reader never sees stale extra chunks.
  writeCookie(BASE_COOKIE, String(chunks.length));
  chunks.forEach((chunk, i) => writeCookie(`${CHUNK_PREFIX}${i}`, chunk));
  // Drop shards left over from a larger previous payload.
  for (let i = chunks.length; i < MAX_CHUNKS; i++) deleteCookie(`${CHUNK_PREFIX}${i}`);

  const count = Number(readCookie(BASE_COOKIE));
  if (!Number.isFinite(count) || count !== chunks.length) return false;
  for (let i = 0; i < count; i++) {
    if (readCookie(`${CHUNK_PREFIX}${i}`) !== chunks[i]) return false;
  }
  return true;
}

function readSharded(): string | null {
  const raw = readCookie(BASE_COOKIE);
  if (!raw) return null;
  const count = Number(raw);
  if (!Number.isFinite(count) || count <= 0) return null;
  let out = '';
  for (let i = 0; i < count; i++) {
    const chunk = readCookie(`${CHUNK_PREFIX}${i}`);
    if (chunk === null) return null;
    out += chunk;
  }
  return out;
}

/* -------------------------------------------------------------------------
 * Serialisation
 * ---------------------------------------------------------------------- */

/** Compact record: five fields, short keys, no empty values. */
type LeanRecord = { i: string; t: string; a: string; r?: string; g?: string };

interface StoredProfile {
  g?: string[];
  o?: boolean;
  l?: string[];
  d?: string[];
  ld?: LeanRecord[];
  dd?: LeanRecord[];
  /** [id, count, atMs, title, artist, artwork, language|null] tuples. */
  p?: (string | number | null)[][];
}

function lean(track: Track): LeanRecord {
  const rec: LeanRecord = { i: track.id, t: track.title, a: track.artist };
  if (track.artworkUrl) rec.r = track.artworkUrl;
  if (track.language) rec.g = track.language;
  return rec;
}

function inflate(rec: LeanRecord): Track {
  return {
    id: rec.i,
    title: rec.t,
    artist: rec.a,
    album: '',
    durationSec: 0,
    streamUrl: '',
    artworkUrl: rec.r ?? '',
    // Stable hue per id so the gradient placeholder matches the real card.
    gradientSeed: [...rec.i].reduce((a, c) => a + c.charCodeAt(0), 0) % 360,
    ...(rec.g ? { language: rec.g } : {}),
  };
}

/** Drop the oldest plays so the payload never outgrows the shard budget. */
function trimPlays(plays: PlayEntry[]): PlayEntry[] {
  return plays.slice(-MAX_PLAYS);
}

function serialise(taste: TasteSnapshot): string {
  const stored: StoredProfile = {
    g: taste.lang,
    o: taste.onboarded,
    l: taste.like.slice(-MAX_LIKED),
    d: taste.dislike.slice(-MAX_DISLIKED),
    ld: taste.liked.slice(-40).map(lean),
    dd: taste.disliked.slice(-40).map(lean),
    p: trimPlays(taste.plays).map((e) => [
      e.id,
      e.count,
      e.at,
      e.title,
      e.artist,
      e.artworkUrl,
      e.language ?? null,
    ]),
  };
  return JSON.stringify(stored);
}

function deserialise(raw: string): TasteSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as StoredProfile;
    const plays = Array.isArray(parsed.p)
      ? parsed.p
          .map((row) => {
            if (!Array.isArray(row) || !row[0]) return null;
            return {
              id: String(row[0]),
              count: Number(row[1]) || 1,
              at: Number(row[2]) || 0,
              title: String(row[3] ?? 'Unknown title'),
              artist: String(row[4] ?? 'Unknown Artist'),
              artworkUrl: String(row[5] ?? ''),
              ...(row[6] ? { language: String(row[6]) } : {}),
            } satisfies PlayEntry;
          })
          .filter((e): e is PlayEntry => e !== null)
      : [];
    return {
      like: Array.isArray(parsed.l) ? parsed.l : [],
      dislike: Array.isArray(parsed.d) ? parsed.d : [],
      lang: Array.isArray(parsed.g) ? parsed.g : [],
      liked: Array.isArray(parsed.ld) ? parsed.ld.map(inflate) : [],
      disliked: Array.isArray(parsed.dd) ? parsed.dd.map(inflate) : [],
      plays,
      onboarded: Boolean(parsed.o),
    };
  } catch {
    return null;
  }
}

export function loadTaste(): TasteSnapshot {
  // Cookie first (the documented home of the profile), then the mirror.
  const fromCookie = readSharded();
  const cookieTaste = fromCookie ? deserialise(fromCookie) : null;
  if (cookieTaste) return cookieTaste;

  const fromFallback = readFallback();
  const fallbackTaste = fromFallback ? deserialise(fromFallback) : null;
  if (fallbackTaste) return fallbackTaste;

  // One-time migration from the pre-sharding single-cookie format, which
  // stored the profile as a plain JSON object in `muzii_taste`.
  const legacy = readCookie(BASE_COOKIE);
  if (legacy && legacy.trim().startsWith('{')) {
    const migrated = deserialise(decodeURIComponent(legacy));
    if (migrated) {
      persist(migrated);
      return migrated;
    }
  }
  return EMPTY;
}

/**
 * Write the profile, shedding optional data rather than the essentials.
 *
 * Likes, dislikes and languages are the profile - they drive the radio, so
 * they are never dropped. The renderable records and the play log are
 * conveniences; if the payload is too large they are trimmed oldest-first
 * until it fits. Only if it still won't fit does the localStorage mirror take
 * over, which keeps the data whether or not cookies work.
 */
function persist(input: TasteSnapshot): void {
  let taste = input;
  for (let attempt = 0; attempt < 12; attempt++) {
    const payload = serialise(taste);
    if (payload.length <= PAYLOAD_BUDGET && writeSharded(payload)) {
      // Cookies took it; drop any stale mirror so the two can't disagree.
      writeFallback(null);
      return;
    }
    // Drop the oldest plays first, then the oldest renderable records.
    if (taste.plays.length > 0) {
      taste = { ...taste, plays: taste.plays.slice(Math.ceil(taste.plays.length / 4)) };
      continue;
    }
    if (taste.liked.length > 0 || taste.disliked.length > 0) {
      taste = {
        ...taste,
        liked: taste.liked.slice(Math.ceil(taste.liked.length / 4)),
        disliked: taste.disliked.slice(Math.ceil(taste.disliked.length / 4)),
      };
      continue;
    }
    break;
  }
  // Browser refused (disabled / quota / too big). Keep the data anyway.
  writeFallback(serialise(taste));
}

export type TasteAction = 'like' | 'dislike' | 'none';

/**
 * Apply a like/dislike. Liking clears a previous dislike and vice-versa:
 * the two are mutually exclusive so a track can never be both.
 */
export function applyTaste(
  taste: TasteSnapshot,
  track: Track,
  action: TasteAction,
): TasteSnapshot {
  const without = (list: string[]) => list.filter((id) => id !== track.id);
  const like = without(taste.like);
  const dislike = without(taste.dislike);
  const liked = taste.liked.filter((t) => t.id !== track.id);
  const disliked = taste.disliked.filter((t) => t.id !== track.id);

  if (action === 'like') {
    like.push(track.id);
    liked.push(track);
    // Liking from the player is often the *only* interaction after a listen,
    // so a like also counts as a listen. It keeps "On repeat" honest for
    // people who like everything they hear.
    return recordPlay({ ...taste, like, dislike, liked, disliked }, track);
  }
  if (action === 'dislike') {
    dislike.push(track.id);
    disliked.push(track);
  }

  const next: TasteSnapshot = { ...taste, like, dislike, liked, disliked };
  persist(next);
  return next;
}

/**
 * Count one listen of `track`.
 *
 * Called once per completed track (see PlayerContext), not per render, so a
 * paused-and-resumed song doesn't inflate its own score. Repeat listens
 * increase `count` and refresh `at`, which is exactly what "On repeat" and
 * "Recently played" need.
 */
export function recordPlay(taste: TasteSnapshot, track: Track): TasteSnapshot {
  if (!track.id) return taste;
  const plays = taste.plays.filter((p) => p.id !== track.id);
  const previous = taste.plays.find((p) => p.id === track.id);
  // Strictly increasing timestamps: two plays within the same millisecond
  // would otherwise tie, and "most recent" would depend on sort stability.
  const latest = taste.plays.reduce((max, p) => Math.max(max, p.at), 0);
  plays.push({
    id: track.id,
    count: (previous?.count ?? 0) + 1,
    at: Math.max(Date.now(), latest + 1),
    title: track.title,
    artist: track.artist,
    artworkUrl: track.artworkUrl ?? '',
    ...(track.language ? { language: track.language } : {}),
  });
  const next: TasteSnapshot = { ...taste, plays: trimPlays(plays) };
  persist(next);
  return next;
}

export function setLanguages(taste: TasteSnapshot, lang: string[]): TasteSnapshot {
  const next: TasteSnapshot = { ...taste, lang, onboarded: true };
  persist(next);
  return next;
}

export function markOnboarded(taste: TasteSnapshot): TasteSnapshot {
  const next: TasteSnapshot = { ...taste, onboarded: true };
  persist(next);
  return next;
}

/** Query params shared by every radio request. */
export function tasteParams(taste: TasteSnapshot): URLSearchParams {
  const params = new URLSearchParams();
  if (taste.dislike.length) params.set('avoid', taste.dislike.slice(-60).join(','));
  if (taste.like.length) params.set('loved', taste.like.slice(-60).join(','));
  if (taste.lang.length) params.set('language', taste.lang.join(','));
  return params;
}

/* -------------------------------------------------------------------------
 * Derived view of the play log, used by the home feed
 * ---------------------------------------------------------------------- */

/** Tracks ordered by how many times they were played, most first. */
export function topPlayed(taste: TasteSnapshot, limit = 12): PlayEntry[] {
  return [...taste.plays]
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count || b.at - a.at)
    .slice(0, limit);
}

/** Tracks ordered by how recently they were played, newest first. */
export function recentlyPlayed(taste: TasteSnapshot, limit = 12): PlayEntry[] {
  return [...taste.plays].sort((a, b) => b.at - a.at).slice(0, limit);
}

/**
 * The artist/composer lanes this listener actually lives in.
 *
 * Drawn from what they played *and* what they liked, weighted by play count,
 * so a single accidental listen doesn't define the feed.
 */
export function favouriteArtists(taste: TasteSnapshot, limit = 5): string[] {
  const weight = new Map<string, number>();
  const add = (artist: string, n: number) => {
    const key = artist.split(/,|&|feat\.?|ft\.?/i)[0]?.trim();
    if (!key) return;
    weight.set(key, (weight.get(key) ?? 0) + n);
  };
  for (const p of taste.plays) add(p.artist, p.count);
  for (const t of taste.liked) add(t.artist, 2);
  return [...weight.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([artist]) => artist);
}

/** Languages the listener actually listens in, most-played first. */
export function listeningLanguages(taste: TasteSnapshot, limit = 4): string[] {
  const weight = new Map<string, number>();
  for (const p of taste.plays) {
    if (!p.language) continue;
    weight.set(p.language, (weight.get(p.language) ?? 0) + p.count);
  }
  const ranked = [...weight.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
  // Fall back to the onboarding pick, which is the cold-start signal.
  for (const lang of taste.lang) if (!ranked.includes(lang)) ranked.push(lang);
  return ranked.slice(0, limit);
}

/** The languages offered at onboarding, in the order they are shown. */
export const LANGUAGES: { id: string; label: string; native: string; emoji: string }[] = [
  { id: 'malayalam', label: 'Malayalam', native: 'മലയാളം', emoji: '🌴' },
  { id: 'tamil', label: 'Tamil', native: 'தமிழ்', emoji: '🎬' },
  { id: 'telugu', label: 'Telugu', native: 'తెలుగు', emoji: '🎥' },
  { id: 'hindi', label: 'Hindi', native: 'हिन्दी', emoji: '🪔' },
  { id: 'kannada', label: 'Kannada', native: 'ಕನ್ನಡ', emoji: '🎵' },
  { id: 'punjabi', label: 'Punjabi', native: 'ਪੰਜਾਬੀ', emoji: '🥁' },
  { id: 'english', label: 'English', native: 'English', emoji: '🌍' },
  { id: 'marathi', label: 'Marathi', native: 'मराठी', emoji: '🎭' },
  { id: 'bengali', label: 'Bengali', native: 'বাংলা', emoji: '🌊' },
];
