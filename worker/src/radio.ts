import type { MusicProvider } from './providers/types';
import type { Track } from './types';

/**
 * "Song radio" — the queue that plays after the song you picked.
 *
 * The app's queue rule (from the product brief): if you play *Arikil Pathiye*
 * the next track must be something in that lane (*Thoominnal*), never the same
 * song again, and never something already played this session.
 *
 * Strategy:
 * 1. Ask the provider for more songs from the seed's artist(s).
 * 2. Ask for songs that share words with the seed title (language-agnostic;
 *    JioSaavn's search handles Malayalam/Hindi queries well).
 * 3. Interleave the two result sets so the queue alternates between
 *    "same artist" and "same vibe" instead of dumping one artist block.
 * 4. Drop the seed itself, anything in `exclude` (already played), and
 *    anything that looks like the same recording (same normalised
 *    title+artist, so "Song" and "Song (Remastered)" don't both appear).
 *
 * Everything is best-effort: an empty result tells the client to fall back to
 * the loaded catalog, which is what it did before this endpoint existed.
 */

/** Strip punctuation, bracketed suffixes, and casing so near-duplicates match. */
export function normalizeKey(title: string, artist: string): string {
  const clean = (value: string) =>
    value
      .toLowerCase()
      // "(From "Kumbalangi Nights")", "[Remastered 2011]", "- Reprise"
      .replace(/\((?:[^)]*)\)|\[[^\]]*\]/g, ' ')
      .replace(/\s-\s.*$/, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const primaryArtist = artist.split(/,|&|feat\.?|ft\.?/i)[0] ?? artist;
  return `${clean(title)}|${clean(primaryArtist)}`;
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

/** Interleave arrays round-robin so the queue alternates sources. */
function interleave<T>(groups: T[][]): T[] {
  const out: T[] = [];
  const longest = Math.max(0, ...groups.map((g) => g.length));
  for (let i = 0; i < longest; i++) {
    for (const group of groups) {
      if (i < group.length) out.push(group[i]);
    }
  }
  return out;
}

function primaryArtist(artist: string): string {
  return (artist.split(/,|&|feat\.?|ft\.?/i)[0] ?? artist).trim();
}

export interface RadioRequest {
  seedTitle: string;
  seedArtist: string;
  seedId: string;
  /** Track ids already heard this session — never returned. */
  exclude: string[];
  limit?: number;
}

export async function buildRadio(
  chain: MusicProvider[],
  request: RadioRequest,
): Promise<Track[]> {
  const { seedTitle, seedArtist, seedId, exclude } = request;
  const limit = Math.min(Math.max(request.limit ?? 12, 1), 40);
  const artist = primaryArtist(seedArtist);

  const queries = [`${artist} songs`, `${artist} hits`];
  // Title words make a decent "sounds like" probe on these catalogs, but
  // long titles make noise — keep the two most meaningful words.
  const words = seedTitle
    .replace(/\((?:[^)]*)\)|\[[^\]]*\]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2);
  if (words.length) queries.push(words.join(' '));

  const provider = chain[0] ?? null;
  if (!provider) return [];

  const results = await Promise.all(
    queries.map((q) => provider.search(q).catch(() => [] as Track[])),
  );

  const excludedIds = new Set([seedId, ...exclude]);
  const seedKey = normalizeKey(seedTitle, seedArtist);
  const seenKeys = new Set<string>([seedKey]);
  const seenIds = new Set<string>();

  const pick = (tracks: Track[]): Track[] => {
    const out: Track[] = [];
    for (const track of tracks) {
      if (excludedIds.has(track.id) || seenIds.has(track.id)) continue;
      const key = normalizeKey(track.title, track.artist);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      seenIds.add(track.id);
      out.push(track);
    }
    return out;
  };

  // First query is "same artist" (lane A); the title probe is "same vibe".
  const [laneA, laneB, laneC] = results.map((r) => pick(r ?? []));
  const merged = interleave([
    seededShuffle(laneA ?? [], seedId),
    laneB ?? [],
    laneC ?? [],
  ]);

  return merged.slice(0, limit);
}
