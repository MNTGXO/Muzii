import type { Env } from './types';
import { DemoProvider } from './providers/demo';
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // Edge ad-blocker: drop ad/tracker requests before anything else runs.
    if (isAdRequest(url)) return adBlockedResponse(url);

    // Swap via env.PROVIDER in production (see providers/types.ts).
    const provider = new DemoProvider();

    try {
      if (url.pathname === '/health') {
        return json({
          ok: true,
          app: env.APP_NAME,
          provider: provider.name,
          adblock: 'enabled',
        });
      }

      if (url.pathname === '/api/catalog') return json(await provider.getCatalog());
      if (url.pathname === '/api/playlists') return json(await provider.getPlaylists());

      if (url.pathname === '/api/search') {
        const q = url.searchParams.get('q') ?? '';
        return json(await provider.search(q));
      }

      const trackMatch = url.pathname.match(/^\/api\/track\/([^/]+)$/);
      if (trackMatch) {
        const track = await provider.getTrack(decodeURIComponent(trackMatch[1]));
        return track ? json(track) : json({ error: 'track-not-found' }, 404);
      }

      const lyricsMatch = url.pathname.match(/^\/api\/lyrics\/([^/]+)$/);
      if (lyricsMatch) {
        return json(await provider.getLyrics(decodeURIComponent(lyricsMatch[1])));
      }

      const streamMatch = url.pathname.match(/^\/api\/stream\/([^/]+)$/);
      if (streamMatch) {
        return handleStream(request, provider, decodeURIComponent(streamMatch[1]), ctx);
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
