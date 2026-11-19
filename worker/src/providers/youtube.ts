import type { MusicProvider } from './types';
import type { Playlist, Track } from '../types';
import { searchViaPiped, streamViaPiped } from './ytfallback';

/**
 * YouTube Music provider (unofficial InnerTube API).
 *
 * Why YouTube Music and not Spotify?
 * - Spotify's official API is metadata-only. Its audio is DRM-protected and
 *   Premium-only via a proprietary playback SDK — streams cannot be proxied
 *   by a Worker, and Spotify's ToS forbids stream extraction.
 * - YouTube Music has no official API, but InnerTube returns both metadata
 *   and stream URLs, which is the only viable audio source for a
 *   proxy-based architecture (same approach as open-source apps like Spotube).
 *
 * Trade-offs: InnerTube is unofficial — Google can change clients at any
 * time, and stream URLs expire (~6h), so they are resolved lazily at stream
 * time (see stream.ts) rather than stored. If InnerTube is unreachable or
 * changes shape, index.ts falls back to the DemoProvider automatically.
 *
 * Client strategy (resilience):
 * - Metadata: ANDROID_MUSIC first, then WEB_REMIX, then plain ANDROID —
 *   each client parses the same response shape, so a single working
 *   client is enough and the others are pure redundancy.
 * - Stream resolution: ANDROID_MUSIC, then ANDROID (the YouTube app client
 *   returns direct URLs more often).
 * - Client versions must be kept current: YouTube rejects stale versions
 *   with 400/404 errors. Bump CLIENTS when playback/search breaks.
 * - The X-YouTube-Client-Name numeric id must MATCH the body's clientName
 *   (ANDROID_MUSIC = 21, ANDROID = 3, WEB_REMIX = 67). Sending a mismatched
 *   header makes InnerTube silently return empty results — the original
 *   "No results" bug.
 */

type InnerTubeClientName =
  | 'ANDROID_VR'
  | 'IOS'
  | 'ANDROID_MUSIC'
  | 'ANDROID'
  | 'WEB_REMIX';

interface InnerTubeClient {
  clientName: InnerTubeClientName;
  clientVersion: string;
  /** Numeric X-YouTube-Client-Name header id — must match clientName. */
  clientId: string;
  userAgent: string;
  extraContext?: Record<string, unknown>;
}

const CLIENTS = {
  // ANDROID_VR is the most permissive player client right now: un-ciphered,
  // un-throttled URLs and usually no PO token required.
  ANDROID_VR: {
    clientName: 'ANDROID_VR',
    clientVersion: '1.62.27',
    clientId: '28',
    userAgent: 'com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    extraContext: { androidVersion: '12L', osName: 'Android', deviceMake: 'Oculus', deviceModel: 'Quest 3' },
  },
  IOS: {
    clientName: 'IOS',
    clientVersion: '19.29.1',
    clientId: '5',
    userAgent: 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)',
    extraContext: { deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '17.5.1.21F90' },
  },
  ANDROID_MUSIC: {
    clientName: 'ANDROID_MUSIC',
    clientVersion: '7.19.52',
    clientId: '21',
    userAgent: 'com.google.android.apps.youtube.music/7.19.52 (Linux; U; Android 15; en_US)',
    extraContext: { androidVersion: '15', osName: 'Android' },
  },
  ANDROID: {
    clientName: 'ANDROID',
    clientVersion: '19.26.35',
    clientId: '3',
    userAgent: 'com.google.android.youtube/19.26.35 (Linux; U; Android 15) gzip',
    extraContext: { androidVersion: '15', osName: 'Android' },
  },
  WEB_REMIX: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20241104.01.00',
    clientId: '67',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
} satisfies Record<InnerTubeClientName, InnerTubeClient>;

/** Metadata client order — first client that returns items wins. */
const METADATA_CLIENTS: InnerTubeClient[] = [
  CLIENTS.ANDROID_MUSIC,
  CLIENTS.WEB_REMIX,
  CLIENTS.ANDROID,
  CLIENTS.IOS,
];

