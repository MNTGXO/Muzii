import { Pause, Play, Radio } from 'lucide-react';
import type { Track } from '../api/types';
import { usePlayer } from '../player/PlayerContext';
import { Artwork } from './Artwork';
import { formatTime } from '../utils/format';

/**
 * A song row.
 *
 * Tapping plays the song *in context* (the album/playlist/search it came
 * from, so the following tracks are the obvious ones). The radio button
 * starts a station instead: same artist and vibe, and it will never come
 * back to this song during the session.
 */
export function TrackRow({
  track,
  context,
  index,
  onPlayNext,
}: {
  track: Track;
  context: Track[];
  index: number;
  /** Optional: expose "play next" (used in search results). */
  onPlayNext?: (track: Track) => void;
}) {
  const { current, isPlaying, playTrack, toggle, startRadio, enqueueNext } = usePlayer();
  const active = current?.id === track.id;

  return (
    <div className={`track-row${active ? ' active' : ''}`}>
      <button className="track-row-main" onClick={() => (active ? toggle() : playTrack(track, context))}>
        {active && isPlaying ? (
          <span className="eq" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        ) : (
          <span className="track-index">{index + 1}</span>
        )}
        <Artwork track={track} size={44} radius={8} />
        <span className="track-meta">
          <span className="track-title">{track.title}</span>
          <span className="track-artist">{track.artist}</span>
        </span>
        {active && isPlaying ? (
          <Pause size={16} />
        ) : (
          <Play size={16} className="row-play" />
        )}
        <span className="track-duration">{formatTime(track.durationSec)}</span>
      </button>

      <span className="track-row-actions">
        {onPlayNext && (
          <button
            className="row-action"
            onClick={() => {
              if (onPlayNext) onPlayNext(track);
              else enqueueNext(track);
            }}
            aria-label={`Play ${track.title} next`}
            title="Play next"
          >
            ▸|
          </button>
        )}
        <button
          className="row-action radio"
          onClick={() => startRadio(track)}
          aria-label={`Start radio from ${track.title}`}
          title="Start song radio"
        >
          <Radio size={15} />
        </button>
      </span>
    </div>
  );
}
