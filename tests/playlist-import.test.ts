import assert from 'node:assert/strict';
import { resolveImport, parsePastedList } from '../worker/src/playlistimport';
import { blankPlaylist, withTrackAdded, withTrackMoved, withTrackRemoved, savePlaylists, loadPlaylists } from '../web/src/playlists/store';
import type { Track } from '../worker/src/types';
const song = (id: string, title: string, artist = 'Artist'): Track => ({ id, title, artist, album: '', durationSec: 180, streamUrl: `ytmusic://${id}`, artworkUrl: '', gradientSeed: 0 });
async function main() {
  assert.deepEqual(parsePastedList('1. Hello - Artist\nWorld\tSinger'), [{ title: 'Hello', artist: 'Artist', query: 'Hello - Artist' }, { title: 'World', artist: 'Singer', query: 'World\tSinger' }]);
  const result = await resolveImport('Hello - Artist\nMissing - Artist', async q => q.startsWith('Hello') ? [song('1', 'Hello')] : []);
  assert.equal(result.tracks.length, 1); assert.deepEqual(result.unmatched.map(x => x.query), ['Missing - Artist']);
  assert.equal((await resolveImport('Hello - Wrong Artist', async () => [song('1', 'Hello')])).tracks.length, 0);
  assert.match((await resolveImport('https://open.spotify.com/playlist/abc', async () => [])).notice!, /paste/i);
  assert.match((await resolveImport(Array(11).fill('song').join('\n'), async () => [])).notice!, /10 songs/);
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    const renderer = (id: string, name: string) => ({ musicResponsiveListItemRenderer: { playlistItemData: { videoId: id }, flexColumns: [{ musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: name }] } } }, { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Artist' }] } } }] } });
    return new Response(JSON.stringify(body.continuation ? { onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: [renderer('def', 'Second')] } }] } : { musicPlaylistShelfRenderer: { contents: [renderer('abc', 'First'), { musicResponsiveListItemRenderer: {} }], continuations: [{ nextContinuationData: { continuation: 'next' } }] } }), { status: 200 });
  };
  const yt = await resolveImport('https://music.youtube.com/playlist?list=PL1234567890', async () => []);
  assert.equal(calls, 2); assert.deepEqual(yt.tracks.map(t => t.title), ['First', 'Second']); assert.equal(yt.unmatched.length, 1);
  globalThis.fetch = original;
  let p = blankPlaylist('Mine');
  p = withTrackAdded(p, song('a', 'Hello'))!;
  assert.equal(withTrackAdded(p, song('b', 'Hello (Remix)')), null);
  p = withTrackAdded(p, song('c', 'World'))!;
  assert.equal(withTrackMoved(p, 0, 1).tracks[1].title, 'Hello');
  assert.equal(withTrackRemoved(p, 'a').tracks.length, 1);
  const data = new Map<string, string>();
  (globalThis as any).window = { localStorage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) } };
  assert.equal(savePlaylists([p]), true); assert.deepEqual(loadPlaylists()[0].tracks, p.tracks);
  (globalThis as any).window.localStorage.setItem = () => { throw new Error('quota'); };
  assert.equal(savePlaylists([p]), false);
  console.log('Playlist import and storage tests passed');
}
main().catch(err => { console.error(err); process.exitCode = 1; });
