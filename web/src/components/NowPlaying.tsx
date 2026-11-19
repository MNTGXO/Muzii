import type { CSSProperties } from 'react';
import {
  ChevronDown,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { usePlayer } from '../player/PlayerContext';
import { Artwork } from './Artwork';
import { formatTime } from '../utils/format';

export function NowPlaying({ onClose }: { onClose: () => void }) {
  const p = usePlayer();
  if (!p.current) return null;

  const pct = p.duration > 0 ? (p.progress / p.duration) * 100 : 0;

  return (
    <div className="now-playing">
      <div
        className="np-glow"
        style={{
          background: `linear-gradient(160deg, hsl(${p.current.gradientSeed % 360} 85% 55%), #000 70%)`,
        }}
      />
      <button className="np-close" onClick={onClose} aria-label="Close">
        <ChevronDown size={28} />
      </button>

      <div className="np-art">
        <Artwork track={p.current} size={300} radius={24} />
      </div>

      <div className="np-meta">
        <h2>{p.current.title}</h2>
        <p>
          {p.current.artist} — {p.current.album}
        </p>
      </div>

      <div className="np-progress">
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

      <div className="np-controls">
        <button className={p.shuffle ? 'on' : ''} onClick={p.toggleShuffle} aria-label="Shuffle">
          <Shuffle size={22} />
        </button>
        <button onClick={p.prev} aria-label="Previous">
          <SkipBack size={34} />
        </button>
        <button className="np-play" onClick={p.toggle} aria-label="Play/Pause">
          {p.isPlaying ? <Pause size={34} /> : <Play size={34} />}
        </button>
        <button onClick={p.next} aria-label="Next">
          <SkipForward size={34} />
        </button>
        <button className={p.repeat !== 'off' ? 'on' : ''} onClick={p.cycleRepeat} aria-label="Repeat">
          {p.repeat === 'one' ? <Repeat1 size={22} /> : <Repeat size={22} />}
        </button>
      </div>

      <p className="np-badge">Ad-free • Background play on</p>
    </div>
  );
}
