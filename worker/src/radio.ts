import type { MusicProvider } from './providers/types';
import type { Track } from './types';

/**
 * "Song radio" - the queue that plays after the song you picked.
 *
 * The product rule (from the brief): if you play *Arikil Pathiye* the next
 * track must be something in that lane (*Thoominnal*) - same language, same
 * mood - never the same song again, and never something already played.
 * Critically it must not drift: a Malayalam station that jumps to a Telugu
 * song is the bug this file exists to prevent.
 *
 * Signals used, strongest first:
 *  1. Language - a Malayalam station stays Malayalam.
 *  2. Composer - Harris Jayaraj tracks sound like Harris Jayaraj.
 *  3. Seed artist - same singer is the original "this lane" signal.
 *  4. Era - within ~12 years keeps a station from jumping decades.
 *  5. Provider recommendations - related music, never title similarity.
 *
 * Taste profile (stored client-side, forwarded here):
 *  - `avoid` - disliked ids, dropped outright.
 *  - `loved` - liked ids; their artists/composers are boosted.
 *
 * Everything is best-effort: an empty result tells the client to fall back to
 * the loaded catalog, which applies the same no-repeat rules locally.
 */

/** Primary artist of a credit string ("A, B & C" -> "A"). */
function primaryArtistOf(artist: string): string {
  return (artist.split(/,|&|feat\.?|ft\.?/i)[0] ?? artist).trim();
}

/** Strip punctuation, bracketed suffixes, and casing so near-duplicates match. */
export function cleanTitle(title: string): string {
  return title
    .toLowerCase()
    // "(K.J.Yesudas) (from "Balettan")", "[Remastered 2011]", "- Reprise"
    .replace(/\((?:[^)]*)\)|\[[^\]]*\]/g, ' ')
    .replace(/\s-\s.*$/, ' ')
    // Stray separators that bracket-stripping leaves behind (", ", " / ").
    .replace(/[|/\\,]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Identity of a song: the title, with an optional variant suffix removed.
 *
 * Catalogs list the same song as "Minnum Minnamai", "Minnum Minnamai (Male)",
 * "Minnum Minnamai (Female)", "Minnum Minnamai - Reprise". After stripping
 * brackets they all reduce to the same title, but some entries also survive
 * with a bare suffix ("Minnum Minnamai male") when the bracket was missing, so
 * trailing version words are dropped too.
 *
 * Only *trailing* version words go — a title that is genuinely "Male" on its
 * own keeps it, because there would be nothing left otherwise.
 */
const VARIANT_SUFFIXES = [
  'male', 'female', 'male version', 'female version', 'duet', 'solo',
  'reprise', 'remix', 'remastered', 'remaster', 'unplugged', 'acoustic',
  'live', 'cover', 'instrumental', 'karaoke', 'extended', 'edit',
  'version', 'from', 'movie', 'film', 'full song', 'lyrical', 'video song',
];

export function songKey(title: string): string {
  const base = cleanTitle(title);
  if (!base) return base;
  for (const suffix of VARIANT_SUFFIXES) {
    if (!base.endsWith(' ' + suffix)) continue;
    const stripped = base.slice(0, base.length - suffix.length - 1).trim();
    // Never reduce a title to nothing: "Male" is a real song title somewhere.
    if (stripped.length >= 3) return stripped;
  }
  return base;
}

/**
 * Identity of a *song*, used for the no-repeat rule.
 *
 * This deliberately keys on the **title alone**. The same recording appears
 * many times in these catalogs — "Innale (K.J.Yesudas) (from "Balettan")",
 * "Innale (K.J.Yesudas)", "Innale (Chithra) (from "Balettan")" are one song
 * with different singer credits and an album tag baked into the title. Keying
 * on title+artist let all of them into a single queue, which is exactly the
 * "queue keeps playing the same song" bug.
 *
 * Collisions between genuinely different songs that share a generic title
 * ("Kannamma", "Kadhal") are the acceptable trade-off: playing one cover
 * instead of two near-identical uploads is the better failure.
 */
export function normalizeKey(title: string, _artist?: string): string {
  return songKey(title);
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  // Deterministic per-seed ordering so the same radio is stable across
  // reloads (nice for share links) without needing to store it.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Lowercased, comparable form of a language string. */
function normLang(value?: string): string {
  return (value ?? '').trim().toLowerCase();
}

function sameLang(a?: string, b?: string): boolean {
  const la = normLang(a);
  const lb = normLang(b);
  if (!la || !lb) return false;
  return la === lb || la.includes(lb) || lb.includes(la);
}

/** Within `span` years - unknown years are treated as compatible. */
function nearEra(a?: number, b?: number, span = 12): boolean {
  if (!a || !b) return true;
  return Math.abs(a - b) <= span;
}

/**
 * How energetic a track is, from 0 (melody/ballad) to 1 (club/DJ banger).
 *
 * Why this exists: the catalog gives us language, composer, artist and year —
 * nothing that distinguishes a melody from a remix. A Harris Jayaraj melody
 * and a Harris Jayaraj DJ remix therefore scored *identically* (same composer
 * +55, same artist +70, same language +100, same era +20), so a station could
 * legally answer "melody" with a thumping remix. That is the "I played a
 * melody, don't give me a DJ next" complaint, and no amount of re-weighting
 * the existing signals could fix it: there was no axis to weigh.
 *
 * JioSaavn exposes no genre, so this is derived from the strongest cue we do
 * have - the words in the title and album. It is a heuristic, deliberately
 * coarse, and returns `undefined` when there is no cue at all so an unknown
 * track is treated as compatible rather than guessed at.
 */
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

  // A long track is usually a DJ set / continuous mix, not a song.
  const duration = track.durationSec ?? 0;
  if (duration >= 480) high += 2;
  else if (duration > 0 && duration <= 150) low += 1;

  if (high === 0 && low === 0) return undefined;
  if (high > low) return Math.min(1, 0.75 + high * 0.05);
  if (low > high) return Math.max(0, 0.2 - low * 0.03);
  return 0.5;
}

/**
 * Devotional / non-film content: bhajans, chants, hymns.
 *
 * A 1975 "Harivarasanam" chant sitting in a queue of 1990s Malayalam film
 * melodies is the clearest "this does not feel like the same thing" failure,
 * and no amount of era/composer scoring fixes it because it is a different
 * *kind* of recording, not a different decade. Dropped unless the seed is
 * itself devotional.
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

export interface TasteProfile {
  /** Disliked track ids - never returned. */
  avoid?: string[];
  /** Liked track ids - their artists/composers are boosted. */
  loved?: string[];
  /** Language the listener picked at onboarding, e.g. "malayalam". */
  language?: string;
}

