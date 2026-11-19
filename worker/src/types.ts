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
  /**
   * Spoken language of the song ("malayalam", "tamil", "hindi", ...).
   * Optional: only providers that expose it fill it in, and the radio uses
   * it to keep a station in one language instead of drifting.
   */
  language?: string;
  /** Release year, when the provider knows it. Used as an era/mood signal. */
  year?: number;
  /** Music director / composer, when known — a strong "same feel" signal. */
  composer?: string;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  trackIds: string[];
  /**
   * Full track objects for this playlist. Included so clients can render
   * the playlist without a second round-trip (playlist track ids come
   * from provider-side searches and are not guaranteed to be in the
   * catalog). Optional for backwards compatibility.
   */
  tracks?: Track[];
  /** CSS gradient used for the playlist artwork. */
  gradient: string;
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

export interface Env {
  APP_NAME: string;
  PROVIDER: string;
  CATALOG?: KVNamespace;
  /** Durable Object namespace backing Muzii Jam rooms (optional in dev). */
  JAM_ROOMS?: DurableObjectNamespaceLike;
}
