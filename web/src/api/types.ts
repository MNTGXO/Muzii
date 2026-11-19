export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSec: number;
  streamUrl: string;
  artworkUrl: string;
  gradientSeed: number;
  /** Spoken language, e.g. "malayalam". Drives the language-locked radio. */
  language?: string;
  /** Release year — used to keep a station in one era. */
  year?: number;
  /** Music director / composer — a strong "same feel" signal. */
  composer?: string;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  trackIds: string[];
  /** Full track objects (YouTube ids aren't in the catalog). */
  tracks?: Track[];
  gradient: string;
}

/** A jam member as seen by clients. */
export interface JamState {
  code: string;
  hostName: string;
  locked: boolean;
  active: boolean;
  queue: Track[];
  index: number;
  currentTrack: Track | null;
  /** Server-computed position of the current track, for late joiners. */
  positionMs: number;
  members: string[];
  messages: { id: string; author: string; text: string; at: number }[];
  createdAt: number;
  /** True when this client's token is the room's host token. */
  youAreHost?: boolean;
}
