import assert from 'node:assert/strict';
import { act, create } from 'react-test-renderer';
import { SearchPage } from '../src/pages/SearchPage';
import { PlayerProvider, usePlayer } from '../src/player/PlayerContext';
import { TasteProvider } from '../src/taste/TasteContext';
import { PlaylistsProvider } from '../src/playlists/PlaylistsContext';
import type { Track } from '../src/api/types';

const storage = new Map<string, string>();
const localStorage = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) };
(globalThis as any).localStorage = localStorage;
(globalThis as any).window = { localStorage, location: { origin: 'https://muzii.test' }, addEventListener() {}, removeEventListener() {} };
(globalThis as any).document = { cookie: '', body: { style: { overflow: '' } } };
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
class FakeAudio extends EventTarget {
  preload = ''; volume = 1; currentTime = 0; duration = 0; paused = true; src = '';
  play() { this.paused = false; this.dispatchEvent(new Event('play')); this.dispatchEvent(new Event('playing')); return Promise.resolve(); }
  pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
  load() {}
}
(globalThis as any).Audio = FakeAudio;
const t = (id: string, title: string): Track => ({ id, title, artist: 'Singer', album: 'Melody', durationSec: 240, streamUrl: `jiosaavn://${id}`, artworkUrl: '', gradientSeed: 0, language: 'malayalam' });
const first = t('js:1', 'First song'), second = t('js:2', 'Second song'), old = t('js:3', 'Old recommendation'), fresh = t('js:4', 'New recommendation');
const radioRequests: { id: string; resolve: (response: Response) => void }[] = [];
(globalThis as any).fetch = (input: string) => {
  const url = new URL(input, 'https://muzii.test');
  if (url.pathname === '/api/search') return Promise.resolve(new Response(JSON.stringify([first, second])));
  if (url.pathname === '/api/radio') return new Promise<Response>(resolve => radioRequests.push({ id: url.searchParams.get('seedId')!, resolve }));
  throw new Error(`Unexpected ${url}`);
};
let player!: ReturnType<typeof usePlayer>;
function Capture() { player = usePlayer(); return null; }
async function main() {
  let root!: ReturnType<typeof create>;
  await act(async () => { root = create(<TasteProvider><PlayerProvider><PlaylistsProvider><Capture /><SearchPage /></PlaylistsProvider></PlayerProvider></TasteProvider>); });
  await act(async () => { root.root.findByProps({ 'aria-label': 'Search songs, artists, albums' }).props.onChange({ target: { value: 'song' } }); await new Promise(r => setTimeout(r, 400)); });
  const rows = root.root.findAllByProps({ className: 'track-row-main' });
  assert.equal(rows.length, 2);
  await act(async () => { rows[0].props.onClick(); });
  assert.deepEqual(player.queue.map(x => x.id), [first.id], 'search results are not placed in the queue');
  assert.equal(player.queueSource, 'radio');
  assert.equal(radioRequests[0].id, first.id);
  await act(async () => { rows[1].props.onClick(); });
  assert.deepEqual(player.queue.map(x => x.id), [second.id]);
  await act(async () => { radioRequests[0].resolve(new Response(JSON.stringify([old]))); await Promise.resolve(); await new Promise(r => setTimeout(r, 0)); });
  assert.equal(radioRequests[1].id, second.id, 'new station starts after old request');
  assert.ok(!player.queue.some(x => x.id === old.id), 'stale result is not appended');
  await act(async () => { radioRequests[1].resolve(new Response(JSON.stringify([fresh]))); await Promise.resolve(); await new Promise(r => setTimeout(r, 0)); });
  assert.deepEqual(player.queue.map(x => x.id), [second.id, fresh.id]);
  await act(async () => { root.unmount(); });
  console.log('Search station and stale request tests passed');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