export interface RadioRequest {
  seedTitle: string;
  seedArtist: string;
  seedId: string;
  /** Track ids already heard this session - never returned. */
  exclude: string[];
  limit?: number;
  /** Seed metadata, so the station can stay in its language/era. */
  seedLanguage?: string;
  seedComposer?: string;
  seedYear?: number;
  seedAlbum?: string;
  seedDurationSec?: number;
  /** The songs the listener already loves/dislikes. */
  taste?: TasteProfile;
}

interface Seed {
  /** Seed title, needed to work out the station's energy. */
  title: string;
  artist: string;
  language?: string;
  composer?: string;
  year?: number;
  album?: string;
  durationSec?: number;
}

/**
 * Rank a candidate against the seed. Higher is "more like this".
 * Weights are deliberately coarse: they must be robust across catalogs,
 * not musically perfect.
 */
function scoreTrack(
  track: Track,
  seed: Seed,
  lovedArtists: Set<string>,
  lovedComposers: Set<string>,
): number {
  let score = 0;

  // 0. Energy - "keep the feel". Without this a melody and a DJ remix of the
  //    same song by the same composer scored identically.
  const seedEnergy = energyOf({ title: seed.title, album: seed.album, durationSec: seed.durationSec });
  const trackEnergy = energyOf(track);
  if (seedEnergy !== undefined && trackEnergy !== undefined) {
    const gap = Math.abs(seedEnergy - trackEnergy);
    if (gap >= 0.6) score -= 90;
    else if (gap >= 0.3) score -= 30;
    else score += 15;
  }

  // 1. Language - the single most important "don't jump languages" guard.
  if (sameLang(track.language, seed.language)) score += 100;
  // Unknown language is a mild risk, not a disqualification.
  else if (!track.language || !seed.language) score += 25;
  else score -= 60;

  // 2. Composer (Harris Jayaraj, A. R. Rahman...) - strong "feel" match.
  if (seed.composer && track.composer) {
    // Same music director is the single strongest "same feel" signal the
    // catalog gives us: one composer defines a whole era's sound. Raised from
    // 55 so a coherent lane forms instead of a scattered one.
    if (track.composer.toLowerCase() === seed.composer.toLowerCase()) score += 75;
  }
  if (track.composer && lovedComposers.has(track.composer.toLowerCase())) score += 35;

  // 3. Seed artist, or an artist the listener has liked.
  const artist = primaryArtistOf(track.artist).toLowerCase();
  if (seed.artist && artist === seed.artist.toLowerCase()) score += 70;
  else if (lovedArtists.has(artist)) score += 30;

  // 4. Era - keeps a station from hopping 1995 -> 2024.
  if (nearEra(track.year, seed.year)) score += 20;
  else score -= 25;

  // 5. Tiny stable tiebreak so results are deterministic.
  if (track.artworkUrl) score += 2;

  return score;
}

