import type { MusicProvider } from './providers/types';
import { adBlockedResponse, isAdRequest, stripAdHeaders } from './adblock';

/**
 * Audio streaming proxy.
 *
 * - Resolves the upstream audio URL via the provider (one call — YouTube
 *   Music resolves lazily from the video id, demo returns a stable URL).
 * - Forwards Range requests so <audio>/ExoPlayer can seek (206 Partial Content).
 * - Caches full (non-range) responses at the edge for instant replays.
 * - Runs every upstream URL through the ad-blocker first.
 * - Uses the YouTube Music Android User-Agent for googlevideo fetches —
 *   googlevideo validates the UA of URLs issued by InnerTube.
 */

const STREAM_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
};

function streamError(error: string, status: number, extra?: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/json', ...STREAM_CORS },
  });
}

export async function handleStream(
  request: Request,
  provider: MusicProvider,
  id: string,
  ctx: ExecutionContext,
): Promise<Response> {
  // One provider call: YouTube resolves a fresh URL from the video id,
  // demo returns the track's stable streamUrl.
  let upstreamUrlStr: string | null;
  try {
    upstreamUrlStr = await provider.resolveStreamUrl(id);
  } catch {
    upstreamUrlStr = null;
  }
  if (!upstreamUrlStr) {
    return streamError('stream-unavailable', 502);
  }

  const upstreamUrl = new URL(upstreamUrlStr);
  if (isAdRequest(upstreamUrl)) return adBlockedResponse(upstreamUrl);

  const range = request.headers.get('Range');
  const cache = caches.default;
  // Cache by track id — upstream URLs may expire (YouTube Music).
  const cacheKey = new Request(`https://muzii.cache/stream/${id}`, { method: 'GET' });

  if (!range) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  const upstreamHeaders = new Headers();
  // googlevideo validates the UA of URLs issued by InnerTube; other CDNs
  // (e.g. Piped mirrors) are happier with a normal browser UA.
  upstreamHeaders.set(
    'User-Agent',
    upstreamUrl.hostname.endsWith('googlevideo.com')
      ? 'com.google.android.apps.youtube.music/7.19.52 (Linux; U; Android 15; en_US)'
      : 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
  );
  if (range) upstreamHeaders.set('Range', range);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl.toString(), { headers: upstreamHeaders });
  } catch {
    return streamError('upstream-unreachable', 502);
  }

  if (!upstream.ok && upstream.status !== 206) {
    return streamError('upstream-error', 502, { status: upstream.status });
  }

  const headers = stripAdHeaders(upstream.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'public, max-age=86400');
  headers.set('Access-Control-Allow-Origin', '*');

  const response = new Response(upstream.body, { status: upstream.status, headers });
  if (!range && upstream.status === 200) {
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }
  return response;
}
