import { Heart, Pause, Play, Radio, ThumbsDown } from 'lucide-react';
import type { Track } from '../api/types';
import { usePlayer } from '../player/PlayerContext';
import { useTaste } from '../taste/TasteContext';
import { Artwork } from './Artwork';
import { formatTime } from '../utils/format';

/**
 * A song row.
 *
 * Tapping plays the song *in context* (the album/playlist/search it came
 * from, so the following tracks are the obvious ones). The radio button
 * starts a station instead: same language and mood, and it will never come
 * back to this song during the session.
 *
 * The heart and thumbs-down teach the feed: a liked song pulls its artist
 * and composer up the station, a disliked one is dropped from every future
 * queue (and skipped immediately if it is playing).
 */
export function TrackRow({
  track,
  context,
  index,
  onPlayNext,
  showIndex = true,
}: {
  track: Track;
  context: Track[];
  index: number;
  /** Optional: expose "play next" (used in search results). */
  onPlayNext?: (track: Track) => void;
  /** Hide the leading number (used inside dense lists). */
  showIndex?: boolean;
}) {
  const { current, isPlaying, playTrack, toggle, startRadio, enqueueNext } = usePlayer();
  const { isLiked, isDisliked, toggleLike, toggleDislike } = useTaste();
  const active = current?.id === track.id;
  const liked = isLiked(track.id);
  const disliked = isDisliked(track.id);

  return (
    <div
      className={`track-row${active ? ' active' : ''}${liked ? ' liked' : ''}${
        disliked ? ' disliked' : ''
      }`}
    >
      <button className="track-row-main" onClick={() => (active ? toggle() : playTrack(track, context))}>
        {active && isPlaying ? (
          <span className="eq" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        ) : showIndex ? (
          <span className="track-index">{index + 1}</span>
        ) : null}
        <Artwork track={track} size={44} radius={8} />
        <span className="track-meta">
          <span className="track-title">{track.title}</span>
          <span className="track-artist">
            {track.artist}
            {track.language ? <span className="track-lang">{track.language}</span> : null}
          </span>
        </span>
        {active && isPlaying ? (
          <Pause size={16} />
        ) : (
          <Play size={16} className="row-play" />
        )}
        <span className="track-duration">{formatTime(track.durationSec)}</span>
      </button>

      <span className="track-row-actions">
        <button
          className={`row-action like${liked ? ' on' : ''}`}
          onClick={() => toggleLike(track)}
          aria-label={liked ? `Unlike ${track.title}` : `Like ${track.title}`}
          aria-pressed={liked}
          title={liked ? 'Liked — pulls more like this' : 'Like'}
        >
          <Heart size={15} fill={liked ? 'currentColor' : 'none'} />
        </button>
        <button
          className={`row-action dislike${disliked ? ' on' : ''}`}
          onClick={() => toggleDislike(track)}
          aria-label={
            disliked ? `Undo dislike of ${track.title}` : `Never play ${track.title} again`
          }
          aria-pressed={disliked}
          title={disliked ? 'Disliked — removed from your feed' : 'Not for me'}
        >
          <ThumbsDown size={15} fill={disliked ? 'currentColor' : 'none'} />
        </button>
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
