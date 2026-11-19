export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSec: number;
  streamUrl: string;
  artworkUrl: string;
  gradientSeed: number;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  trackIds: string[];
  gradient: string;
}