/**
 * Player client order. Measured behaviour (see the repo README): YouTube
 * refuses most InnerTube player calls from datacenter IPs (Cloudflare
 * included) with LOGIN_REQUIRED / "Sign in to confirm you're not a bot".
 * ANDROID_VR then IOS are the clients most likely to hand back a usable
 * direct URL from such an IP, so they are tried first.
 */
const PLAYER_CLIENTS: InnerTubeClient[] = [
  CLIENTS.ANDROID_VR,
  CLIENTS.IOS,
  CLIENTS.ANDROID_MUSIC,
  CLIENTS.ANDROID,
];

const INNER_TUBE_KEY = 'AIzaSyC9XL3ZjWddXya6XNWIqC5LtJXo3GtNLYg';
const BASE = 'https://music.youtube.com/youtubei/v1';
const STREAM_SCHEME = 'ytmusic://';

function innerTubeHeaders(client: InnerTubeClient): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'User-Agent': client.userAgent,
    'X-Goog-Api-Key': INNER_TUBE_KEY,
    'X-YouTube-Client-Name': client.clientId,
    'X-YouTube-Client-Version': client.clientVersion,
    'Accept-Language': 'en-US,en;q=0.9',
  };
}

function innerTubeContext(client: InnerTubeClient): Record<string, unknown> {
  return {
    context: {
      client: {
        clientName: client.clientName,
        clientVersion: client.clientVersion,
        hl: 'en',
        gl: 'US',
        ...client.extraContext,
      },
    },
  };
}

async function innerTubePost(
  client: InnerTubeClient,
  path: string,
  body: Record<string, unknown>,
): Promise<any> {
  const res = await fetch(`${BASE}/${path}?key=${INNER_TUBE_KEY}&prettyPrint=false`, {
    method: 'POST',
    headers: innerTubeHeaders(client),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`InnerTube ${client.clientName} ${path} failed: ${res.status}`);
  }
  return (await res.json()) as any;
}

/** Parse "3:45" / "1:02:03" into seconds. */
function parseDuration(text: string): number {
  const parts = text.trim().split(':').map(Number);
  if (!parts.length || parts.some(Number.isNaN)) return 0;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function runsText(runs: any[] | undefined): string {
  return (runs ?? []).map((r) => r?.text ?? '').join('');
}

/** Type labels YouTube prepends in the subtitle column. */
const TYPE_LABELS = new Set([
  'song',
  'video',
  'single',
  'ep',
  'album',
  'playlist',
  'artist',
  'podcast',
]);

const DURATION_RE = /^\d{1,2}:\d{2}(:\d{2})?$/;

function trackFromId(
  id: string,
  title: string,
  artist: string,
  album: string,
  durationSec: number,
): Track {
  return {
    id,
    title,
    artist: artist || 'Unknown Artist',
    album,
    durationSec,
    // Resolved lazily at stream time — InnerTube URLs expire.
    streamUrl: `${STREAM_SCHEME}${id}`,
    artworkUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    gradientSeed: [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360,
  };
}

/**
 * Parse a search response. Handles both the Android shape
 * (`musicShelfRenderer.contents`) and the web/remix shape
 * (`tabbedSearchResultsRenderer.tabs[0].tabRenderer.content...`), and
 * tolerates `musicShelfRenderer` being reached via different nesting.
 */
function parseSearchItems(data: any): Track[] {
  const shelves: any[] = [];
  const collect = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.musicShelfRenderer?.contents) shelves.push(node.musicShelfRenderer.contents);
    if (node.musicCardShelfRenderer) {
      // Single top-result card (best match) — treated as one row below.
    }
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === 'object') collect(value);
    }
  };
  collect(data);

  const tracks: Track[] = [];
  const seen = new Set<string>();

  for (const contents of shelves) {
    for (const item of contents as any[]) {
      const renderer = item?.musicResponsiveListItemRenderer;
      if (!renderer) continue;

      const videoId: string | undefined =
        renderer.navigationEndpoint?.watchEndpoint?.videoId ??
        renderer.overlay?.musicItemThumbnailOverlayRenderer?.content
          ?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ??
        renderer.flexColumns
          ?.map((c: any) => c?.musicResponsiveListItemFlexColumnRenderer)
          ?.map(
            (c: any) =>
              c?.text?.runs?.find((r: any) => r?.navigationEndpoint?.watchEndpoint?.videoId)
                ?.navigationEndpoint.watchEndpoint.videoId,
          )
          ?.find(Boolean);
      if (!videoId || seen.has(videoId)) continue;

      const columns: any[] = renderer.flexColumns ?? [];
      const colText = (i: number) =>
        runsText(columns[i]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs).trim();

      const title = colText(0);
      if (!title) continue;

      // Subtitle mixes type/artist/album: "Song • Artist • Album".
      // Older clients use " • " with flexible spacing.
      const parts = colText(1)
        .split(/\s*[•·]\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length > 1 && TYPE_LABELS.has(parts[0].toLowerCase())) parts.shift();
      const artist = parts[0] ?? 'Unknown Artist';
      const album = parts.length > 1 ? parts[parts.length - 1] : '';

      // Duration is usually the last column; sometimes its own text.
      const last = colText(columns.length - 1);
      const durationSec = DURATION_RE.test(last) ? parseDuration(last) : 0;

      seen.add(videoId);
      tracks.push(trackFromId(videoId, title, artist, album, durationSec));
    }
  }

  // Best-match card (musicCardShelfRenderer) — only when the shelf was empty,
  // to avoid duplicating items already present.
  if (!tracks.length) {
    const card = findFirst(data, 'musicCardShelfRenderer');
    const videoId: string | undefined =
      card?.onTap?.watchEndpoint?.videoId ??
      card?.buttons?.map((b: any) => b?.buttonRenderer?.navigationEndpoint?.watchEndpoint?.videoId)
        ?.find(Boolean);
    const title = runsText(card?.title?.runs).trim();
    if (videoId && title) {
      const subtitleRuns = card?.subtitle?.runs ?? [];
      const parts = runsText(subtitleRuns)
        .split(/\s*[•·]\s*/)
        .map((s: string) => s.trim())
        .filter(Boolean);
      if (parts.length > 1 && TYPE_LABELS.has(parts[0].toLowerCase())) parts.shift();
      tracks.push(
        trackFromId(videoId, title, parts[0] ?? 'Unknown Artist', parts[1] ?? '', 0),
      );
    }
  }

  return tracks;
}

