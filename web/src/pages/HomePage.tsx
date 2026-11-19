import { useEffect, useState } from 'react';
import { Flame, Play, Radio, Sparkles, Users } from 'lucide-react';
import { getCatalogForLanguages, getPlaylists } from '../api/client';
import { useTaste } from '../taste/TasteContext';
import { recentlyPlayed, topPlayed, type PlayEntry } from '../taste/store';
import type { Playlist, Track } from '../api/types';
import { usePlayer } from '../player/PlayerContext';
import { TrackRow } from '../components/TrackRow';
import { Artwork } from '../components/Artwork';

/**
 * The play log stores lean records (id/title/artist/artwork) rather than whole
 * tracks, so it fits in a cookie. The player needs a Track, so rebuild one.
 * streamUrl stays empty: PlayerContext resolves playback through
 * /api/stream/<id>, which is the only path that works for provider ids.
 */
function entryToTrack(entry: PlayEntry): Track {
  return {
    id: entry.id,
    title: entry.title,
    artist: entry.artist,
    album: '',
    durationSec: 0,
    streamUrl: '',
    artworkUrl: entry.artworkUrl,
    gradientSeed: [...entry.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360,
    ...(entry.language ? { language: entry.language } : {}),
  };
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function HomePage({
  onOpenPlaylist,
  onOpenJam,
}: {
  onOpenPlaylist: (id: string) => void;
  onOpenJam: () => void;
}) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const { playQueue, current, startRadio } = usePlayer();
  const { taste } = useTaste();

  // The feed is scoped to the languages picked at onboarding. This page used
  // to fetch its own *unfiltered* catalog, which is why selecting Malayalam
  // still produced a mixed feed on the home screen.
  const langKey = taste.lang.join(',');
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([getCatalogForLanguages(taste.lang), getPlaylists(taste.lang)]).then(
      ([c, p]) => {
        if (cancelled) return;
        setTracks(c);
        setPlaylists(p);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [langKey]);

  const featured = playlists[0];
  const featuredTracks = featured?.tracks?.length
    ? featured.tracks
    : featured
      ? tracks.filter((t) => featured.trackIds.includes(t.id))
      : [];

  /*
   * These two shelves used to be `tracks.slice(0, 8)` and `tracks.slice(0, 12)`
   * - the first eight and twelve tracks of the language catalog. The labels
   * lied ("Recently played" showed songs you had never played), and the two
   * shelves showed the same songs, since one was a prefix of the other.
   *
   * They are now driven by the play log in the taste cookie: "Recently
   * played" by recency, "Your top songs" by play count.
   */
  const played = recentlyPlayed(taste, 8);
  const top = topPlayed(taste, 12);

  /** Candidate fallback for a cold profile: the language feed itself. */
  const suggestion = tracks.slice(0, 12);

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

      <section className="jam-promo" onClick={onOpenJam} role="button" tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onOpenJam();
        }}
      >
        <div className="jam-promo-icon">
          <Users size={20} />
        </div>
        <div className="jam-promo-text">
          <strong>Start a Jam</strong>
          <span>Listen together — everyone adds songs, every device stays in sync.</span>
        </div>
        <span className="jam-promo-cta">
          <Radio size={14} /> Open
        </span>
      </section>

      {played.length > 0 && (
        <section>
          <h2 className="section-title">Recently played</h2>
          <div className="quick-grid">
            {played.map((entry) => {
              const active = current?.id === entry.id;
              return (
                <button
                  key={entry.id}
                  className={`quick-card${active ? ' active' : ''}`}
                  onClick={() => {
                    // Resume this song and keep the "recent" lane queued
                    // behind it, so the next tap is not a random catalog song.
                    const at = played.findIndex((r) => r.id === entry.id);
                    playQueue(played.map(entryToTrack), Math.max(at, 0), 'manual');
                  }}
                >
                  <Artwork track={entryToTrack(entry)} size={48} radius={10} />
                  <span className="quick-meta">
                    <span className="quick-title">{entry.title}</span>
                    <span className="quick-artist">{entry.artist}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/*
        "On repeat" - the station built from the songs this listener keeps
        coming back to. Tapping it plays the most-played song and lets the
        radio engine continue in that feel, which is what "play that kind of
        song" means in practice.
      */}
      {top.length > 0 && (
        <section>
          <h2 className="section-title">
            <Flame size={16} /> On repeat
          </h2>
          <button
            className="repeat-banner"
            onClick={() => {
              const first = entryToTrack(top[0]);
              playQueue(top.map(entryToTrack), 0, 'radio');
              startRadio(first);
            }}
          >
            <span className="repeat-banner-art" aria-hidden>
              {top.slice(0, 3).map((entry, i) => (
                <span key={entry.id} className="repeat-banner-art-card" style={{ ['--i' as string]: i }}>
                  <Artwork track={entryToTrack(entry)} size={54} radius={10} />
                </span>
              ))}
            </span>
            <span className="repeat-banner-text">
              <strong>{top[0].title}</strong>
              <span>
                Your most played — {top[0].count}{' '}
                {top[0].count === 1 ? 'play' : 'plays'} · keeps playing this kind of song
              </span>
            </span>
            <span className="repeat-banner-play" aria-hidden>
              <Play size={18} />
            </span>
          </button>
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

      {top.length > 0 ? (
        <section>
          <h2 className="section-title">Your top songs</h2>
          <div className="track-list">
            {top.map((entry, i) => (
              <TrackRow
                key={entry.id}
                track={entryToTrack(entry)}
                context={top.map(entryToTrack)}
                index={i}
              />
            ))}
          </div>
        </section>
      ) : (
        suggestion.length > 0 && (
          <section>
            <h2 className="section-title">Start here</h2>
            <p className="section-hint">
              Play a few songs and this becomes your own — top songs, artists and an
              On repeat station follow what you actually listen to.
            </p>
            <div className="track-list">
              {suggestion.map((t, i) => (
                <TrackRow key={t.id} track={t} context={suggestion} index={i} />
              ))}
            </div>
          </section>
        )
      )}
    </div>
  );
}
