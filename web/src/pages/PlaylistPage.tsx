import { useEffect, useState } from 'react';
import { ArrowLeft, Play } from 'lucide-react';
import { getCatalog, getPlaylists } from '../api/client';
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
  const { playQueue } = usePlayer();

  useEffect(() => {
    void Promise.all([getCatalog(), getPlaylists()]).then(([all, pls]) => {
      const pl = pls.find((p) => p.id === playlistId) ?? null;
      setPlaylist(pl);
      setTracks(pl ? all.filter((t) => pl.trackIds.includes(t.id)) : []);
    });
  }, [playlistId]);

  if (!playlist) {
    return (
      <div className="page">
        <p>Loading…</p>
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
        <button
          className="btn-primary"
          onClick={() => tracks.length > 0 && playQueue(tracks, 0)}
        >
          <Play size={18} /> Play all
        </button>
      </section>
      <div className="track-list">
        {tracks.map((t, i) => (
          <TrackRow key={t.id} track={t} context={tracks} index={i} />
        ))}
      </div>
    </div>
  );
}
