import { useEffect, useState, type CSSProperties } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Heart,
  ListMusic,
  Moon,
  Users,
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

/** "1h 04m" / "04:30" — long for hours, mm:ss under an hour. */
function formatCountdown(ms: number | null): string {
  if (ms === null) return '0:00';
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function NowPlaying({
  onClose,
  onOpenQueue,
  onStartJam,
}: {
  onClose: () => void;
  onOpenQueue?: () => void;
  /** Take the current queue into a Jam room; see JamPage. */
  onStartJam?: () => void;
}) {
  const p = usePlayer();
  const { isLiked, isDisliked, toggleLike, toggleDislike } = useTaste();
  const [timerOpen, setTimerOpen] = useState(false);
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
        <div className="np-top-actions">
          {/*
            Sleep timer lives beside the other "session" controls rather than
            in the transport row, which already holds five buttons.
          */}
          <button
            className={`np-timer-toggle${p.sleepTimer ? ' on' : ''}`}
            onClick={() => setTimerOpen((v) => !v)}
            aria-label="Sleep timer"
            aria-expanded={timerOpen}
          >
            <Moon size={20} />
            {p.sleepTimer && <span className="np-timer-dot" aria-hidden />}
          </button>
          {onStartJam && (
            <button className="np-close" onClick={onStartJam} aria-label="Start a jam">
              <Users size={20} />
            </button>
          )}
          {onOpenQueue ? (
            <button className="np-close" onClick={onOpenQueue} aria-label="Queue">
              <ListMusic size={22} />
            </button>
          ) : (
            <span style={{ width: 28 }} />
          )}
        </div>
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

      {timerOpen && (
        <div className="np-timer" role="group" aria-label="Sleep timer">
          <p className="np-timer-title">
            <Moon size={14} /> Sleep timer
          </p>
          <div className="np-timer-options">
            {[15, 30, 45, 60].map((min) => {
              const active =
                p.sleepTimer?.kind === 'duration' &&
                p.sleepTimer.totalMs === min * 60_000;
              return (
                <button
                  key={min}
                  className={active ? 'on' : ''}
                  onClick={() => {
                    p.setSleepTimer({ kind: 'duration', minutes: min });
                    setTimerOpen(false);
                  }}
                >
                  {min} min
                </button>
              );
            })}
            <button
              className={p.sleepTimer?.kind === 'track' ? 'on' : ''}
              onClick={() => {
                // The nicest option at night: finish this song, then stop.
                p.setSleepTimer({ kind: 'track' });
                setTimerOpen(false);
              }}
            >
              End of track
            </button>
            <button
              className="np-timer-off"
              onClick={() => {
                p.setSleepTimer(null);
                setTimerOpen(false);
              }}
            >
              Off
            </button>
          </div>
          <p className="np-timer-hint">
            {p.sleepTimer
              ? p.sleepTimer.kind === 'track'
                ? 'Stops when this song ends. The notification stays, so you can resume from it.'
                : `Pausing in ${formatCountdown(p.sleepRemainingMs)}. The notification stays, so you can resume from it.`
              : 'Music pauses when the timer ends — it keeps the notification alive so you can resume.'}
          </p>
        </div>
      )}

      <p className="np-badge">Ad-free • Background play on</p>
    </div>
  );
}
