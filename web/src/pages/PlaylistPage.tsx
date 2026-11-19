import { useEffect, useState } from 'react';
import { ArrowLeft, Play, Shuffle } from 'lucide-react';
import { getCatalog, getPlaylists, getTrack } from '../api/client';
import type { Playlist, Track } from '../api/types';
import { usePlayer } from '../player/PlayerContext';
import { TrackRow } from '../components/TrackRow';

export function PlaylistPage({
  playlistId,
  onBack,
}: {
  playlistId: string;
  onBack: () => void;
}) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const { playQueue, toggleShuffle, shuffle } = usePlayer();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void getPlaylists().then(async (pls) => {
      if (cancelled) return;
      const pl = pls.find((p) => p.id === playlistId) ?? null;
      setPlaylist(pl);

      if (!pl) {
        setTracks([]);
        setLoading(false);
        return;
      }

      // Prefer the playlist's embedded tracks. YouTube playlist track ids
      // come from separate searches, so filtering the catalog (the old
      // behaviour) rendered empty playlists.
      if (pl.tracks?.length) {
        setTracks(pl.tracks);
        setLoading(false);
        return;
      }

      // Fallback: resolve by id from the catalog, then per-track lookup.
      const catalog = await getCatalog();
      const byId = new Map(catalog.map((t) => [t.id, t]));
      const resolved = await Promise.all(
        pl.trackIds.map(async (id) => byId.get(id) ?? (await getTrack(id))),
      );
      if (cancelled) return;
      setTracks(resolved.filter((t): t is Track => t !== null));
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [playlistId]);

  if (!playlist) {
    return (
      <div className="page">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
        {loading ? (
          <div className="skeleton-list" aria-label="Loading playlist">
            {Array.from({ length: 6 }).map((_, i) => (
              <div className="skeleton-row" key={i} />
            ))}
          </div>
        ) : (
          <p className="empty">Playlist not found.</p>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>
        <ArrowLeft size={18} /> Back
      </button>
      <section className="playlist-hero" style={{ background: playlist.gradient }}>
        <h1>{playlist.title}</h1>
        <p>{playlist.description}</p>
        <p className="playlist-meta">{tracks.length} songs</p>
        <div className="hero-actions">
          <button
            className="btn-primary"
            disabled={!tracks.length}
            onClick={() => tracks.length > 0 && playQueue(tracks, 0)}
          >
            <Play size={18} /> Play all
          </button>
          <button
            className={`btn-ghost ${shuffle ? 'is-active' : ''}`}
            disabled={!tracks.length}
            onClick={() => {
              if (!shuffle) toggleShuffle();
              playQueue(tracks, Math.floor(Math.random() * Math.max(tracks.length, 1)));
            }}
          >
            <Shuffle size={18} /> Shuffle
          </button>
        </div>
      </section>
      {loading ? (
        <div className="skeleton-list" aria-label="Loading tracks">
          {Array.from({ length: 8 }).map((_, i) => (
            <div className="skeleton-row" key={i} />
          ))}
        </div>
      ) : (
        <div className="track-list">
          {tracks.map((t, i) => (
            <TrackRow key={`${t.id}-${i}`} track={t} context={tracks} index={i} />
          ))}
          {!tracks.length && <p className="empty">No tracks in this playlist yet.</p>}
        </div>
      )}
    </div>
  );
}
