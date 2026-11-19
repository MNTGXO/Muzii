import { Pause, Play } from 'lucide-react';
import type { Track } from '../api/types';
import { usePlayer } from '../player/PlayerContext';
import { Artwork } from './Artwork';
import { formatTime } from '../utils/format';

export function TrackRow({
  track,
  context,
  index,
}: {
  track: Track;
  context: Track[];
  index: number;
}) {
  const { current, isPlaying, playTrack, toggle } = usePlayer();
  const active = current?.id === track.id;

  return (
    <button
      className={`track-row${active ? ' active' : ''}`}
      onClick={() => (active ? toggle() : playTrack(track, context))}
    >
      {active && isPlaying ? (
        <span className="eq" aria-hidden>
          <i /><i /><i />
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
  );
}
