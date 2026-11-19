import type { CSSProperties } from 'react';
import {
  ChevronUp,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
} from 'lucide-react';
import { usePlayer } from '../player/PlayerContext';
import { Artwork } from './Artwork';
import { formatTime } from '../utils/format';

export function PlayerBar({
  onExpand,
  onToggleQueue,
}: {
  onExpand: () => void;
  onToggleQueue: () => void;
}) {
  const p = usePlayer();
  if (!p.current) return null;

  const pct = p.duration > 0 ? (p.progress / p.duration) * 100 : 0;

  return (
    <div className="player-bar">
      <button className="pb-track" onClick={onExpand}>
        <Artwork track={p.current} size={48} radius={10} />
        <span className="pb-meta">
          <span className="pb-title">{p.current.title}</span>
          <span className="pb-artist">{p.current.artist}</span>
        </span>
        <ChevronUp size={18} className="pb-expand-icon" />
      </button>

      <div className="pb-controls">
        <button
          className={p.shuffle ? 'on' : ''}
          onClick={p.toggleShuffle}
          aria-label="Shuffle"
        >
          <Shuffle size={18} />
        </button>
        <button onClick={p.prev} aria-label="Previous">
          <SkipBack size={20} />
        </button>
        <button className="pb-play" onClick={p.toggle} aria-label="Play/Pause">
          {p.isPlaying ? <Pause size={22} /> : <Play size={22} />}
        </button>
        <button onClick={p.next} aria-label="Next">
          <SkipForward size={20} />
        </button>
        <button
          className={p.repeat !== 'off' ? 'on' : ''}
          onClick={p.cycleRepeat}
          aria-label="Repeat"
        >
          {p.repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}
        </button>
      </div>

      <div className="pb-progress">
        <span>{formatTime(p.progress)}</span>
        <input
          type="range"
          min={0}
          max={p.duration || 0}
          value={p.progress}
          onChange={(e) => p.seek(Number(e.target.value))}
          style={{ '--fill': `${pct}%` } as CSSProperties}
          aria-label="Seek"
        />
        <span>{formatTime(p.duration)}</span>
      </div>

      <div className="pb-right">
        <Volume2 size={18} />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={p.volume}
          onChange={(e) => p.setVolume(Number(e.target.value))}
          className="vol"
          aria-label="Volume"
        />
        <button onClick={onToggleQueue} aria-label="Queue">
          <ListMusic size={18} />
        </button>
      </div>
    </div>
  );
}
