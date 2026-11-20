import type { Track } from './types';
import type { MusicProvider } from './providers/types';
import { cleanTitle } from './radio';

// Replacements must be the same song and share a credited artist. A search
// result with a vaguely similar name is not enough to change what plays.
// Decode known entities in one pass; do not reinterpret newly decoded text.
const decodeEntities = (text: string) => text.replace(/&(?:amp|quot|apos|#0*39|#x27);/gi, entity => {
  switch (entity.toLowerCase()) {
    case '&amp;': return '&';
    case '&quot;': return '"';
    case '&apos;': return "'";
    default: return "'";
  }
});
const normalise = (text: string) => decodeEntities(text).toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const titleKey = (title: string) => cleanTitle(decodeEntities(title));
// Whitespace is trimmed by normalise rather than by a regex surrounding each
// delimiter, avoiding quadratic backtracking on long strings of spaces.
const credits = (artist: string) => artist
  .split(/[,;&]|\b(?:feat|ft)\b\.?|\bwith\b/i)
  .map(normalise).filter(name => name.length >= 3 && name !== 'unknown artist');
const variant = (title: string) => {
  const value = normalise(title);
  return ['remix', 'live', 'cover', 'karaoke', 'instrumental', 'reprise', 'acoustic', 'unplugged']
    .filter(word => new RegExp(`\\b${word}\\b`).test(value)).join('|');
};

export function sameSong(title: string, artist: string, candidate: Track): boolean {
  const key = titleKey(title);
  const names = credits(artist);
  if (key.length < 2 || !names.length || titleKey(candidate.title) !== key || variant(candidate.title) !== variant(title)) return false;
  const otherNames = credits(candidate.artist);
  return names.some(name => otherNames.includes(name));
}

export function selectCatalogMatch(title: string, artist: string, candidates: Track[]): Track | null {
  return candidates.find(candidate => candidate.id.startsWith('js:') && sameSong(title, artist, candidate)) ?? null;
}

// Cache successful matches briefly so browser range requests do not repeat
// catalogue searches. Keys include all supplied metadata, not just the ID.
const matches = new Map<string, { track: Track; expires: number }>();

/** Match on demand: even an 800-song import needs only one search at a time. */
export async function findCatalogMatch(provider: MusicProvider, title: string, artist: string): Promise<Track | null> {
  if (title.length > 300 || artist.length > 500 || !title.trim()) return null;
  const firstArtist = credits(artist)[0];
  if (!firstArtist) return null;
  const key = JSON.stringify([title, artist]);
  const cached = matches.get(key);
  if (cached && cached.expires > Date.now()) return cached.track;
  matches.delete(key);
  try {
    const results = await provider.search(`${title} ${firstArtist}`);
    const match = selectCatalogMatch(title, artist, results);
    if (match) {
      if (matches.size >= 250) matches.delete(matches.keys().next().value!);
      matches.set(key, { track: match, expires: Date.now() + 10 * 60_000 });
    }
    return match;
  } catch {
    return null;
  }
}

/** Try a matching catalogue recording first, then the original provider ID. */
export async function streamWithCatalogFallback(
  request: Request,
  id: string,
  chain: MusicProvider[],
  ctx: ExecutionContext,
  stream: (request: Request, provider: MusicProvider, id: string, ctx: ExecutionContext) => Promise<Response>,
): Promise<Response | null> {
  const url = new URL(request.url);
  const title = url.searchParams.get('title') ?? '';
  const artist = url.searchParams.get('artist') ?? '';
  const catalogue = chain.find(p => p.name === 'jiosaavn');
  if (!id.startsWith('js:') && title && artist && catalogue) {
    const match = await findCatalogMatch(catalogue, title, artist);
    if (match) {
      const res = await stream(request, catalogue, match.id, ctx);
      if (res.status !== 502) return res;
    }
  }
  const ordered = [...chain].sort((a, b) => {
    const owns = (p: MusicProvider) => p.name === 'jiosaavn' ? id.startsWith('js:') : !id.startsWith('js:');
    return Number(owns(b)) - Number(owns(a));
  });
  for (const provider of ordered) {
    const res = await stream(request, provider, id, ctx);
    if (res.status !== 502) return res;
  }
  return null;
}
