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
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  return cleanTitle(track.title);
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
export function localRadio(
  seed: Track,
  catalog: Track[],
  history: TrackHistory,
  limit = 10,
): Track[] {
  const seedArtist = (seed.artist.split(/,|&|feat\.?|ft\.?/i)[0] ?? seed.artist)
    .trim()
    .toLowerCase();
  const sameArtist = catalog.filter(
    (t) => t.artist.toLowerCase().includes(seedArtist) && seedArtist.length > 1,
  );
  const rest = catalog.filter((t) => !sameArtist.includes(t));
  // Interleave so a single-artist catalog doesn't block the rest.
  const mixed: Track[] = [];
  for (let i = 0; i < Math.max(sameArtist.length, rest.length); i++) {
    if (i < sameArtist.length) mixed.push(sameArtist[i]);
    if (i < rest.length) mixed.push(rest[i]);
  }
  return pickFresh(mixed, history).slice(0, limit);
}
