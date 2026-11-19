import type { Track } from '../api/types';

/**
 * Queue rules for Muzii.
 *
 * The product rule (from the brief): if you play *Arikil Pathiye*, the app
 * should continue in that lane — *Thoominnal* next — and it must **never**
 * replay the same song in the same listening session.
 *
 * "Same song" is deliberately fuzzy: the same recording often shows up again
 * under a different provider id (a re-upload, a "Remastered 2011" version, a
 * duplicate search result). Comparing titles+artists after normalisation
 * catches those, while `id` catches plain duplicates.
 */

/** Strip suffixes, punctuation and casing so near-duplicates compare equal. */
export function cleanTitle(title: string): string {
  return title
    .toLowerCase()
    // "(K.J.Yesudas) (from "Balettan")", "[Remastered 2011]", "- Reprise"
    .replace(/\((?:[^)]*)\)|\[[^\]]*\]/g, ' ')
    .replace(/\s-\s.*$/, ' ')
    // Stray separators left behind by bracket-stripping (", ", " / ").
    .replace(/[|/\\,]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Trailing version words that don't make a song a different song. */
const VARIANT_SUFFIXES = [
  'male', 'female', 'male version', 'female version', 'duet', 'solo',
  'reprise', 'remix', 'remastered', 'remaster', 'unplugged', 'acoustic',
  'live', 'cover', 'instrumental', 'karaoke', 'extended', 'edit',
  'version', 'from', 'movie', 'film', 'full song', 'lyrical', 'video song',
];

/**
 * Identity of a song. Mirrors songKey() in worker/src/radio.ts so the server
 * and the client always agree on "is this the same song?".
 */
export function songKey(title: string): string {
  const base = cleanTitle(title);
  if (!base) return base;
  for (const suffix of VARIANT_SUFFIXES) {
    if (!base.endsWith(' ' + suffix)) continue;
    const stripped = base.slice(0, base.length - suffix.length - 1).trim();
    if (stripped.length >= 3) return stripped;
  }
  return base;
}

/**
 * Identity of a *song*, used for the no-repeat rule.
 *
 * Keys on the title alone. The same recording shows up many times in these
 * catalogs — "Innale (K.J.Yesudas) (from "Balettan")", "Innale (Chithra)
 * (from "Balettan")" — one song with different singer credits and the album
 * baked into the title. Including the artist let every one of them into the
 * same queue. (Mirrored in worker/src/radio.ts.)
 */
export function trackKey(track: Track): string {
  return songKey(track.title);
}

export interface TrackHistory {
  ids: Set<string>;
  keys: Set<string>;
}

export function createHistory(seed: Track[] = []): TrackHistory {
  const history: TrackHistory = { ids: new Set(), keys: new Set() };
  for (const track of seed) remember(history, track);
  return history;
}

export function remember(history: TrackHistory, track: Track): void {
  history.ids.add(track.id);
  history.keys.add(trackKey(track));
}

export function hasPlayed(history: TrackHistory, track: Track): boolean {
  return history.ids.has(track.id) || history.keys.has(trackKey(track));
}

/**
 * Filter candidates down to something we are allowed to play:
 * not played this session, not already queued, no duplicates within the batch.
 */
export function pickFresh(
  candidates: Track[],
  history: TrackHistory,
  alreadyQueued: Track[] = [],
): Track[] {
  const queuedIds = new Set(alreadyQueued.map((t) => t.id));
  const queuedKeys = new Set(alreadyQueued.map(trackKey));
  const out: Track[] = [];
  for (const track of candidates) {
    if (!track?.id) continue;
    if (queuedIds.has(track.id)) continue;
    const key = trackKey(track);
    if (queuedKeys.has(key)) continue;
    if (hasPlayed(history, track)) continue;
    queuedIds.add(track.id);
    queuedKeys.add(key);
    out.push(track);
  }
  return out;
}

/** Normalised language string, for comparison. */
function normLang(value?: string): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Is this track allowed next to a seed in `language`?
 *
 * A known-but-different language is the one thing we never want: it is the
 * "Malayalam song → Telugu song" jump that makes a station feel random.
 * Unknown ('') is allowed, because most catalogs don't tag everything and
 * dropping those would empty the queue.
 */
export function languageOk(track: Track, language?: string): boolean {
  const seed = normLang(language);
  if (!seed) return true;
  const trackLang = normLang(track.language);
  if (!trackLang) return true;
  return trackLang === seed || trackLang.includes(seed) || seed.includes(trackLang);
}

/** Keep only tracks that don't break the station's language. */
export function sameLanguage(tracks: Track[], language?: string): Track[] {
  return language ? tracks.filter((t) => languageOk(t, language)) : tracks;
}

/**
 * Fallback radio when the backend can't be reached: prefer the same artist,
 * then the same catalog neighbourhood, and always honour the no-repeat rule.
 */
/** Energy cues - mirrors energyOf() in worker/src/radio.ts. */
// 'intro'/'theme' are deliberately absent: a title theme is as often a slow
// instrumental as a banger, and duration already catches long cues.
const HIGH_ENERGY = [
  'remix', 'remixed', 'dj', 'club', 'edm', 'dance', 'mashup', 'mix', 'party',
  'banger', 'trance', 'techno', 'house', 'dubstep', 'trap', 'hardstyle',
  'item song', 'mass', 'beat drop', 'drop', 'workout',
];
const LOW_ENERGY = [
  'melody', 'melodious', 'unplugged', 'acoustic', 'lullaby', 'sad', 'mellow',
  'soft', 'slow', 'romantic', 'love', 'soulful', 'pathos', 'melancholy',
  'instrumental', 'piano', 'strings', 'flute', 'bhajan', 'devotional',
];

/**
 * 0 = melody, 1 = club/DJ. `undefined` when there is no cue, so an unknown
 * track is never punished for being unknown.
 */
export function energyOf(track: {
  title: string;
  album?: string;
  durationSec?: number;
}): number | undefined {
  const hay = `${track.title} ${track.album ?? ''}`.toLowerCase();
  let high = 0;
  let low = 0;
  for (const cue of HIGH_ENERGY) if (hay.includes(cue)) high += 1;
  for (const cue of LOW_ENERGY) if (hay.includes(cue)) low += 1;
  const duration = track.durationSec ?? 0;
  if (duration >= 480) high += 2;
  else if (duration > 0 && duration <= 150) low += 1;
  if (high === 0 && low === 0) return undefined;
  if (high > low) return Math.min(1, 0.75 + high * 0.05);
  if (low > high) return Math.max(0, 0.2 - low * 0.03);
  return 0.5;
}

/** How far apart two tracks are in feel: 0 = same lane, 1 = opposite. */
export function energyGap(a: Track, b: Track): number | undefined {
  const ea = energyOf(a);
  const eb = energyOf(b);
  if (ea === undefined || eb === undefined) return undefined;
  return Math.abs(ea - eb);
}

/**
 * Devotional / non-film content — mirrors isDevotional() in worker/src/radio.ts.
 * A chant must not follow a film melody, and vice versa.
 */
const DEVOTIONAL_CUES = [
  'bhajan', 'devotional', 'harivarasanam', 'suprabhatam', 'kirtan', 'kirtanam',
  'namasankirtanam', 'ashtakam', 'stotram', 'chalisa', 'aarti', 'mantra',
  'hymn', 'qawwali', 'naat', 'shloka', 'vandana', 'sahasranamam',
];

export function isDevotional(track: { title: string; album?: string }): boolean {
  const hay = `${track.title} ${track.album ?? ''}`.toLowerCase();
  return DEVOTIONAL_CUES.some((cue) => hay.includes(cue));
}

/** Years either side of the seed that still count as the same lane. */
export const ERA_SPAN = 15;

export function localRadio(
  seed: Track,
  catalog: Track[],
  history: TrackHistory,
  limit = 10,
): Track[] {
  const seedArtist = (seed.artist.split(/,|&|feat\.?|ft\.?/i)[0] ?? seed.artist)
    .trim()
    .toLowerCase();
  // Keep the feel even on the fallback path: a melody must not be followed by
  // a DJ remix just because it shares an artist. Tracks far from the seed's
  // energy are dropped when enough in-lane songs remain.
  const sameLane = (t: Track) => {
    const gap = energyGap(seed, t);
    if (gap !== undefined && gap >= 0.6) return false;
    // Era: a 2016 song has no business in a 1996 lane.
    if (seed.year && t.year && Math.abs(seed.year - t.year) > ERA_SPAN) return false;
    // Style: a devotional chant is a different kind of recording.
    if (isDevotional(seed) !== isDevotional(t)) return false;
    return true;
  };
  const inLane = catalog.filter(sameLane);
  const pool = inLane.length >= limit ? inLane : catalog;

  const sameArtist = pool.filter(
    (t) => t.artist.toLowerCase().includes(seedArtist) && seedArtist.length > 1,
  );
  const rest = pool.filter((t) => !sameArtist.includes(t));
  // Interleave so a single-artist catalog doesn't block the rest.
  const mixed: Track[] = [];
  for (let i = 0; i < Math.max(sameArtist.length, rest.length); i++) {
    if (i < sameArtist.length) mixed.push(sameArtist[i]);
    if (i < rest.length) mixed.push(rest[i]);
  }
  return pickFresh(mixed, history).slice(0, limit);
}
