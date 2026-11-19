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
    return { queue: raw.queue ?? [], index: raw.index ?? 0 };
  } catch {
    return { queue: [], index: 0 };
  }
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [queue, setQueue] = useState<Track[]>(() => loadPersisted().queue);
  const [index, setIndex] = useState<number>(() => loadPersisted().index);
  const [isPlaying, setIsPlaying] = useState(false);
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
    setIndex(sh ? Math.floor(Math.random() * q.length) : (i + 1) % q.length);
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

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTime = () => setProgress(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      const { queue: q, index: i, shuffle: sh, repeat: rp } = stateRef.current;
      if (rp === 'one') {
        audio.currentTime = 0;
        void audio.play();
        return;
      }
      if (sh && q.length > 1) {
        setIndex(Math.floor(Math.random() * q.length));
        return;
      }
      if (i < q.length - 1) setIndex(i + 1);
      else if (rp === 'all') setIndex(0);
    };

    // If the Worker-proxied stream fails (e.g. proxy unreachable or blocked),
    // retry once with the track's direct URL so playback still works.
    const onError = () => {
      const a = audioRef.current;
      const { queue: q, index: i } = stateRef.current;
      const track = q[i];
      if (!a || !track) return;
      const direct = track.streamUrl;
      const isHttp = /^https?:\/\//.test(direct);
      if (isHttp && a.src !== direct) {
        a.src = direct;
        void a.play().catch(() => setIsPlaying(false));
      }
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.pause();
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
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
    audio.src = streamUrl(current);
    void audio.play().catch(() => setIsPlaying(false));

    // Media Session — lock screen / notification / headset controls.
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: current.title,
        artist: current.artist,
        album: current.album,
        artwork: [{ src: current.artworkUrl, sizes: '512x512', type: 'image/jpeg' }],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Media Session action handlers (background / lock-screen controls).
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => void audioRef.current?.play());
    ms.setActionHandler('pause', () => audioRef.current?.pause());
    ms.setActionHandler('previoustrack', () => prev());
    ms.setActionHandler('nexttrack', () => next());
    ms.setActionHandler('seekto', (e) => {
      if (e.seekTime != null && audioRef.current) {
        audioRef.current.currentTime = e.seekTime;
      }
    });
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
    setQueue(tracks);
    setIndex(startIndex);
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
    if (audio.paused) void audio.play();
    else audio.pause();
  }, []);

  const seek = useCallback((s: number) => {
    if (audioRef.current) audioRef.current.currentTime = s;
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
    }),
    [
      current,
      queue,
      isPlaying,
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
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
