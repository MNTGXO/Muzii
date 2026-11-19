import { useEffect, useState, type CSSProperties } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Heart,
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
  ThumbsDown,
} from 'lucide-react';
import { usePlayer } from '../player/PlayerContext';
import { useTaste } from '../taste/TasteContext';
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
  const { isLiked, isDisliked, toggleLike, toggleDislike } = useTaste();
  // One-shot pulse so a tap is acknowledged on a phone you aren't looking at.
  const [pulse, setPulse] = useState<'like' | 'dislike' | null>(null);

  useEffect(() => {
    if (!pulse) return;
    const timer = setTimeout(() => setPulse(null), 420);
    return () => clearTimeout(timer);
  }, [pulse]);

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
        <div className="np-title-row">
          <h2>{p.current.title}</h2>
          {/*
            Like / unlike lives here, beside the title, the way Apple Music
            does it. Until now the only way to rate a song was to open the
            queue and find it in the list - the one screen where you are
            actually looking at the track had no controls for it at all.
            One button, two states: tap again to un-like.
          */}
          <button
            className={`np-like${isLiked(p.current.id) ? ' on' : ''}${pulse === 'like' ? ' pulse' : ''}`}
            onClick={() => {
              toggleLike(p.current!);
              setPulse('like');
            }}
            aria-pressed={isLiked(p.current.id)}
            aria-label={isLiked(p.current.id) ? 'Unlike' : 'Like'}
          >
            <Heart size={26} fill={isLiked(p.current.id) ? 'currentColor' : 'none'} />
          </button>
        </div>
        <div className="np-sub-row">
          <p>
            {p.current.artist}
            {p.current.album ? ` — ${p.current.album}` : ''}
          </p>
          <button
            className={`np-dislike${isDisliked(p.current.id) ? ' on' : ''}${pulse === 'dislike' ? ' pulse' : ''}`}
            onClick={() => {
              toggleDislike(p.current!);
              setPulse('dislike');
            }}
            aria-pressed={isDisliked(p.current.id)}
            aria-label={isDisliked(p.current.id) ? 'Stop disliking' : 'Dislike'}
          >
            <ThumbsDown size={18} fill={isDisliked(p.current.id) ? 'currentColor' : 'none'} />
          </button>
        </div>
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
