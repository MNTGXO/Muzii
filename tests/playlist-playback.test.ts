import assert from 'node:assert/strict';
import { findCatalogMatch, selectCatalogMatch, streamWithCatalogFallback } from '../worker/src/streammatch';
import type { MusicProvider } from '../worker/src/providers/types';
import type { Track } from '../worker/src/types';

const track = (id: string, title: string, artist: string): Track => ({ id, title, artist, album: '', durationSec: 180, streamUrl: '', artworkUrl: '', gradientSeed: 0 });
const title = 'Pularikalo (From "Charlie")';
const artist = 'Gopi Sundar, Shakthishree Gopalan, Mohammed Maqbool Mansoor & Rafeeq Ahammed';
const matching = track('js:123', 'Pularikalo', 'Gopi Sundar, Shakthishree Gopalan');
assert.equal(selectCatalogMatch(title, artist, [track('js:wrong', 'Pularikalo', 'Another Artist'), matching]), matching);
assert.equal(selectCatalogMatch(title, artist, [track('js:wrong', 'Pularikalo Remix', 'Gopi Sundar')]), null);
assert.equal(selectCatalogMatch(title, artist, [track('js:wrong', 'Pularikalo (Remix)', 'Gopi Sundar')]), null);
assert.equal(selectCatalogMatch(title, 'Unknown Artist', [matching]), null);
assert.equal(selectCatalogMatch('Song &quot;One&quot;', 'Singer feat. Partner', [track('js:entity', 'Song \"One\"', 'Partner')])?.id, 'js:entity');
assert.equal(selectCatalogMatch('Different', ' '.repeat(50000), [matching]), null);
assert.equal(selectCatalogMatch(title, artist, [track('yt', 'Pularikalo', 'Gopi Sundar')]), null);
let searches = 0;
const saavn = { name: 'jiosaavn', search: async () => { searches++; return [matching]; } } as unknown as MusicProvider;
const yt = { name: 'youtube' } as MusicProvider;
const ctx = {} as ExecutionContext;
const request = new Request(`https://example.test/api/stream/video123?${new URLSearchParams({ title, artist })}`, { headers: { Range: 'bytes=0-100' } });
let attempted: string[] = [];
const success = async (req: Request, provider: MusicProvider, id: string) => {
  assert.equal(req.headers.get('Range'), 'bytes=0-100');
  attempted.push(`${provider.name}:${id}`);
  return new Response('audio', { status: 206, headers: { 'Content-Range': 'bytes 0-100/500' } });
};
async function main() {
  const first = await streamWithCatalogFallback(request, 'video123', [saavn, yt], ctx, success);
  assert.equal(first?.status, 206); assert.deepEqual(attempted, ['jiosaavn:js:123']);
  assert.equal(searches, 1);
  await streamWithCatalogFallback(request, 'video123', [saavn, yt], ctx, success);
  assert.equal(searches, 1, 'range requests reuse the match');
  attempted = [];
  const fallback = await streamWithCatalogFallback(request, 'video123', [saavn, yt], ctx, async (_req, provider, id) => {
    attempted.push(`${provider.name}:${id}`);
    return new Response(null, { status: provider.name === 'jiosaavn' ? 502 : 200 });
  });
  assert.equal(fallback?.status, 200);
  assert.deepEqual(attempted, ['jiosaavn:js:123', 'youtube:video123']);
  attempted = [];
  await streamWithCatalogFallback(request, 'js:existing', [saavn, yt], ctx, success);
  assert.deepEqual(attempted, ['jiosaavn:js:existing']);
  attempted = [];
  await streamWithCatalogFallback(new Request('https://example.test/api/stream/video123', { headers: { Range: 'bytes=0-100' } }), 'video123', [saavn, yt], ctx, success);
  assert.deepEqual(attempted, ['youtube:video123']);
  // JioSaavn failures must search an alternate provider using metadata, not
  // hand the JioSaavn ID to YouTube as if it were a video ID.
  const alternate = track('video-real', 'Pularikalo', 'Gopi Sundar');
  const youtubeSearch = { name: 'youtube', search: async () => [track('wrong', 'Pularikalo', 'Someone Else'), alternate] } as unknown as MusicProvider;
  attempted = [];
  const originalFailed = await streamWithCatalogFallback(request, 'js:broken', [saavn, youtubeSearch], ctx, async (_req, provider, id) => {
    attempted.push(`${provider.name}:${id}`);
    return new Response(null, { status: provider.name === 'jiosaavn' ? 502 : 200 });
  });
  assert.equal(originalFailed?.status, 200);
  assert.deepEqual(attempted, ['jiosaavn:js:broken', 'youtube:video-real']);
  const mismatch = { name: 'youtube', search: async () => [track('bad', 'Pularikalo (Remix)', 'Gopi Sundar')] } as unknown as MusicProvider;
  attempted = [];
  assert.equal(await streamWithCatalogFallback(request, 'js:broken', [saavn, mismatch], ctx, async (_req, provider, id) => {
    attempted.push(`${provider.name}:${id}`); return new Response(null, { status: 502 });
  }), null);
  assert.deepEqual(attempted, ['jiosaavn:js:broken']);
  const unavailable = { name: 'jiosaavn', search: async () => { throw new Error('offline'); } } as unknown as MusicProvider;
  assert.equal(await findCatalogMatch(unavailable, 'Unique title', 'Singer'), null);
  attempted = [];
  const unknownRequest = new Request(`https://example.test/api/stream/video999?${new URLSearchParams({ title: 'Unique title', artist: 'Singer' })}`, { headers: { Range: 'bytes=0-100' } });
  await streamWithCatalogFallback(unknownRequest, 'video999', [unavailable, yt], ctx, success);
  assert.deepEqual(attempted, ['youtube:video999'], 'search failure preserves the original video fallback');
  assert.equal(await streamWithCatalogFallback(unknownRequest, 'video999', [unavailable, yt], ctx, async () => new Response(null, { status: 502 })), null);

  console.log('Playlist playback matching and fallback tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
