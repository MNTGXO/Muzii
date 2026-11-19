import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { getCatalog, getPlaylists } from '../api/client';
import type { Playlist, Track } from '../api/types';
import { usePlayer } from '../player/PlayerContext';
import { TrackRow } from '../components/TrackRow';

export function HomePage({
  onOpenPlaylist,
}: {
  onOpenPlaylist: (id: string) => void;
}) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const { playQueue } = usePlayer();

  useEffect(() => {
    void getCatalog().then(setTracks);
    void getPlaylists().then(setPlaylists);
  }, []);

  const featured = playlists[0];
  const featuredTracks = featured
    ? tracks.filter((t) => featured.trackIds.includes(t.id))
    : [];

  return (
    <div className="page">
      <h1 className="page-title">Good evening</h1>

      {featured && (
        <section className="featured" style={{ background: featured.gradient }}>
          <div className="featured-info">
            <p className="featured-kicker">Featured playlist</p>
            <h2>{featured.title}</h2>
            <p>{featured.description}</p>
            <button
              className="btn-primary"
              onClick={() => featuredTracks.length > 0 && playQueue(featuredTracks, 0)}
            >
              <Play size={18} /> Play
            </button>
          </div>
        </section>
      )}

      <section>
        <h2 className="section-title">Playlists</h2>
        <div className="card-grid">
          {playlists.map((pl) => (
            <button key={pl.id} className="album-card" onClick={() => onOpenPlaylist(pl.id)}>
              <span className="album-art" style={{ background: pl.gradient }}>
                <Play size={28} />
              </span>
              <span className="album-title">{pl.title}</span>
              <span className="album-sub">{pl.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">Top Tracks</h2>
        <div className="track-list">
          {tracks.map((t, i) => (
            <TrackRow key={t.id} track={t} context={tracks} index={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
