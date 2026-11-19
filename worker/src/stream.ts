import type { MusicProvider } from './providers/types';
import { adBlockedResponse, isAdRequest, stripAdHeaders } from './adblock';

/**
 * Audio streaming proxy.
 *
 * - Forwards Range requests so <audio>/ExoPlayer can seek (206 Partial Content).
 * - Caches full (non-range) responses at the edge for instant replays.
 * - Runs every upstream URL through the ad-blocker first.
 */
export async function handleStream(
  request: Request,
  provider: MusicProvider,
  id: string,
  ctx: ExecutionContext,
): Promise<Response> {
  const track = await provider.getTrack(id);
  if (!track) {
    return new Response(JSON.stringify({ error: 'track-not-found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const upstreamUrl = new URL(track.streamUrl);
  if (isAdRequest(upstreamUrl)) return adBlockedResponse(upstreamUrl);

  const range = request.headers.get('Range');
  const cache = caches.default;
  const cacheKey = new Request(upstreamUrl.toString(), { method: 'GET' });

  if (!range) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  const upstreamHeaders = new Headers({
    'User-Agent': 'Muzii/1.0 (+https://github.com/MNTGXO/Muzii)',
  });
  if (range) upstreamHeaders.set('Range', range);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl.toString(), { headers: upstreamHeaders });
  } catch {
    return new Response(JSON.stringify({ error: 'upstream-unreachable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new Response(
      JSON.stringify({ error: 'upstream-error', status: upstream.status }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const headers = stripAdHeaders(upstream.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'public, max-age=86400');
  headers.set('Access-Control-Allow-Origin', '*');

  const response = new Response(upstream.body, { status: upstream.status, headers });
  if (!range && upstream.ok) {
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}
