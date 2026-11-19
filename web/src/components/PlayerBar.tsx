import type { CSSProperties } from 'react';
import {
  AlertTriangle,
  ChevronUp,
  Heart,
  ListMusic,
  Loader2,
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
import { useTaste } from '../taste/TasteContext';
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
  const { isLiked, toggleLike } = useTaste();
  if (!p.current) return null;

  const pct = p.duration > 0 ? (p.progress / p.duration) * 100 : 0;

  return (
    <div className="player-bar">
      <button className="pb-track" onClick={onExpand} aria-label="Open now playing">
        <Artwork track={p.current} size={48} radius={10} />
        <span className="pb-meta">
          <span className="pb-title">{p.current.title}</span>
          <span className="pb-artist">
            {p.error ? (
              <span className="pb-error">
                <AlertTriangle size={12} /> Playback failed — tap to retry
              </span>
            ) : (
              p.current.artist
            )}
          </span>
        </span>
        <ChevronUp size={18} className="pb-expand-icon" />
      </button>

      {/*
        Heart on the mini bar too - liking was previously only reachable from
        the queue. Deliberately no dislike here: this strip is 60px tall and a
        mis-tapped dislike bans a song from the feed, so that stays a
        deliberate action on the full player or the queue.
      */}
      <div className="pb-left">
        <button
          className={`pb-like${isLiked(p.current.id) ? ' on' : ''}`}
          onClick={() => toggleLike(p.current!)}
          aria-pressed={isLiked(p.current.id)}
          aria-label={isLiked(p.current.id) ? 'Unlike' : 'Like'}
        >
          <Heart size={18} fill={isLiked(p.current.id) ? 'currentColor' : 'none'} />
        </button>
      </div>

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
        <button
          className="pb-play"
          onClick={p.error ? p.retry : p.toggle}
          aria-label={p.error ? 'Retry' : 'Play/Pause'}
        >
          {p.buffering ? (
            <Loader2 size={22} className="spin" />
          ) : p.isPlaying ? (
            <Pause size={22} />
          ) : (
            <Play size={22} />
          )}
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
          value={Math.min(p.progress, p.duration || 0)}
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
          style={{ '--fill': `${p.volume * 100}%` } as CSSProperties}
          aria-label="Volume"
        />
        <button onClick={onToggleQueue} aria-label="Queue">
          <ListMusic size={18} />
        </button>
      </div>
    </div>
  );
}
