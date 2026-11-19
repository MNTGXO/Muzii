import type { Playlist, Track } from '../types';

/**
 * Music provider abstraction.
 *
 * The built-in DemoProvider serves royalty-free sample streams so the app
 * works out of the box. To ship a real product, implement this interface
 * against a licensed catalog (e.g. JioSaavn, YouTube Music, SoundCloud,
 * or your own label deals) and set PROVIDER in wrangler.toml.
 */
export interface MusicProvider {
  readonly name: string;
  /**
   * Home feed. `languages` are the ones the listener picked at onboarding
   * (lowercase, e.g. ['malayalam']); an empty list means "no preference".
   */
  getCatalog(languages?: string[]): Promise<Track[]>;
  search(query: string): Promise<Track[]>;
  getTrack(id: string): Promise<Track | null>;
  getPlaylists(languages?: string[]): Promise<Playlist[]>;
  getLyrics(trackId: string): Promise<string[]>;
  /**
   * Resolve a playable audio URL for a track id. Providers with expiring
   * URLs (e.g. YouTube Music) resolve lazily at stream time; providers with
   * stable URLs (demo) return the track's streamUrl directly.
   */
  resolveStreamUrl(id: string): Promise<string | null>;
}
