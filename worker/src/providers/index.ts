import type { Env } from '../types';
import type { MusicProvider } from './types';
import { DemoProvider } from './demo';
import { YouTubeMusicProvider } from './youtube';
import { JioSaavnProvider } from './jiosaavn';

/**
 * Provider chain.
 *
 * Building one provider is not enough for a deployed app:
 * - YouTube Music (InnerTube) has the widest catalog but refuses most
 *   player calls from datacenter IPs (Cloudflare included) and its media
 *   URLs are IP-bound → search/playback are unreliable from a Worker.
 * - JioSaavn answers plain JSON and serves audio from a public CDN that is
 *   not IP-bound → reliable through the Worker, and it is the deepest
 *   source for Indian-language music.
 * - Demo is the always-available safety net.
 *
 * `PROVIDER` in wrangler.toml picks the order:
 *   "jiosaavn" (default) → JioSaavn, YouTube Music, Demo
 *   "youtube"            → YouTube Music, JioSaavn, Demo
 *   "demo"               → Demo only
 */
export function providerChain(env: Env): MusicProvider[] {
  const youtube = () => new YouTubeMusicProvider();
  const jiosaavn = () => new JioSaavnProvider();
  const demo = () => new DemoProvider();

  switch (env.PROVIDER) {
    case 'demo':
      return [demo()];
    case 'youtube':
      return [youtube(), jiosaavn(), demo()];
    case 'jiosaavn':
    default:
      return [jiosaavn(), youtube(), demo()];
  }
}

export function primaryProvider(env: Env): MusicProvider {
  return providerChain(env)[0];
}
