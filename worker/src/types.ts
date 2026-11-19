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
