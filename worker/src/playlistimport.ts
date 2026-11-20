import type { Track } from './types';
import { cleanTitle } from './radio';
import { toTrack } from './providers/jiosaavn';

export interface ImportResult {
  source: 'youtube' | 'jiosaavn' | 'spotify' | 'apple' | 'text' | 'unknown';
  title: string;
  tracks: Track[];
  unmatched: { query: string; reason: 'not-found' | 'unreadable' }[];
  notice?: string;
}
const empty = (source: ImportResult['source'], notice: string): ImportResult => ({ source, title: '', tracks: [], unmatched: [], notice });
const words = (text: string) => cleanTitle(text).trim();

export async function matchEntry(search: (q: string) => Promise<Track[]>, title: string, artist: string): Promise<Track | null> {
  const wanted = words(title);
  if (!wanted) return null;
  const candidates = await search([title, artist].filter(Boolean).join(' ')).catch(() => []);
  const scored = candidates.map(track => {
    const got = words(track.title);
    // Do not silently replace a song with a different search result.
    if (!got || (got !== wanted && !(wanted.length >= 5 && (got.startsWith(wanted + ' ') || wanted.startsWith(got + ' '))))) return { track, score: 0 };
    const a = words(artist), b = words(track.artist);
    const aTokens = a.split(' ').filter(Boolean), bTokens = b.split(' ').filter(Boolean);
    const overlap = aTokens.filter(w => bTokens.includes(w)).length / Math.max(aTokens.length, bTokens.length);
    if (a && b && overlap < 0.75 && b !== 'unknown artist') return { track, score: 0 };
    return { track, score: got === wanted ? 2 : 1 };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score ? scored[0].track : null;
}

export function parsePastedList(text: string): { title: string; artist: string; query: string }[] {
  return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const query = line.replace(/^\d+[.)]\s*|^[•*]\s*/, '').replace(/\s+[\[(]?\d{1,2}:\d{2}[\])]?\s*$/, '').trim();
    const parts = query.split(/\s+[-–—|]\s+|\t+/);
    return { title: parts[0].trim(), artist: parts.slice(1).join(' ').trim(), query };
  }).filter(e => e.title);
}

