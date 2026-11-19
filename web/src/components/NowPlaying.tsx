import { useEffect, type CSSProperties } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ListMusic,
  Loader2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  Shuffle,
  SkipBack,
  SkipForward,
  SkipForward as NextIcon,
} from 'lucide-react';
import { usePlayer } from '../player/PlayerContext';
import { Artwork } from './Artwork';
import { formatTime } from '../utils/format';

export function NowPlaying({
  onClose,
  onOpenQueue,
}: {
  onClose: () => void;
  onOpenQueue?: () => void;
}) {
  const p = usePlayer();

  // Escape closes the sheet (desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!p.current) return null;

  const pct = p.duration > 0 ? (p.progress / p.duration) * 100 : 0;
  const hue = p.current.gradientSeed % 360;

  return (
    <div className="now-playing">
      <div
        className="np-glow"
        style={{
          background: `radial-gradient(120% 90% at 50% 0%, hsl(${hue} 80% 42%) 0%, hsl(${(hue + 40) % 360} 70% 18%) 45%, #000 78%)`,
        }}
      />
      <div className="np-topbar">
        <button className="np-close" onClick={onClose} aria-label="Close">
          <ChevronDown size={28} />
        </button>
        <span className="np-eyebrow">Playing from your queue</span>
        {onOpenQueue ? (
          <button className="np-close" onClick={onOpenQueue} aria-label="Queue">
            <ListMusic size={22} />
          </button>
        ) : (
          <span style={{ width: 28 }} />
        )}
      </div>

      <div className={`np-art${p.isPlaying ? ' is-playing' : ''}`}>
        <Artwork track={p.current} size={300} radius={24} />
      </div>

      <div className="np-meta">
        <h2>{p.current.title}</h2>
        <p>
          {p.current.artist}
          {p.current.album ? ` — ${p.current.album}` : ''}
        </p>
      </div>

      {p.error && (
        <div className="np-error" role="alert">
          <p>
            <AlertTriangle size={16} /> {p.error}
          </p>
          <div className="np-error-actions">
            <button className="btn-ghost" onClick={p.retry}>
              <RotateCcw size={16} /> Retry
            </button>
            <button className="btn-ghost" onClick={p.next}>
              <NextIcon size={16} /> Next track
            </button>
          </div>
        </div>
      )}

      <div className="np-progress">
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

      <div className="np-controls">
        <button className={p.shuffle ? 'on' : ''} onClick={p.toggleShuffle} aria-label="Shuffle">
          <Shuffle size={22} />
        </button>
        <button onClick={p.prev} aria-label="Previous">
          <SkipBack size={34} />
        </button>
        <button
          className="np-play"
          onClick={p.error ? p.retry : p.toggle}
          aria-label={p.error ? 'Retry' : 'Play/Pause'}
        >
          {p.buffering ? (
            <Loader2 size={34} className="spin" />
          ) : p.isPlaying ? (
            <Pause size={34} />
          ) : (
            <Play size={34} />
          )}
        </button>
        <button onClick={p.next} aria-label="Next">
          <SkipForward size={34} />
        </button>
        <button
          className={p.repeat !== 'off' ? 'on' : ''}
          onClick={p.cycleRepeat}
          aria-label="Repeat"
        >
          {p.repeat === 'one' ? <Repeat1 size={22} /> : <Repeat size={22} />}
        </button>
      </div>

      <p className="np-badge">Ad-free • Background play on</p>
    </div>
  );
}
