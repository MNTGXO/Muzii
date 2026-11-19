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
import { getRadio, streamUrl } from '../api/client';
import {
  createHistory,
  localRadio,
  pickFresh,
  remember,
  hasPlayed,
  type TrackHistory,
} from './queue';

export type RepeatMode = 'off' | 'all' | 'one';

/** Where the queue came from, so the UI can label it ("Song Radio"). */
export type QueueSource = 'manual' | 'radio' | 'jam';

interface PlayerContextValue {
  current: Track | null;
  queue: Track[];
  /** Index of the current track inside `queue`. */
  index: number;
  queueSource: QueueSource;
  isPlaying: boolean;
  buffering: boolean;
  error: string | null;
  progress: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  /** True while the next song is being fetched from the radio endpoint. */
  extending: boolean;
  playQueue: (tracks: Track[], startIndex?: number, source?: QueueSource) => void;
  playTrack: (track: Track, context?: Track[]) => void;
  /** Start a song radio from this track (auto-continues forever). */
  startRadio: (track: Track) => void;
  /** Append tracks to the end of the queue (deduped, never repeated). */
  enqueue: (tracks: Track[]) => void;
  enqueueNext: (track: Track) => void;
  removeAt: (index: number) => void;
  moveItem: (from: number, to: number) => void;
  jumpTo: (index: number) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  retry: () => void;
  /** Catalog snapshot used for local radio fallback. */
  setCatalog: (tracks: Track[]) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}

const STORAGE_KEY = 'muzii-player-v2';
const HISTORY_KEY = 'muzii-history-v1';

function loadPersisted(): { queue: Track[]; index: number; source: QueueSource } {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
      queue?: Track[];
      index?: number;
      source?: QueueSource;
    };
    const queue = Array.isArray(raw.queue) ? raw.queue : [];
    const index = Number.isInteger(raw.index) ? (raw.index as number) : 0;
    return {
      queue,
      index: index >= 0 && index < Math.max(queue.length, 1) ? index : 0,
      source: raw.source ?? 'manual',
    };
  } catch {
    return { queue: [], index: 0, source: 'manual' };
  }
}

function loadHistory(): TrackHistory {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '{}') as {
      ids?: string[];
      keys?: string[];
    };
    const history: TrackHistory = {
      ids: new Set(Array.isArray(raw.ids) ? raw.ids : []),
      keys: new Set(Array.isArray(raw.keys) ? raw.keys : []),
    };
    return history;
  } catch {
    return createHistory();
  }
}