const runs = (x: any) => x?.runs?.map((r: any) => r.text ?? '').join('') ?? x?.simpleText ?? '';
function findAll(node: any, key: string, out: any[] = []): any[] {
  if (!node || typeof node !== 'object') return out;
  if (node[key]) out.push(node[key]);
  for (const v of Object.values(node)) if (Array.isArray(v)) v.forEach(x => findAll(x, key, out)); else if (v && typeof v === 'object') findAll(v, key, out);
  return out;
}
async function youtube(id: string): Promise<ImportResult> {
  const tracks: Track[] = [], unmatched: ImportResult['unmatched'] = [];
  let title = 'Imported playlist', continuation: string | undefined;
  let truncated = false;
  for (let page = 0; page < 10; page++) {
    const res = await fetch('https://music.youtube.com/youtubei/v1/browse?key=AIzaSyC9XL3ZjWddXya6XNWIqC5LtJXo3GtNLYg', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-YouTube-Client-Name': '67', 'X-YouTube-Client-Version': '1.20241104.01.00', 'X-Goog-Api-Key': 'AIzaSyC9XL3ZjWddXya6XNWIqC5LtJXo3GtNLYg', 'Accept-Language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20241104.01.00', hl: 'en', gl: 'US' } }, ...(continuation ? { continuation } : { browseId: `VL${id.replace(/^VL/, '')}` }) }),
    });
    if (!res.ok) throw new Error('browse failed');
    const data: any = await res.json();
    if (!page) title = runs(findAll(data, 'musicDetailHeaderRenderer')[0]?.title) || runs(findAll(data, 'musicResponsiveHeaderRenderer')[0]?.title) || title;
    // Only read the playlist shelf, not recommendations or the playlist header.
    const shelves = [...findAll(data, 'musicPlaylistShelfRenderer'), ...findAll(data, 'musicPlaylistShelfContinuation'), ...findAll(data, 'appendContinuationItemsAction').map((a: any) => ({ contents: a.continuationItems }))];
    const items: any[] = shelves.flatMap(s => s.contents ?? []);
    for (const item of items) {
      const r = item.musicResponsiveListItemRenderer;
      if (!r) continue;
      const cols = r.flexColumns ?? [];
      const name = runs(cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text).trim();
      const id = r.playlistItemData?.videoId ?? r.navigationEndpoint?.watchEndpoint?.videoId ?? r.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId;
      if (!id || !name) { unmatched.push({ query: name || 'Unavailable playlist item', reason: 'unreadable' }); continue; }
      const subtitle = runs(cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text).split(/\s*[•·]\s*/).filter(Boolean);
      if (/^(song|video)$/i.test(subtitle[0])) subtitle.shift();
      tracks.push({ id, title: name, artist: subtitle[0] || 'Unknown Artist', album: '', durationSec: 0, streamUrl: `ytmusic://${id}`, artworkUrl: '', gradientSeed: [...id as string].reduce((a, c) => a + c.charCodeAt(0), 0) % 360 });
    }
    continuation = shelves.flatMap(s => s.continuations ?? []).map((c: any) => c.nextContinuationData?.continuation).find(Boolean) ?? findAll(data, 'continuationCommand')[0]?.token;
    if (!continuation) break;
    if (page === 9) truncated = true;
  }
  if (!tracks.length && !unmatched.length) throw new Error('empty playlist');
  return { source: 'youtube', title, tracks, unmatched, ...(truncated ? { notice: 'Only the first 10 pages could be read. The rest were not imported.' } : {}) };
}
async function saavn(url: string): Promise<ImportResult> {
  for (const host of ['https://saavn.dev/api', 'https://jio.shnwaz.dev/api', 'https://saavn.sumit.co/api']) {
    try {
      const res = await fetch(`${host}/playlists?link=${encodeURIComponent(url)}&limit=500`, { signal: AbortSignal.timeout(7000) });
      if (!res.ok) continue;
      const data: any = await res.json();
      const p = data.data;
      if (!Array.isArray(p?.songs) || !p.songs.length) continue;
      const tracks: Track[] = [], unmatched: ImportResult['unmatched'] = [];
      for (const song of p.songs) { const track = toTrack(song); if (track) tracks.push(track); else unmatched.push({ query: song.name || 'Unavailable song', reason: 'unreadable' }); }
      const total = Number(p.songCount ?? p.total ?? 0);
      return { source: 'jiosaavn', title: p.name || 'Imported playlist', tracks, unmatched, ...(total > p.songs.length ? { notice: `Only ${p.songs.length} of ${total} source entries were returned; the rest were not imported.` } : p.songs.length >= 500 ? { notice: 'Only the first 500 source entries were requested; additional songs may not have been imported.' } : {}) };
    } catch { /* try next host */ }
  }
  throw new Error('playlist unavailable');
}
export async function resolveImport(input: string, search: (q: string) => Promise<Track[]>): Promise<ImportResult> {
  const text = input.trim();
  if (!text) return empty('unknown', 'Paste a playlist link or song list.');
  if (text.length > 20000) return empty('unknown', 'Input is too long. Split your song list into smaller batches.');
  if (/^https?:\/\//i.test(text) || /^(music\.youtube\.com|www\.youtube\.com|open\.spotify\.com)\//i.test(text)) {
    let url: URL;
    try { url = new URL(/^https?:/i.test(text) ? text : `https://${text}`); } catch { return empty('unknown', 'That link is not valid.'); }
    const host = url.hostname.toLowerCase();
    if (['youtube.com', 'www.youtube.com', 'music.youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) {
      const id = url.searchParams.get('list');
      if (!id || !/^[\w-]{10,100}$/.test(id)) return empty('youtube', 'Use a YouTube playlist link containing a list ID.');
      try { return await youtube(id); } catch { return empty('youtube', 'Could not read this playlist. Make it public or paste its song list instead.'); }
    }
    if (host === 'jiosaavn.com' || host === 'www.jiosaavn.com' || host === 'saavn.com' || host === 'www.saavn.com') {
      try { return await saavn(url.toString()); } catch { return empty('jiosaavn', 'Could not read this playlist. Paste its song list instead.'); }
    }
    const source = host === 'open.spotify.com' ? 'spotify' : host === 'music.apple.com' ? 'apple' : 'unknown';
    return empty(source, 'This link cannot be read directly. Paste the song list below, one song per line, in “Title - Artist” format.');
  }
  const entries = parsePastedList(text);
  if (!entries.length) return empty('text', 'Paste at least one song.');
  if (entries.length > 10) return empty('text', 'Please import at most 10 songs per batch.');
  const matches = await Promise.all(entries.map(e => matchEntry(search, e.title, e.artist)));
  return { source: 'text', title: '', tracks: matches.filter((t): t is Track => t !== null), unmatched: entries.filter((_, i) => !matches[i]).map(e => ({ query: e.query, reason: 'not-found' })) };
}
