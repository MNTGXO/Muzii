import type { MusicProvider } from './types';
import type { Playlist, Track } from '../types';

/**
 * YouTube Music provider (unofficial InnerTube API, ANDROID_MUSIC client).
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
 */

const INNER_TUBE_KEY = 'AIzaSyC9XL3ZjWddXya6XNWIqC5LtJXo3GtNLYg';
const CLIENT_VERSION = '6.21.56';
const CLIENT_NAME = '67'; // ANDROID_MUSIC
const BASE = 'https://music.youtube.com/youtubei/v1';
const STREAM_SCHEME = 'ytmusic://';

function innerTubeHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'User-Agent': `com.google.android.apps.youtube.music/${CLIENT_VERSION}`,
    'X-Goog-Api-Key': INNER_TUBE_KEY,
    'X-YouTube-Client-Name': CLIENT_NAME,
    'X-YouTube-Client-Version': CLIENT_VERSION,
    'Accept-Language': 'en-US',
  };
}

function innerTubeContext(): Record<string, unknown> {
  return {
    context: {
      client: {
        clientName: 'ANDROID_MUSIC',
        clientVersion: CLIENT_VERSION,
        hl: 'en',
        gl: 'US',
        androidVersion: 13,
      },
    },
  };
}

async function innerTubePost(path: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${BASE}/${path}?key=${INNER_TUBE_KEY}&prettyPrint=false`, {
    method: 'POST',
    headers: innerTubeHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`InnerTube ${path} failed: ${res.status}`);
  return (await res.json()) as any;
}

/** Parse "3:45" / "1:02:03" into seconds. */
function parseDuration(text: string): number {
  const parts = text.trim().split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function runsText(runs: any[] | undefined): string {
  return (runs ?? []).map((r) => r?.text ?? '').join('');
}

function parseSearchItems(data: any): Track[] {
  const contents: any[] =
    data?.tabbedSearchResults?.musicShelfRenderer?.contents ?? [];
  const tracks: Track[] = [];

  for (const item of contents) {
    const renderer = item?.musicResponsiveListItemRenderer;
    if (!renderer) continue;
    const videoId: string | undefined =
      renderer.navigationEndpoint?.watchEndpoint?.videoId;
    if (!videoId) continue;

    const columns: any[] = renderer.flexColumns ?? [];
    const colText = (i: number) =>
      runsText(columns[i]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs);

    const title = colText(0);
    if (!title) continue;

    // Column 1 usually mixes artist and album: "Artist • Album".
    const artistAlbum = colText(1)
      .split('•')
      .map((s) => s.trim())
      .filter(Boolean);
    const artist = artistAlbum[0] ?? 'Unknown Artist';
    const album = artistAlbum[1] ?? '';

    // Duration is the last column when it looks like "3:45".
    const last = colText(columns.length - 1);
    const durationSec = /^\d+:\d{2}(:\d{2})?$/.test(last.trim())
      ? parseDuration(last)
      : 0;

    tracks.push({
      id: videoId,
      title,
      artist,
      album,
      durationSec,
      // Resolved lazily at stream time — InnerTube URLs expire.
      streamUrl: `${STREAM_SCHEME}${videoId}`,
      artworkUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      gradientSeed: [...videoId].reduce((a, c) => a + c.charCodeAt(0), 0) % 360,
    });
  }
  return tracks;
}

const CATALOG_QUERIES = ['top hits', 'chill music', 'workout music', 'lofi beats'];
const CATALOG_TTL_MS = 10 * 60 * 1000;
let catalogCache: { at: number; tracks: Track[] } | null = null;

export class YouTubeMusicProvider implements MusicProvider {
  readonly name = 'youtube-music';

  async search(query: string): Promise<Track[]> {
    const data = await innerTubePost('search', {
      ...innerTubeContext(),
      query,
      params: 'EgWKAQIgAWo',
    });
    return parseSearchItems(data);
  }

  async getCatalog(): Promise<Track[]> {
    const now = Date.now();
    if (catalogCache && now - catalogCache.at < CATALOG_TTL_MS) {
      return catalogCache.tracks;
    }
    const seen = new Set<string>();
    const tracks: Track[] = [];
    const results = await Promise.all(CATALOG_QUERIES.map((q) => this.search(q)));
    for (const batch of results) {
      for (const track of batch) {
        if (!seen.has(track.id)) {
          seen.add(track.id);
          tracks.push(track);
        }
      }
    }
    catalogCache = { at: now, tracks };
    return tracks;
  }

  async getTrack(id: string): Promise<Track | null> {
    const data = await innerTubePost('player', {
      ...innerTubeContext(),
      videoId: id,
      contentCheckOk: true,
      racyCheckOk: true,
    });
    const details = data?.videoDetails;
    if (!details?.title) return null;
    return {
      id,
      title: details.title,
      artist: details.author ?? 'Unknown Artist',
      album: '',
      durationSec: Number(details.lengthSeconds ?? 0),
      streamUrl: `${STREAM_SCHEME}${id}`,
      artworkUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      gradientSeed: [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360,
    };
  }

  async getPlaylists(): Promise<Playlist[]> {
    const defs = [
      { id: 'yt-top-hits', title: 'Top Hits', description: 'The biggest tracks right now.', query: 'top hits', gradient: 'linear-gradient(135deg,#FA2D48,#FC3C44)' },
      { id: 'yt-chill', title: 'Chill Vibes', description: 'Mellow tunes for slow evenings.', query: 'chill music', gradient: 'linear-gradient(135deg,#5E5CE6,#BF5AF2)' },
      { id: 'yt-workout', title: 'Workout Energy', description: 'High-octane fuel for your session.', query: 'workout music', gradient: 'linear-gradient(135deg,#FF9F0A,#FF375F)' },
      { id: 'yt-focus', title: 'Focus Flow', description: 'Deep concentration, zero distractions.', query: 'lofi beats', gradient: 'linear-gradient(135deg,#64D2FF,#30D158)' },
    ];
    const batches = await Promise.all(defs.map((def) => this.search(def.query)));
    return defs.map((def, i) => ({
      id: def.id,
      title: def.title,
      description: def.description,
      trackIds: batches[i].slice(0, 10).map((t) => t.id),
      gradient: def.gradient,
    }));
  }

  async getLyrics(): Promise<string[]> {
    return [];
  }

  /**
   * Resolve a fresh audio URL for a videoId via the player endpoint.
   * Called at stream time because InnerTube URLs expire (~6h).
   */
  async resolveStreamUrl(id: string): Promise<string | null> {
    const data = await innerTubePost('player', {
      ...innerTubeContext(),
      videoId: id,
      contentCheckOk: true,
      racyCheckOk: true,
    });
    const formats: any[] = data?.streamingData?.adaptiveFormats ?? [];
    const audio = formats
      .filter((f) => typeof f?.mimeType === 'string' && f.mimeType.startsWith('audio/') && f.url)
      .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
    return audio[0]?.url ?? null;
  }
}
