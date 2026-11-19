/**
 * Edge ad-blocker.
 *
 * Blocks requests to known ad / tracker / ad-insertion endpoints before
 * they ever reach the app, and strips ad-related headers from responses.
 * Mirrors the client-side blocklists in web/src/adblock/blocker.ts and
 * android/.../AdBlockInterceptor.kt — keep the three in sync.
 */
const AD_HOST_SUFFIXES = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'googletagmanager.com',
  'googletagservices.com',
  'facebook.net',
  'amazon-adsystem.com',
  'adsrvr.org',
  'adnxs.com',
  'criteo.com',
  'pubmatic.com',
  'rubiconproject.com',
  'openx.net',
  'taboola.com',
  'outbrain.com',
  'smartadserver.com',
  'hotjar.com',
  'mixpanel.com',
  'segment.io',
  'amplitude.com',
  'fullstory.com',
  'adsafeprotected.com',
  'moatads.com',
  'scorecardresearch.com',
  'quantserve.com',
];

const AD_PATH_PATTERNS = [
  '/ads/',
  '/adserver',
  '/ad-insertion',
  '/preroll',
  '/midroll',
  '/sponsor',
];

export function isAdRequest(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (AD_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) return true;
  const path = url.pathname.toLowerCase();
  return AD_PATH_PATTERNS.some((p) => path.includes(p));
}

export function adBlockedResponse(url: URL): Response {
  return new Response(
    JSON.stringify({ blocked: true, reason: 'ad-blocked', host: url.hostname }),
    {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'X-Muzii-AdBlock': 'blocked',
      },
    },
  );
}

/** Remove ad headers from an upstream response before it reaches the client. */
export function stripAdHeaders(headers: Headers): Headers {
  const clean = new Headers(headers);
  for (const key of [...clean.keys()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith('x-ad') || lower.startsWith('ad-')) clean.delete(key);
  }
  clean.set('X-Muzii-AdBlock', 'enabled');
  return clean;
}
