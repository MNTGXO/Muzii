import assert from 'node:assert/strict';
import { YouTubeMusicProvider } from '../worker/src/providers/youtube';
import { streamViaPiped } from '../worker/src/providers/ytfallback';

async function main() {
  const original = globalThis.fetch;
  try {
    let calls: string[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input); calls.push(url);
      if (url.includes('youtubei')) {
        const body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify(body.context.client.clientName === 'IOS'
          ? { streamingData: { adaptiveFormats: [{ mimeType: 'audio/mp4', url: 'https://audio.test/ios', bitrate: 128000 }] } }
          : {}), { status: 200 });
      }
      throw new Error('unexpected');
    };
    assert.equal(await new YouTubeMusicProvider().resolveStreamUrl('video123'), 'https://audio.test/ios');
    assert.equal(calls.length, 4, 'player clients are tried concurrently');
    calls = [];
    globalThis.fetch = async input => {
      const url = String(input); calls.push(url);
      if (url.includes('adminforge')) return new Response(JSON.stringify({ audioStreams: [{ bitrate: 128, url: 'https://audio.test/mirror' }] }), { status: 200 });
      return new Response('{}', { status: 503 });
    };
    assert.equal(await streamViaPiped('video123'), 'https://audio.test/mirror');
    assert.equal(calls.length, 6, 'mirrors are tried concurrently');
    globalThis.fetch = async () => new Response('{}', { status: 503 });
    assert.equal(await streamViaPiped('video123'), null);
  } finally { globalThis.fetch = original; }
  console.log('Playback provider fallback tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
