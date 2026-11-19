/**
 * Client-side ad blocker (web).
 *
 * Three layers:
 * 1. fetchWithAdBlock — every API/stream request is checked against the
 *    blocklist before it hits the network (mirrors the Worker + Android).
 * 2. installAdBlocker — removes ad DOM nodes as they appear (MutationObserver)
 *    and injects CSS that hides known ad slots.
 * 3. Popup guard — window.open is neutralised so ad popups can't spawn.
 *
 * Keep AD_HOSTS in sync with worker/src/adblock.ts and
 * android/.../AdBlockInterceptor.kt.
 */
export const AD_HOSTS = [
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

const AD_NODE_PATTERNS = [
  'adsbygoogle',
  'doubleclick',
  'ad-slot',
  'adslot',
  'advertisement',
  'sponsored',
  'googlesyndication',
  'taboola',
  'outbrain',
];

export function isAdUrl(raw: string): boolean {
  try {
    const url = new URL(raw, window.location.origin);
    const host = url.hostname.toLowerCase();
    if (AD_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return true;
    return AD_PATH_PATTERNS.some((p) => url.pathname.toLowerCase().includes(p));
  } catch {
    return false;
  }
}

/** fetch() wrapper that refuses ad/tracker URLs before they hit the network. */
export async function fetchWithAdBlock(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  if (isAdUrl(url)) {
    console.warn('[Muzii AdBlock] blocked', url);
    return new Response(
      JSON.stringify({ blocked: true, reason: 'ad-blocked' }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'X-Muzii-AdBlock': 'blocked',
        },
      },
    );
  }
  return fetch(input, init);
}

const AD_CSS = [
  '[class*="adsbygoogle"],[class*="ad-slot"],[class*="adslot"],',
  '[id*="ad-slot"],[class*="advertisement"],[class*="sponsored"],',
  'ins.adsbygoogle{display:none!important}',
].join('');

// Hide ad containers that already exist in the DOM.
function sweepAds(root: ParentNode = document): void {
  root.querySelectorAll('script, iframe, ins, div').forEach((el) => {
    const marker = `${el.className} ${el.id} ${el.getAttribute('src') ?? ''}`.toLowerCase();
    if (AD_NODE_PATTERNS.some((p) => marker.includes(p))) el.remove();
  });
}

export function installAdBlocker(): () => void {
  const style = document.createElement('style');
  style.textContent = AD_CSS;
  document.head.appendChild(style);
  sweepAds();

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((n) => {
        if (n instanceof Element) sweepAds(n as unknown as ParentNode);
      });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const originalOpen = window.open;
  window.open = (() => {
    console.warn('[Muzii AdBlock] popup blocked');
    return null;
  }) as typeof window.open;

  return () => {
    observer.disconnect();
    style.remove();
    window.open = originalOpen;
  };
}
