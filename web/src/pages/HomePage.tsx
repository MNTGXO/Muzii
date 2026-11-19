import { useEffect, useState } from 'react';
import { Play, Sparkles } from 'lucide-react';
import { getCatalog, getPlaylists } from '../api/client';
import type { Playlist, Track } from '../api/types';
import { usePlayer } from '../player/PlayerContext';
import { TrackRow } from '../components/TrackRow';
import { Artwork } from '../components/Artwork';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function HomePage({
  onOpenPlaylist,
}: {
  onOpenPlaylist: (id: string) => void;
}) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const { playQueue, current } = usePlayer();

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getCatalog(), getPlaylists()]).then(([c, p]) => {
      if (cancelled) return;
      setTracks(c);
      setPlaylists(p);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const featured = playlists[0];
  const featuredTracks = featured?.tracks?.length
    ? featured.tracks
    : featured
      ? tracks.filter((t) => featured.trackIds.includes(t.id))
      : [];

  const recent = tracks.slice(0, 8);
  const topTracks = tracks.slice(0, 12);

  return (
    <div className="page">
      <header className="home-header">
        <div>
          <p className="home-kicker">
            <Sparkles size={14} /> Muzii
          </p>
          <h1 className="page-title">{greeting()}</h1>
        </div>
      </header>

      {loading && (
        <div className="skeleton-list" aria-label="Loading">
          {Array.from({ length: 5 }).map((_, i) => (
            <div className="skeleton-row" key={i} />
          ))}
        </div>
      )}

      {featured && (
        <section className="featured" style={{ background: featured.gradient }}>
          <div className="featured-info">
            <p className="featured-kicker">Featured playlist</p>
            <h2>{featured.title}</h2>
            <p>{featured.description}</p>
            <button
              className="btn-primary"
              disabled={!featuredTracks.length}
              onClick={() => featuredTracks.length > 0 && playQueue(featuredTracks, 0)}
            >
              <Play size={18} /> Play
            </button>
          </div>
          <div className="featured-visual" aria-hidden>
            {featuredTracks.slice(0, 3).map((t, i) => (
              <div className="featured-visual-card" key={t.id} style={{ ['--i' as string]: i }}>
                <Artwork track={t} size={92} radius={16} />
              </div>
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <h2 className="section-title">Recently played</h2>
          <div className="quick-grid">
            {recent.map((t) => {
              const active = current?.id === t.id;
              return (
                <button
                  key={t.id}
                  className={`quick-card${active ? ' active' : ''}`}
                  onClick={() => playQueue(recent, recent.findIndex((r) => r.id === t.id))}
                >
                  <Artwork track={t} size={48} radius={10} />
                  <span className="quick-meta">
                    <span className="quick-title">{t.title}</span>
                    <span className="quick-artist">{t.artist}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-title">Playlists</h2>
        <div className="card-grid">
          {playlists.map((pl, i) => (
            <button
              key={pl.id}
              className="album-card"
              style={{ ['--i' as string]: i }}
              onClick={() => onOpenPlaylist(pl.id)}
            >
              <span className="album-art" style={{ background: pl.gradient }}>
                <Play size={28} />
              </span>
              <span className="album-title">{pl.title}</span>
              <span className="album-sub">{pl.description}</span>
            </button>
          ))}
        </div>
      </section>

      {topTracks.length > 0 && (
        <section>
          <h2 className="section-title">Top Tracks</h2>
          <div className="track-list">
            {topTracks.map((t, i) => (
              <TrackRow key={t.id} track={t} context={topTracks} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