export async function buildRadio(
  chain: MusicProvider[],
  request: RadioRequest,
): Promise<Track[]> {
  const { seedTitle, seedArtist, seedId, exclude } = request;
  const limit = Math.min(Math.max(request.limit ?? 12, 1), 40);
  const artist = primaryArtistOf(seedArtist);
  const taste = request.taste ?? {};
  // JioSaavn can enrich older seed records that lack language/composer.
  const owner = chain.find(p => seedId.startsWith('js:') && p.name === 'jiosaavn');
  const details = owner && !request.seedLanguage
    ? await owner.getTrack(seedId).catch(() => null) : null;
  const seedLanguage = normLang(request.seedLanguage || details?.language) || undefined;
  const seedComposer = request.seedComposer?.trim() || details?.composer || undefined;
  const seedYear = request.seedYear || details?.year;

  const provider = chain.find(p => seedId.startsWith('js:') ? p.name === 'jiosaavn' : p.name === 'youtube') ?? chain[0] ?? null;
  if (!provider) return [];

  // Related tracks are the strongest available signal. Metadata-based
  // searches broaden the pool without querying the seed's title words.
  const queries: string[] = [];
  if (seedLanguage) {
    const energy = energyOf({ title: seedTitle, album: request.seedAlbum || details?.album, durationSec: request.seedDurationSec || details?.durationSec });
    queries.push(`${seedLanguage} ${energy !== undefined && energy < 0.4 ? 'melody' : 'songs'}`);
    if (seedYear) queries.push(`${seedLanguage} ${seedYear} songs`);
  }
  if (seedComposer) queries.push(`${seedLanguage || ''} ${seedComposer} songs`.trim());
  if (artist && artist.toLowerCase() !== 'unknown artist') queries.push(`${seedLanguage || ''} ${artist} songs`.trim());
  const uniqueQueries = [...new Set(queries)].slice(0, 4);
  const [suggestions, ...results] = await Promise.all([
    owner?.recommendations?.(seedId).catch(() => [] as Track[]) ?? Promise.resolve([] as Track[]),
    ...uniqueQueries.map((q) => provider.search(q).catch(() => [] as Track[])),
  ]);
  const recommended = new Set(suggestions.map(t => t.id));
  results.unshift(suggestions);

  // ---- filtering ----------------------------------------------------------
  const avoidIds = new Set(taste.avoid ?? []);
  const excludedIds = new Set([seedId, ...exclude]);
  const seedKey = normalizeKey(seedTitle, seedArtist);
  const seenKeys = new Set<string>([seedKey]);
  const seenIds = new Set<string>();

  // Liked tracks tell us which artists/composers to lean into. We resolve
  // them from the pool we already fetched rather than refetching by id.
  const lovedArtists = new Set<string>();
  const lovedComposers = new Set<string>();
  const lovedSet = new Set(taste.loved ?? []);
  const dislikedArtists = new Map<string, number>();

  for (const batch of results) {
    for (const track of batch) {
      const artistKey = primaryArtistOf(track.artist).toLowerCase();
      if (lovedSet.has(track.id)) {
        lovedArtists.add(artistKey);
        if (track.composer) lovedComposers.add(track.composer.toLowerCase());
      }
      if (avoidIds.has(track.id)) {
        dislikedArtists.set(artistKey, (dislikedArtists.get(artistKey) ?? 0) + 1);
      }
    }
  }

  const seed: Seed = {
    title: seedTitle,
    artist,
    language: seedLanguage,
    composer: seedComposer,
    year: seedYear,
    album: request.seedAlbum || details?.album,
    durationSec: request.seedDurationSec || details?.durationSec,
  };

  const scored: { track: Track; score: number }[] = [];
  for (const batch of results) {
    for (const track of batch) {
      if (!track?.id) continue;
      if (excludedIds.has(track.id) || avoidIds.has(track.id)) continue;
      if (seenIds.has(track.id)) continue;
      const key = normalizeKey(track.title, track.artist);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      seenIds.add(track.id);
      scored.push({
        track,
        score: scoreTrack(track, seed, lovedArtists, lovedComposers) + (recommended.has(track.id) ? 85 : 0),
      });
    }
  }

  // Disliking three songs by one singer is a real signal; one bad upload is
  // not. Drop an artist only after three dislikes.
  const ranked = scored
    .filter(
      ({ track }) =>
        (dislikedArtists.get(primaryArtistOf(track.artist).toLowerCase()) ?? 0) < 3,
    )
    .sort((a, b) => b.score - a.score);

  // Never fill a short station with a known different language or a
  // devotional/non-devotional mismatch. Returning fewer songs is safer than
  // silently crossing lanes. Unknown language is not proof of a match.
  const seedLang = normLang(seed.language);
  const seedIsDevotional = isDevotional({ title: seedTitle, album: seed.album });
  const rankedFinal = ranked.filter(({ track }) =>
    (!seedLang || sameLang(track.language, seedLang)) &&
    seedIsDevotional === isDevotional(track),
  );

  // Keep variety WITHOUT destroying the ranking: bucket candidates by score
  // band, shuffle inside each band (deterministic), then concatenate the
  // bands in descending order. Shuffling the whole list would let a
  // score-(-60) track sit above a score-(+100) one.
  const buckets = new Map<number, Track[]>();
  for (const { track, score } of rankedFinal) {
    // 15-point bands (was 25): a 25-point band is wide enough that a
    // wrong-era track could sit in the top band and get shuffled to the
    // front. Tighter bands keep the ordering meaningful while still giving
    // variety inside a band.
    const band = Math.round(score / 15) * 15;
    const list = buckets.get(band);
    if (list) list.push(track);
    else buckets.set(band, [track]);
  }
  const pool: Track[] = [...buckets.keys()]
    .sort((a, b) => b - a)
    .flatMap((band) => seededShuffle(buckets.get(band) ?? [], `${seedId}:${band}`))
    .slice(0, Math.max(limit * 2, limit));

  const out: Track[] = [];
  const usedArtists = new Map<string, number>();

  // Greedy: never stack three songs by the same artist in a row.
  while (out.length < limit && pool.length) {
    let chosen = -1;
    for (let i = 0; i < pool.length; i++) {
      const a = primaryArtistOf(pool[i].artist).toLowerCase();
      if ((usedArtists.get(a) ?? 0) < 2) {
        chosen = i;
        break;
      }
    }
    if (chosen === -1) chosen = 0;
    const [item] = pool.splice(chosen, 1);
    const a = primaryArtistOf(item.artist).toLowerCase();
    usedArtists.set(a, (usedArtists.get(a) ?? 0) + 1);
    out.push(item);
  }

  return out;
}
