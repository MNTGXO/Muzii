import type { Track } from '../types';

/**
 * Secondary YouTube data path.
 *
 * InnerTube is unofficial and Google increasingly answers datacenter IPs
 * (Cloudflare Workers included) with empty results or "confirm you're not a
 * bot". Public Piped / Invidious mirrors solve that by exposing the same
 * YouTube catalog over a simple JSON API and proxying the audio themselves.
 *
 * These are community-run instances, so:
 * - every request tries instances in order until one answers,
 * - requests carry a short timeout so a dead mirror can't stall the Worker,
 * - results are normalised into the same `Track` shape as the InnerTube
 *   provider, so callers never know which path produced them.
 */

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.drgns.space',
];

const INVIDIOUS_INSTANCES = ['https://inv.nadeko.net', 'https://invidious.nerdvpn.de'];

const TIMEOUT_MS = 8000;

function trackFromId(
  id: string,
  title: string,
  artist: string,
  album: string,
  durationSec: number,
  artworkUrl?: string,
): Track {
  return {
    id,
    title,
    artist: artist || 'Unknown Artist',
    album,
    durationSec: Math.max(0, Math.round(durationSec || 0)),
    streamUrl: `ytmusic://${id}`,
    artworkUrl: artworkUrl || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    gradientSeed: [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360,
  };
}

function videoIdFromUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = raw.match(/(?:v=|\/watch\/|\/videos\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return (await res.json()) as any;
}

/** Search through Piped mirrors. Returns [] when every mirror fails. */
export async function searchViaPiped(query: string): Promise<Track[]> {
  const piped = PIPED_INSTANCES.map(async base => {
    const data = await getJson(`${base}/search?q=${encodeURIComponent(query)}&filter=music_songs`);
    const items: any[] = Array.isArray(data?.items) ? data.items : [];
    const tracks = items.filter(it => it && (it.type === 'stream' || it.url?.includes('watch')))
      .map(it => {
        const id = videoIdFromUrl(it.url);
        return id ? trackFromId(id, it.title ?? 'Unknown title', it.uploaderName ?? '', it.album ?? '', Number(it.duration ?? 0), it.thumbnail) : null;
      }).filter((t): t is Track => t !== null);
    if (!tracks.length) throw new Error('empty search');
    return tracks;
  });
  const invidious = INVIDIOUS_INSTANCES.map(async base => {
    const data = await getJson(`${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video`);
    const items: any[] = Array.isArray(data) ? data : [];
    const tracks = items.filter(it => it?.videoId).map(it =>
      trackFromId(it.videoId, it.title ?? 'Unknown title', it.author ?? '', '', Number(it.lengthSeconds ?? 0), `https://i.ytimg.com/vi/${it.videoId}/hqdefault.jpg`));
    if (!tracks.length) throw new Error('empty search');
    return tracks;
  });
  try { return await Promise.any([...piped, ...invidious]); }
  catch { return []; }
}

/** Resolve through the first working mirror without serial timeout delays. */
export async function streamViaPiped(id: string): Promise<string | null> {
  const piped = PIPED_INSTANCES.map(async base => {
    const data = await getJson(`${base}/streams/${encodeURIComponent(id)}`);
    const audio: any[] = Array.isArray(data?.audioStreams) ? data.audioStreams : [];
    const url = [...audio].sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]?.url;
    if (typeof url !== 'string' || !url.startsWith('http')) throw new Error('no audio');
    return url as string;
  });
  const invidious = INVIDIOUS_INSTANCES.map(async base => {
    const data = await getJson(`${base}/api/v1/videos/${encodeURIComponent(id)}`);
    const formats: any[] = Array.isArray(data?.adaptiveFormats) ? data.adaptiveFormats : [];
    const url = formats.filter(f => typeof f?.type === 'string' && f.type.startsWith('audio/'))
      .sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0))[0]?.url;
    if (typeof url !== 'string' || !url.startsWith('http')) throw new Error('no audio');
    return url as string;
  });
  try { return await Promise.any([...piped, ...invidious]); }
  catch { return null; }
}
