export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSec: number;
  streamUrl: string;
  artworkUrl: string;
  /** Seed for client-side gradient artwork (Apple-Music style). */
  gradientSeed: number;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  trackIds: string[];
  /** CSS gradient used for the playlist artwork. */
  gradient: string;
}

export interface Env {
  APP_NAME: string;
  PROVIDER: string;
  CATALOG?: KVNamespace;
}
