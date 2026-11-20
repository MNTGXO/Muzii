import assert from 'node:assert/strict';
import { act, create } from 'react-test-renderer';
import { ImportPlaylistSheet } from '../src/components/ImportPlaylistSheet';
import { PlaylistsProvider } from '../src/playlists/PlaylistsContext';
const storage = new Map<string, string>();
(globalThis as any).window = { location: { origin: 'https://muzii.test' }, localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) }, addEventListener() {}, removeEventListener() {} };
(globalThis as any).document = { body: { style: { overflow: '' } } };
(globalThis as any).requestAnimationFrame = () => 1;
(globalThis as any).cancelAnimationFrame = () => {};
const entries = Array.from({ length: 7 }, (_, i) => ({ title: `Song ${i}`, artist: 'Artist' }));
const track = (i: number) => ({ id: `js:${i}`, title: `Song ${i}`, artist: 'Artist', album: '', durationSec: 1, streamUrl: `jiosaavn://${i}`, artworkUrl: '', gradientSeed: 0 });
async function run(failLast: boolean) {
  storage.clear();
  const calls: any[] = [];
  (globalThis as any).fetch = async (_url: string, init: RequestInit) => {
    const data = JSON.parse(String(init.body)); calls.push(data);
    if (data.input) return new Response(JSON.stringify({ source: 'spotify', title: 'My Spotify', tracks: [], unmatched: [{ query: 'Hidden', reason: 'unreadable' }], spotifyEntries: entries, notice: 'Spotify may provide only part of a playlist.' }));
    if (failLast && calls.length === 3) throw new Error('offline');
    return new Response(JSON.stringify({ source: 'text', title: '', tracks: data.entries.map((entry: { title: string }) => track(Number(entry.title.split(' ')[1]))), unmatched: [] }));
  };
  let opened = '', closed = 0;
  let root!: ReturnType<typeof create>;
  await act(async () => { root = create(<PlaylistsProvider><ImportPlaylistSheet onClose={() => { closed++; }} onCreated={id => { opened = id; }} /></PlaylistsProvider>); });
  await act(async () => { root.root.findByType('textarea').props.onChange({ target: { value: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M' } }); });
  const button = (label: string) => root.root.findAllByType('button').find(b => b.children.includes(label))!;
  await act(async () => { await button('Find songs').props.onClick(); });
  assert.equal(calls.length, 3);
  assert.equal(calls[1].entries.length, 5); assert.equal(calls[2].entries.length, 2);
  const text = JSON.stringify(root.toJSON());
  assert.match(text, /Spotify may provide only part/);
  if (failLast) { assert.match(text, /Matching stopped/); assert.match(text, /Song 5 - Artist/); }
  await act(async () => { button('Save playlist').props.onClick(); });
  assert.equal(closed, 1); assert.ok(opened.startsWith('upl-'));
  const playlists = JSON.parse(storage.get('muzii_playlists_v1')!);
  assert.equal(playlists[0].title, 'My Spotify');
  assert.equal(playlists[0].importedFrom, 'spotify');
  assert.equal(playlists[0].tracks.length, failLast ? 5 : 7);
  await act(async () => { root.unmount(); });
}
async function testCloseCancels() {
  let signal: AbortSignal | null = null;
  (globalThis as any).fetch = (_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    signal = init.signal as AbortSignal;
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  let root!: ReturnType<typeof create>;
  await act(async () => { root = create(<PlaylistsProvider><ImportPlaylistSheet onClose={() => {}} onCreated={() => {}} /></PlaylistsProvider>); });
  await act(async () => { root.root.findByType('textarea').props.onChange({ target: { value: 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M' } }); });
  await act(async () => { root.root.findAllByType('button').find(b => b.children.includes('Find songs'))!.props.onClick(); });
  assert.ok(signal && !(signal as AbortSignal).aborted);
  await act(async () => { root.unmount(); });
  assert.ok((signal as unknown as AbortSignal).aborted);
}
(async () => { await run(false); await run(true); await testCloseCancels(); console.log('Spotify import UI tests passed'); })().catch(err => { console.error(err); process.exitCode = 1; });