/** Depth-first lookup of the first object with the given key. */
function findFirst(node: any, key: string, depth = 0): any {
  if (!node || typeof node !== 'object' || depth > 12) return null;
  if (node[key]) return node[key];
  for (const k of Object.keys(node)) {
    const value = node[k];
    const found = Array.isArray(value)
      ? value.map((v) => findFirst(v, key, depth + 1)).find(Boolean)
      : findFirst(value, key, depth + 1);
    if (found) return found;
  }
  return null;
}

/** Try each metadata client until one returns a non-empty result. */
async function searchWithFallback(query: string, params?: string): Promise<Track[]> {
  let lastError: unknown = null;
  for (const client of METADATA_CLIENTS) {
    try {
      const data = await innerTubePost(client, 'search', {
        ...innerTubeContext(client),
        query,
        ...(params ? { params } : {}),
      });
      const tracks = parseSearchItems(data);
      if (tracks.length) return tracks;
    } catch (err) {
      lastError = err;
    }
  }
  // InnerTube gave nothing (or errored): try public Piped/Invidious mirrors.
  // Google increasingly blocks datacenter IPs, which is exactly what a
  // Cloudflare Worker egresses from.
  const mirrored = await searchViaPiped(query).catch(() => [] as Track[]);
  if (mirrored.length) return mirrored;
  if (lastError) throw lastError;
  return [];
}

const CATALOG_QUERIES = [
  'top hits 2025',
  'chill music',
  'workout music',
  'lofi beats',
  'trending songs',
];
const CATALOG_TTL_MS = 10 * 60 * 1000;
let catalogCache: { at: number; tracks: Track[] } | null = null;

