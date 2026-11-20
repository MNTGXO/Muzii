import assert from 'node:assert/strict';
import { renderToString } from 'react-dom/server';
import { PlaylistsProvider, usePlaylists } from '../src/playlists/PlaylistsContext';
import type { Track } from '../src/api/types';

const saved = new Map<string, string>();
let failWrites = false;
(globalThis as any).window = {
  localStorage: {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failWrites) throw new Error('Quota exceeded');
      saved.set(key, value);
    },
  },
};
let context!: ReturnType<typeof usePlaylists>;
function Capture() { context = usePlaylists(); return null; }
function mount() { renderToString(<PlaylistsProvider><Capture /></PlaylistsProvider>); }
const tracks: Track[] = Array.from({ length: 813 }, (_, i) => ({
  id: `video-${i}`, title: `Song ${i}`, artist: 'Artist', album: '',
  durationSec: 0, streamUrl: `ytmusic://video-${i}`, artworkUrl: '', gradientSeed: 0,
}));

mount();
const created = context.create('Feel good songs collection', { tracks, importedFrom: 'youtube' });
assert.ok(created, 'creating an 813-song playlist succeeds');
assert.equal(created.tracks.length, 813);
mount(); // A new provider reads the same data after a reload.
assert.deepEqual(context.playlists[0].tracks, tracks);
assert.equal(context.addTrack(created.id, { ...tracks[0], id: 'extra', title: 'One more' }), true);
mount();
assert.equal(context.playlists[0].tracks.length, 814);
const previous = saved.get('muzii_playlists_v1');
failWrites = true;
assert.equal(context.create('Cannot save', { tracks }), null);
assert.equal(saved.get('muzii_playlists_v1'), previous, 'failed writes do not replace existing data');
console.log('Large playlist context tests passed');
