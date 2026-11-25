import assert from 'node:assert/strict';
import { buildRadio } from '../worker/src/radio';
import { createHistory, localRadio, sameLanguage } from '../web/src/player/queue';
import type { Track } from '../worker/src/types';
import type { MusicProvider } from '../worker/src/providers/types';
const make = (id: string, title: string, options: Partial<Track> = {}): Track => ({ id, title, artist: 'Singer', album: 'Malayalam film', durationSec: 240, streamUrl: `jiosaavn://${id}`, artworkUrl: '', gradientSeed: 1, language: 'malayalam', year: 1990, composer: 'Composer', ...options });
const seed = make('js:seed', 'Mandhaaracheppundo', { album: 'Melody', year: 1990 });
const recommended = make('js:rec', 'Unrelated words');
const otherLanguage = make('js:tamil', 'Tamil track', { language: 'tamil' });
const unknownLanguage = make('js:unknown', 'Unknown track', { language: undefined });
const devotional = make('js:prayer', 'Harivarasanam devotional');
const remake = make('js:dupe', 'Mandhaaracheppundo (Remix)');
const disliked = make('js:disliked', 'Disliked');
const remix = make('js:dance', 'Club Remix', { artist: 'Different', composer: 'Different', album: 'Party' });
const queries: string[] = [];
const p = { name: 'jiosaavn', recommendations: async () => [recommended, otherLanguage, unknownLanguage, devotional, remake, disliked], search: async (q: string) => { queries.push(q); return [remix, recommended]; }, getTrack: async () => seed } as unknown as MusicProvider;
async function main() {
  const result = await buildRadio([p], { seedTitle: seed.title, seedId: seed.id, seedArtist: seed.artist, seedLanguage: seed.language, seedComposer: seed.composer, seedYear: seed.year, seedAlbum: seed.album, exclude: [], limit: 12, taste: { avoid: [disliked.id] } });
  assert.ok(result.some(t => t.id === recommended.id));
  for (const id of [seed.id, remake.id, otherLanguage.id, unknownLanguage.id, devotional.id, disliked.id]) assert.ok(!result.some(t => t.id === id), `${id} must not enter radio`);
  assert.ok(queries.length > 0 && queries.every(q => !q.toLowerCase().includes('mandhaaracheppundo')), 'no title search');
  assert.ok(result.findIndex(t => t.id === recommended.id) < result.findIndex(t => t.id === remix.id), 'recommendations outrank a distant remix');
  const local = localRadio(seed, [otherLanguage, unknownLanguage, devotional, recommended, remix], createHistory([seed]), 10);
  assert.deepEqual(local.map(t => t.id), [recommended.id, remix.id]);
  assert.deepEqual(sameLanguage([otherLanguage, unknownLanguage, recommended], 'malayalam').map(t => t.id), [recommended.id]);
  // Short candidate pools must never relax category/language or add variants.
  const sparse = await buildRadio([p], { seedTitle: seed.title, seedId: seed.id, seedArtist: seed.artist, seedLanguage: 'telugu', exclude: [], limit: 20 });
  assert.deepEqual(sparse, []);
  console.log('Radio feel, language and no-repeat tests passed');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
