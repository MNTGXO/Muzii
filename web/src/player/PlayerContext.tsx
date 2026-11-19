import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Track } from '../api/types';
import { streamUrl } from '../api/client';

export type RepeatMode = 'off' | 'all' | 'one';

interface PlayerContextValue {
  current: Track | null;
  queue: Track[];
  isPlaying: boolean;
  buffering: boolean;
  error: string | null;
  progress: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  playQueue: (tracks: Track[], startIndex?: number) => void;
  playTrack: (track: Track, context?: Track[]) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  retry: () => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}

const STORAGE_KEY = 'muzii-player-v1';

function loadPersisted(): { queue: Track[]; index: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
      queue?: Track[];
      index?: number;
    };
    const queue = Array.isArray(raw.queue) ? raw.queue : [];
    const index = Number.isInteger(raw.index) ? (raw.index as number) : 0;
    return {
      queue,
      index: index >= 0 && index < Math.max(queue.length, 1) ? index : 0,
    };
  } catch {
    return { queue: [], index: 0 };
  }
}

const isHttpUrl = (u: string) => /^https?:\/\//i.test(u);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** 0 = proxy stream, 1 = track's own direct URL (fallback). */
  const attemptRef = useRef(0);

  const [queue, setQueue] = useState<Track[]>(() => loadPersisted().queue);
  const [index, setIndex] = useState<number>(() => loadPersisted().index);
  const [isPlaying, setIsPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');

  const current = queue[index] ?? null;
  const stateRef = useRef({ queue, index, shuffle, repeat });
  stateRef.current = { queue, index, shuffle, repeat };

  const next = useCallback(() => {
    const { queue: q, index: i, shuffle: sh } = stateRef.current;
    if (!q.length) return;
    setIndex(sh && q.length > 1 ? Math.floor(Math.random() * q.length) : (i + 1) % q.length);
  }, []);

  const prev = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const { queue: q, index: i } = stateRef.current;
    if (!q.length) return;
    setIndex((i - 1 + q.length) % q.length);
  }, []);

  // Single shared <audio> element — keeps playing when the tab is
  // backgrounded (Media Session + PWA = lock-screen / notification controls).
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = volume;
    audioRef.current = audio;

    const onPlay = () => {
      setIsPlaying(true);
      setError(null);
    };
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => {
      setBuffering(false);
      setError(null);
    };
    const onCanPlay = () => setBuffering(false);
    const onTime = () => setProgress(audio.currentTime);
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onEnded = () => {
      const { queue: q, index: i, shuffle: sh, repeat: rp } = stateRef.current;
      if (rp === 'one') {
        audio.currentTime = 0;
        void audio.play().catch(() => undefined);
        return;
      }
      if (sh && q.length > 1) {
        setIndex(Math.floor(Math.random() * q.length));
        return;
      }
      if (i < q.length - 1) setIndex(i + 1);
      else if (rp === 'all') setIndex(0);
      else setIsPlaying(false);
    };

    /**
     * Playback error recovery chain:
     * 1. Proxy stream failed → retry with the track's direct URL (works for
     *    demo tracks; YouTube tracks are proxy-only).
     * 2. Still failing → surface an error so the UI can offer Retry / Next.
     */
    const onError = () => {
      const a = audioRef.current;
      const { queue: q, index: i } = stateRef.current;
      const track = q[i];
      if (!a || !track) return;

      if (attemptRef.current === 0 && isHttpUrl(track.streamUrl)) {
        attemptRef.current = 1;
        a.src = track.streamUrl;
        void a.play().catch(() => undefined);
        return;
      }
      setBuffering(false);
      setIsPlaying(false);
      setError(
        attemptRef.current === 0
          ? 'Stream unavailable — the track could not be loaded.'
          : 'This track can’t be played right now.',
      );
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.pause();
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load + play whenever the current track changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;

    attemptRef.current = 0;
    setProgress(0);
    setDuration(0);
    setError(null);
    setBuffering(true);

    audio.src = streamUrl(current);
    void audio.play().catch(() => {
      // Autoplay blocked (no user gesture yet) — stay paused, not an error.
      setBuffering(false);
      setIsPlaying(false);
    });

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: current.album,
        artwork: current.artworkUrl
          ? [{ src: current.artworkUrl, sizes: '480x360', type: 'image/jpeg' }]
          : [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Reflect playback state on the lock screen / notification.
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  // Media Session action handlers (background / lock-screen controls).
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    try {
      ms.setActionHandler('play', () => void audioRef.current?.play());
      ms.setActionHandler('pause', () => audioRef.current?.pause());
      ms.setActionHandler('previoustrack', prev);
      ms.setActionHandler('nexttrack', next);
      ms.setActionHandler('seekto', (e) => {
        if (e.seekTime != null && audioRef.current) audioRef.current.currentTime = e.seekTime;
      });
      ms.setActionHandler('seekbackward', (e) => {
        if (audioRef.current) {
          audioRef.current.currentTime = Math.max(
            0,
            audioRef.current.currentTime - (e.seekOffset ?? 10),
          );
        }
      });
      ms.setActionHandler('seekforward', (e) => {
        if (audioRef.current) {
          audioRef.current.currentTime += e.seekOffset ?? 10;
        }
      });
    } catch {
      // Some handlers are unsupported on older browsers — ignore.
    }
  }, [next, prev]);

  // Persist queue so playback survives reloads.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ queue, index }));
    } catch {
      /* storage unavailable — ignore */
    }
  }, [queue, index]);

  const playQueue = useCallback((tracks: Track[], startIndex = 0) => {
    if (!tracks.length) return;
    const safe = Math.max(0, Math.min(startIndex, tracks.length - 1));
    setQueue(tracks);
    setIndex(safe);
  }, []);

  const playTrack = useCallback((track: Track, context?: Track[]) => {
    const list = context && context.length ? context : [track];
    const i = list.findIndex((t) => t.id === track.id);
    setQueue(list);
    setIndex(i >= 0 ? i : 0);
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !stateRef.current.queue.length) return;
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  }, []);

  const retry = useCallback(() => {
    const audio = audioRef.current;
    const { queue: q, index: i } = stateRef.current;
    const track = q[i];
    if (!audio || !track) return;
    attemptRef.current = 0;
    setError(null);
    setBuffering(true);
    audio.src = streamUrl(track);
    audio.load();
    void audio.play().catch(() => undefined);
  }, []);

  const seek = useCallback((s: number) => {
    if (audioRef.current) audioRef.current.currentTime = s;
    setProgress(s);
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (audioRef.current) audioRef.current.volume = v;
  }, []);

  const toggleShuffle = useCallback(() => setShuffle((s) => !s), []);
  const cycleRepeat = useCallback(
    () => setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')),
    [],
  );

  const value = useMemo<PlayerContextValue>(
    () => ({
      current,
      queue,
      isPlaying,
      buffering,
      error,
      progress,
      duration,
      volume,
      shuffle,
      repeat,
      playQueue,
      playTrack,
      toggle,
      next,
      prev,
      seek,
      setVolume,
      toggleShuffle,
      cycleRepeat,
      retry,
    }),
    [
      current,
      queue,
      isPlaying,
      buffering,
      error,
      progress,
      duration,
      volume,
      shuffle,
      repeat,
      playQueue,
      playTrack,
      toggle,
      next,
      prev,
      seek,
      setVolume,
      toggleShuffle,
      cycleRepeat,
      retry,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
