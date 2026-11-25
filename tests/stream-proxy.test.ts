import assert from 'node:assert/strict';
import { handleStream } from '../worker/src/stream';
import type { MusicProvider } from '../worker/src/providers/types';
let resolves = 0, fetched = 0, cached: Response | null = null;
(globalThis as any).caches = { default: { match: async () => cached?.clone(), put: async (_key: Request, value: Response) => { cached = value.clone(); } } };
const ctx = { waitUntil: (p: Promise<unknown>) => { void p; } } as ExecutionContext;
const p = { name: 'jiosaavn', resolveStreamUrl: async () => { resolves++; return 'https://audio.example/song'; } } as MusicProvider;
const original = globalThis.fetch;
async function main() {
  globalThis.fetch = async (_url, init) => { fetched++; const range = new Headers(init?.headers).get('Range'); return new Response('audio', { status: range ? 206 : 200, headers: { 'Content-Type': 'audio/mpeg', ...(range ? { 'Content-Range': 'bytes 0-4/5' } : {}) } }); };
  const req = new Request('https://muzii.test/api/stream/js%3Aabc');
  assert.equal((await handleStream(req, p, 'js:abc', ctx)).status, 200);
  assert.ok(cached); assert.equal(resolves, 1); assert.equal(fetched, 1);
  assert.equal((await handleStream(req, p, 'js:abc', ctx)).status, 200);
  assert.equal(resolves, 1, 'cached audio does not require provider availability');
  const ranged = await handleStream(new Request(req, { headers: { Range: 'bytes=0-4' } }), p, 'js:abc', ctx);
  assert.equal(ranged.status, 206); assert.equal(ranged.headers.get('Content-Range'), 'bytes 0-4/5');
  assert.equal(fetched, 2);
  const invalid = { name: 'bad', resolveStreamUrl: async () => 'not a URL' } as MusicProvider;
  assert.equal((await handleStream(new Request(req, { headers: { Range: 'bytes=0-4' } }), invalid, 'x', ctx)).status, 502);
  console.log('Stream proxy cache, errors and range tests passed');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { globalThis.fetch = original; });