const isHttpUrl = (u: string) => /^https?:\/\//i.test(u);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** 0 = proxy stream, 1 = track's own direct URL (fallback). */
  const attemptRef = useRef(0);

  const persisted = useRef(loadPersisted());
  const [queue, setQueue] = useState<Track[]>(persisted.current.queue);
  const [index, setIndex] = useState<number>(persisted.current.index);
  const [queueSource, setQueueSource] = useState<QueueSource>(persisted.current.source);
  const [isPlaying, setIsPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [extending, setExtending] = useState(false);

  const historyRef = useRef<TrackHistory>(loadHistory());
  const catalogRef = useRef<Track[]>([]);
  /** Guards against several `ended`/`next` events all fetching radio at once. */
  const extendLock = useRef(false);

  const current = queue[index] ?? null;
  const stateRef = useRef({ queue, index, shuffle, repeat, queueSource });
  stateRef.current = { queue, index, shuffle, repeat, queueSource };

  const setCatalog = useCallback((tracks: Track[]) => {
    catalogRef.current = tracks;
  }, []);

  /**
   * Append "what plays next" tracks. Uses the Worker's radio endpoint first
   * (same artist → same vibe, never the seed), then falls back to the local
   * catalog. Whatever the source, the no-repeat rule is enforced here.
   */
  const extendQueue = useCallback(async (fromTrack: Track, count = 8) => {
    if (extendLock.current) return;
    extendLock.current = true;
    setExtending(true);
    try {
      const { queue: q } = stateRef.current;
      const exclude = [...historyRef.current.ids].slice(-50);

      let fresh: Track[] = [];
      const remote = await getRadio(fromTrack, exclude, count + 4);
      if (remote.length) {
        fresh = pickFresh(remote, historyRef.current, q);
      }
      if (fresh.length < 3) {
        // Not enough from the network — top up from the loaded catalog.
        const local = localRadio(fromTrack, catalogRef.current, historyRef.current, count);
        fresh = pickFresh([...fresh, ...local], historyRef.current, q);
      }
      if (!fresh.length) return;

      setQueue((prev) => {
        // Re-check against the latest queue: another event may have appended.
        const extra = pickFresh(fresh, historyRef.current, prev);
        return extra.length ? [...prev, ...extra] : prev;
      });
      setQueueSource((src) => (src === 'jam' ? src : 'radio'));
    } finally {
      extendLock.current = false;
      setExtending(false);
    }
  }, []);

  const next = useCallback(
    (auto = false) => {
      const { queue: q, index: i, shuffle: sh, queueSource: src } = stateRef.current;
      if (!q.length) return;

      if (sh && q.length > 1) {
        // Shuffle must not pick something already played.
        const candidates = q
          .map((track, idx) => ({ track, idx }))
          .filter(({ track, idx }) => idx !== i && !hasPlayed(historyRef.current, track));
        const pool = candidates.length ? candidates : q.map((track, idx) => ({ track, idx })).filter(({ idx }) => idx !== i);
        const pick = pool[Math.floor(Math.random() * pool.length)];
        if (pick) setIndex(pick.idx);
        return;
      }

      if (i < q.length - 1) {
        setIndex(i + 1);
        return;
      }

      if (auto) {
        // End of queue while playing: extend it (radio behaviour) instead of
        // stopping. Jam queues are host-controlled, so never extend those.
        if (src === 'jam') {
          setIsPlaying(false);
          return;
        }
        if (repeat === 'all' && q.length) {
          void extendQueue(q[i], 8);
          setIndex(0);
          return;
        }
        void extendQueue(q[i], 8);
        return;
      }

      // Manual next at the end: wrap or extend.
      if (repeat === 'all') setIndex(0);
      else void extendQueue(q[i], 8);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extendQueue],
  );

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
      const { queue: q, index: i, repeat: rp } = stateRef.current;
      if (rp === 'one') {
        audio.currentTime = 0;
        void audio.play().catch(() => undefined);
        return;
      }
      // Hand over to next(), which extends the queue when it runs out.
      if (i < q.length - 1) setIndex(i + 1);
      else next(true);
    };

    /**
     * Playback error recovery chain:
     * 1. Proxy stream failed → retry with the track's direct URL (works for
     *    demo tracks).
     * 2. Still failing → skip to the next track automatically (a dead song
     *    shouldn't stop the session), and only surface an error if there is
     *    nothing left to play.
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
      if (q.length > 1) {
        // Auto-advance past a broken track.
        next(true);
        return;
      }
      setError('This track can’t be played right now.');
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

    // Every track we actually start counts as "played" — this is what stops
    // the same song coming back later in the session.
    remember(historyRef.current, current);

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

  // If we're within 2 tracks of the end, top up early so playback is seamless.
  useEffect(() => {
    if (!current || queueSource === 'jam') return;
    if (queue.length - index <= 2 && isPlaying) {
      void extendQueue(current, 8);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, queue.length, isPlaying]);

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
      ms.setActionHandler('nexttrack', () => next());
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
        if (audioRef.current) audioRef.current.currentTime += e.seekOffset ?? 10;
      });
    } catch {
      /* some handlers are unsupported on older browsers — ignore */
    }
  }, [next, prev]);

  // Persist queue + history so a reload doesn't replay songs.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ queue, index, source: queueSource }));
      const history = historyRef.current;
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify({
          ids: [...history.ids].slice(-200),
          keys: [...history.keys].slice(-200),
        }),
      );
    } catch {
      /* storage unavailable — ignore */
    }
  }, [queue, index, queueSource, current?.id]);

  const playQueue = useCallback((tracks: Track[], startIndex = 0, source: QueueSource = 'manual') => {
    if (!tracks.length) return;
    const safe = Math.max(0, Math.min(startIndex, tracks.length - 1));
    setQueueSource(source);
    setQueue(tracks);
    setIndex(safe);
  }, []);

  const playTrack = useCallback(
    (track: Track, context?: Track[]) => {
      const list = context && context.length ? context : [track];
      const i = list.findIndex((t) => t.id === track.id);
      setQueueSource('manual');
      setQueue(list);
      setIndex(i >= 0 ? i : 0);
    },
    [],
  );

  const startRadio = useCallback(
    (track: Track) => {
      // Radio starts with just the seed: the extension effect fills the rest
      // with same-artist / same-vibe tracks, so the very next song is never
      // the one you just picked.
      setQueueSource('radio');
      setQueue([track]);
      setIndex(0);
    },
    [],
  );

  const enqueue = useCallback((tracks: Track[]) => {
    if (!tracks.length) return;
    setQueue((prev) => {
      const extra = pickFresh(tracks, historyRef.current, prev);
      return extra.length ? [...prev, ...extra] : prev;
    });
  }, []);

  const enqueueNext = useCallback((track: Track) => {
    setQueue((prev) => {
      const { index: i } = stateRef.current;
      if (prev.some((t) => t.id === track.id) || hasPlayed(historyRef.current, track)) return prev;
      const copy = [...prev];
      copy.splice(Math.min(i + 1, copy.length), 0, track);
      return copy;
    });
  }, []);

  const removeAt = useCallback((at: number) => {
    setQueue((prev) => {
      if (at < 0 || at >= prev.length) return prev;
      const { index: i } = stateRef.current;
      const nextQueue = prev.filter((_, idx) => idx !== at);
      if (at < i) setIndex(i - 1);
      else if (at === i && nextQueue.length) setIndex(Math.min(i, nextQueue.length - 1));
      return nextQueue;
    });
  }, []);

  const moveItem = useCallback((from: number, to: number) => {
    setQueue((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
  }, []);

  const jumpTo = useCallback((at: number) => {
    const { queue: q } = stateRef.current;
    if (at < 0 || at >= q.length) return;
    setIndex(at);
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
      index,
      queueSource,
      isPlaying,
      buffering,
      error,
      progress,
      duration,
      volume,
      shuffle,
      repeat,
      extending,
      playQueue,
      playTrack,
      startRadio,
      enqueue,
      enqueueNext,
      removeAt,
      moveItem,
      jumpTo,
      toggle,
      next: () => next(),
      prev,
      seek,
      setVolume,
      toggleShuffle,
      cycleRepeat,
      retry,
      setCatalog,
    }),
    [
      current,
      queue,
      index,
      queueSource,
      isPlaying,
      buffering,
      error,
      progress,
      duration,
      volume,
      shuffle,
      repeat,
      extending,
      playQueue,
      playTrack,
      startRadio,
      enqueue,
      enqueueNext,
      removeAt,
      moveItem,
      jumpTo,
      toggle,
      next,
      prev,
      seek,
      setVolume,
      toggleShuffle,
      cycleRepeat,
      retry,
      setCatalog,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