function playlistDefs() {
  return [
    {
      id: 'yt-top-hits',
      title: 'Top Hits',
      description: 'The biggest tracks right now.',
      query: 'top hits 2025',
      gradient: 'linear-gradient(135deg,#FA2D48,#FC3C44)',
    },
    {
      id: 'yt-chill',
      title: 'Chill Vibes',
      description: 'Mellow tunes for slow evenings.',
      query: 'chill music',
      gradient: 'linear-gradient(135deg,#5E5CE6,#BF5AF2)',
    },
    {
      id: 'yt-workout',
      title: 'Workout Energy',
      description: 'High-octane fuel for your session.',
      query: 'workout music',
      gradient: 'linear-gradient(135deg,#FF9F0A,#FF375F)',
    },
    {
      id: 'yt-focus',
      title: 'Focus Flow',
      description: 'Deep concentration, zero distractions.',
      query: 'lofi beats',
      gradient: 'linear-gradient(135deg,#64D2FF,#30D158)',
    },
  ];
}

export class YouTubeMusicProvider implements MusicProvider {
  readonly name = 'youtube-music';

  async search(query: string): Promise<Track[]> {
    return searchWithFallback(query);
  }

  async getCatalog(): Promise<Track[]> {
    const now = Date.now();
    if (catalogCache && now - catalogCache.at < CATALOG_TTL_MS) {
      return catalogCache.tracks;
    }
    const seen = new Set<string>();
    const tracks: Track[] = [];
    const results = await Promise.all(
      CATALOG_QUERIES.map((q) => searchWithFallback(q).catch(() => [] as Track[])),
    );
    for (const batch of results) {
      for (const track of batch) {
        if (!seen.has(track.id)) {
          seen.add(track.id);
          tracks.push(track);
        }
      }
    }
    if (tracks.length) catalogCache = { at: now, tracks };
    return tracks;
  }

  async getTrack(id: string): Promise<Track | null> {
    for (const client of METADATA_CLIENTS) {
      try {
        const data = await innerTubePost(client, 'player', {
          ...innerTubeContext(client),
          videoId: id,
          contentCheckOk: true,
          racyCheckOk: true,
        });
        const details = data?.videoDetails;
        if (details?.title) {
          return trackFromId(
            id,
            details.title,
            details.author ?? 'Unknown Artist',
            '',
            Number(details.lengthSeconds ?? 0),
          );
        }
      } catch {
        // Try the next client.
      }
    }
    return null;
  }

  async getPlaylists(): Promise<Playlist[]> {
    const defs = playlistDefs();
    const batches = await Promise.all(
      defs.map((def) => searchWithFallback(def.query).catch(() => [] as Track[])),
    );
    return defs.map((def, i) => {
      const tracks = batches[i].slice(0, 10);
      return {
        id: def.id,
        title: def.title,
        description: def.description,
        trackIds: tracks.map((t) => t.id),
        // Embed full tracks: playlist ids come from separate searches and
        // are not in the catalog, so clients can't filter the catalog.
        tracks,
        gradient: def.gradient,
      };
    });
  }

  async getLyrics(): Promise<string[]> {
    return [];
  }

  /**
   * Resolve a fresh audio URL for a videoId via the player endpoint.
   * Called at stream time because InnerTube URLs expire (~6h).
   * Only formats with a direct `url` are usable — `signatureCipher`
   * formats need player-JS deciphering, which a Worker cannot do.
   */
  async resolveStreamUrl(id: string): Promise<string | null> {
    for (const client of PLAYER_CLIENTS) {
      try {
        const data = await innerTubePost(client, 'player', {
          ...innerTubeContext(client),
          videoId: id,
          contentCheckOk: true,
          racyCheckOk: true,
        });
        const formats: any[] = data?.streamingData?.adaptiveFormats ?? [];
        const audio = formats
          .filter((f) => typeof f?.mimeType === 'string' && f.mimeType.startsWith('audio/') && f.url)
          // Prefer Opus (best quality/size), then highest bitrate.
          .sort((a, b) => {
            const opusA = a.mimeType.includes('opus') ? 1 : 0;
            const opusB = b.mimeType.includes('opus') ? 1 : 0;
            return opusB - opusA || (b.bitrate ?? 0) - (a.bitrate ?? 0);
          });
        if (audio[0]?.url) return audio[0].url as string;
      } catch {
        // Try the next client.
      }
    }
    // Last resort: public mirrors that proxy the audio themselves.
    return streamViaPiped(id).catch(() => null);
  }
}
