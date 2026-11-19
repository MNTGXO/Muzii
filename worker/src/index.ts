import type { Env } from './types';
import type { MusicProvider } from './providers/types';
import { DemoProvider } from './providers/demo';
import { YouTubeMusicProvider } from './providers/youtube';
import { adBlockedResponse, isAdRequest } from './adblock';
import { handleStream } from './stream';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'Access-Control-Expose-Headers':
    'Content-Range, Accept-Ranges, Content-Length',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function getProvider(env: Env): MusicProvider {
  return env.PROVIDER === 'youtube' ? new YouTubeMusicProvider() : new DemoProvider();
}

/**
 * Run against the configured provider; if it fails (InnerTube is unofficial
 * and can break), fall back to the demo catalog so the app never hard-fails.
 */
async function withFallback<T>(
  primary: MusicProvider,
  fn: (p: MusicProvider) => Promise<T>,
): Promise<T> {
  try {
    return await fn(primary);
  } catch (err) {
    if (primary.name === 'demo') throw err;
    return fn(new DemoProvider());
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // Edge ad-blocker: drop ad/tracker requests before anything else runs.
    if (isAdRequest(url)) return adBlockedResponse(url);

    const provider = getProvider(env);

    try {
      if (url.pathname === '/health') {
        return json({
          ok: true,
          app: env.APP_NAME,
          provider: provider.name,
          adblock: 'enabled',
        });
      }

      if (url.pathname === '/api/catalog') {
        return json(await withFallback(provider, (p) => p.getCatalog()));
      }
      if (url.pathname === '/api/playlists') {
        return json(await withFallback(provider, (p) => p.getPlaylists()));
      }

      if (url.pathname === '/api/search') {
        const q = url.searchParams.get('q') ?? '';
        return json(await withFallback(provider, (p) => p.search(q)));
      }

      const trackMatch = url.pathname.match(/^\/api\/track\/([^/]+)$/);
      if (trackMatch) {
        const id = decodeURIComponent(trackMatch[1]);
        const track = await withFallback(provider, (p) => p.getTrack(id));
        return track ? json(track) : json({ error: 'track-not-found' }, 404);
      }

      const lyricsMatch = url.pathname.match(/^\/api\/lyrics\/([^/]+)$/);
      if (lyricsMatch) {
        const id = decodeURIComponent(lyricsMatch[1]);
        return json(await withFallback(provider, (p) => p.getLyrics(id)));
      }

      const streamMatch = url.pathname.match(/^\/api\/stream\/([^/]+)$/);
      if (streamMatch) {
        const id = decodeURIComponent(streamMatch[1]);
        const res = await handleStream(request, provider, id, ctx);
        // If the primary provider can't stream, retry with the demo catalog.
        if (res.status === 502 && provider.name !== 'demo') {
          return handleStream(request, new DemoProvider(), id, ctx);
        }
        return res;
      }

      return json(
        {
          error: 'not-found',
          docs: 'GET /api/catalog | /api/search?q= | /api/playlists | /api/stream/:id',
        },
        404,
      );
    } catch (err) {
      return json({ error: 'internal', message: String(err) }, 500);
    }
  },
};
