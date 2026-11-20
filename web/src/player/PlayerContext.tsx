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
import { tasteParams, type TasteSnapshot } from '../taste/store';
import {
  createHistory,
  localRadio,
  pickFresh,
  remember,
  hasPlayed,
  sameLanguage,
  trackKey,
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
  /**
   * The listener's taste profile, needed here so the radio request itself
   * can exclude disliked songs and lean towards liked artists.
   */
  setTaste: (taste: TasteSnapshot) => void;
  /**
   * Register what to do when a track is actually listened to. Wired once in
   * App to the taste store's play log.
   */
  setOnPlayed: (fn: ((track: Track) => void) | null) => void;
  /** Disliked ids — filtered out of every queue before it is shown. */
  disliked: string[];
  /**
   * Sleep timer. `null` when off. `kind: 'duration'` counts down from
   * `totalMs`; `kind: 'track'` fires when the current song ends.
   */
  sleepTimer: SleepTimerState | null;
  /** Milliseconds left, or null when the timer is off / track-based. */
  sleepRemainingMs: number | null;
  /** Arm the timer: a duration in minutes, or 'track' for end-of-song. */
  setSleepTimer: (option: SleepTimerOption | null) => void;
}

export type SleepTimerOption = { kind: 'duration'; minutes: number } | { kind: 'track' };

export interface SleepTimerState {
  kind: 'duration' | 'track';
  /** Wall-clock ms when a duration timer will fire. */
  endsAt: number | null;
  /** Total length of a duration timer, for the countdown ring. */
  totalMs: number | null;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}

const STORAGE_KEY = 'muzii-player-v2';
const HISTORY_KEY = 'muzii-history-v1';

interface Persisted {
  queue: Track[];
  index: number;
  source: QueueSource;
  /** Playback position (seconds) of the current track. */
  position: number;
  /** Whether the player was playing when the page unloaded. */
  wasPlaying: boolean;
}

function loadPersisted(): Persisted {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
      queue?: Track[];
      index?: number;
      source?: QueueSource;
      position?: number;
      wasPlaying?: boolean;
    };
    const queue = Array.isArray(raw.queue) ? raw.queue : [];
    const index = Number.isInteger(raw.index) ? (raw.index as number) : 0;
    return {
      queue,
      index: index >= 0 && index < Math.max(queue.length, 1) ? index : 0,
      source: raw.source ?? 'manual',
      position: Number.isFinite(raw.position) ? Math.max(0, raw.position as number) : 0,
      wasPlaying: Boolean(raw.wasPlaying),
    };
  } catch {
    return { queue: [], index: 0, source: 'manual', position: 0, wasPlaying: false };
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
  const bufferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearBufferGuard = useCallback(() => {
    if (bufferTimerRef.current !== null) clearTimeout(bufferTimerRef.current);
    bufferTimerRef.current = null;
  }, []);
  const armBufferGuard = useCallback(() => {
    clearBufferGuard();
    bufferTimerRef.current = setTimeout(() => {
      bufferTimerRef.current = null;
      audioRef.current?.pause();
      setBuffering(false);
      setIsPlaying(false);
      setError('This track is taking too long to load. Try again or choose another song.');
    }, 20_000);
  }, [clearBufferGuard]);

  const persisted = useRef(loadPersisted());
  /**
   * Position to restore on the next track load. Set from localStorage on a
   * refresh so the song continues instead of restarting at 0:00.
   */
  const resumeRef = useRef<number>(persisted.current.position);
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
  const [sleepTimer, setSleepTimerState] = useState<SleepTimerState | null>(null);
  const [sleepRemainingMs, setSleepRemainingMs] = useState<number | null>(null);
  /**
   * The listener's own setting, kept separately from the running countdown.
   * The timer fires only once; if they press play again afterwards the music
   * must simply resume, with no timer re-arming behind their back.
   */
  const sleepVolumeRef = useRef<number | null>(null);
  /**
   * The end-of-track handler lives in an effect that is registered once, so
   * it can't close over the current timer state. Mirror it into a ref.
   */
  const fireTrackSleepTimerRef = useRef<() => boolean>(() => false);

  const historyRef = useRef<TrackHistory>(loadHistory());
  /**
   * Songs the listener explicitly removed or disliked from the queue.
   * Without this, removing a row was undone seconds later by the radio
   * top-up, which happily fetched the same song again — it looked like the
   * remove button simply didn't work.
   */
  const removedRef = useRef<Set<string>>(new Set());
  const catalogRef = useRef<Track[]>([]);
  /**
   * Taste snapshot used when asking for radio. Kept in a ref (not state) so
   * extendQueue's closure never goes stale, and mirrored into state so the
   * UI can react to dislikes.
   */
  const tasteRef = useRef<TasteSnapshot | null>(null);
  /**
   * Called once per completed listen, so the home feed can show what this
   * listener actually plays. Held in a ref because the audio listeners are
   * registered once and would otherwise capture a stale callback.
   */
  const onPlayedRef = useRef<((track: Track) => void) | null>(null);
  const [disliked, setDisliked] = useState<string[]>([]);
  /** Guards against several `ended`/`next` events all fetching radio at once. */
  const extendLock = useRef(false);

  const current = queue[index] ?? null;
  const stateRef = useRef({ queue, index, shuffle, repeat, queueSource });
  stateRef.current = { queue, index, shuffle, repeat, queueSource };
  /** Mirrors `progress` for the persist effect without re-subscribing. */
  const progressRef = useRef(0);
  progressRef.current = progress;
  /** Mirrors `volume` so the sleep-timer interval can restore it. */
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const setCatalog = useCallback((tracks: Track[]) => {
    catalogRef.current = tracks;
  }, []);

  /**
   * Register the "a track finished" callback (App wires this to the play log
   * in TasteContext). Never triggers a render, so it can't fight the taste
   * effect that calls setTaste on every profile change.
   */
  const setOnPlayed = useCallback((fn: ((track: Track) => void) | null) => {
    onPlayedRef.current = fn;
  }, []);

  /** Count a listen, but only for a track that actually got heard. */
  const noteListened = useCallback((track: Track, secondsHeard: number) => {
    // A track skipped in the first few seconds is not a listen. Using the
    // real duration when known keeps a 30s interlude from needing 30s.
    const duration = Number.isFinite(track.durationSec) ? track.durationSec : 0;
    const needed = duration > 0 ? Math.min(30, Math.max(8, duration * 0.5)) : 15;
    if (secondsHeard < needed) return;
    onPlayedRef.current?.(track);
  }, []);

  const setTaste = useCallback((taste: TasteSnapshot) => {
    tasteRef.current = taste;
    setDisliked((prev) =>
      prev.length === taste.dislike.length && prev.every((id, i) => id === taste.dislike[i])
        ? prev
        : taste.dislike,
    );
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

      const taste = tasteRef.current;
      const dislikedIds = new Set(taste?.dislike ?? []);
      // Exclude disliked songs, and anything that breaks the station's
      // language. The Worker already filters both, but the local fallback
      // below reads the whole catalog - without this the offline path can
      // drop a Telugu song into a Malayalam station.
      const seedLanguage = fromTrack.language ?? taste?.lang?.[0];
      const removed = removedRef.current;
      const usable = (tracks: Track[]) =>
        sameLanguage(
          tracks.filter(
            (t) => !dislikedIds.has(t.id) && !removed.has(trackKey(t)),
          ),
          seedLanguage,
        );

      let fresh: Track[] = [];
      const remote = await getRadio(
        fromTrack,
        exclude,
        count + 4,
        taste ? tasteParams(taste) : undefined,
      );
      if (remote.length) {
        fresh = pickFresh(usable(remote), historyRef.current, q);
      }
      if (fresh.length < 3) {
        // Not enough from the network — top up from the loaded catalog,
        // still respecting the language the listener picked.
        const catalog = usable(catalogRef.current);
        const local = localRadio(fromTrack, catalog, historyRef.current, count);
        fresh = pickFresh([...fresh, ...usable(local)], historyRef.current, q);
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
      clearBufferGuard();
      setBuffering(false);
      setError(null);
    };
    const onCanPlay = () => setBuffering(false);
    const onTime = () => setProgress(audio.currentTime);
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onEnded = () => {
      const { queue: q, index: i, repeat: rp } = stateRef.current;
      // A completed track is the strongest possible signal - log it before
      // advancing, while `stateRef` still points at the track that just ended.
      const finished = q[i];
      if (finished) noteListened(finished, Number.isFinite(audio.duration) ? audio.duration : 0);

      // "End of track" sleep timer: stop here, on the boundary between
      // songs, rather than in the middle of one. Returning early means the
      // queue does NOT advance, so resuming continues with the next song.
      if (fireTrackSleepTimerRef.current()) return;
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
     * 2. Still failing → stop on the current song and show Retry / Next.
     *    Automatically skipping hundreds of unavailable imported songs hides
     *    the actual failure and can make the queue race indefinitely.
     */
    const onError = () => {
      const a = audioRef.current;
      const { queue: q, index: i } = stateRef.current;
      const track = q[i];
      if (!a || !track) return;

      if (attemptRef.current === 0 && isHttpUrl(track.streamUrl)) {
        attemptRef.current = 1;
        armBufferGuard();
        a.src = track.streamUrl;
        void a.play().catch(() => undefined);
        return;
      }
      clearBufferGuard();
      setBuffering(false);
      setIsPlaying(false);
      setError('This track can’t be played right now. Try again or choose another song.');
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
      clearBufferGuard();
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

    // Also arm this on Retry and on a direct-URL fallback.
    armBufferGuard();

    // Every track we actually start counts as "played" — this is what stops
    // the same song coming back later in the session.
    remember(historyRef.current, current);

    // Refresh shouldn't restart the song: restore where we were, but only
    // for the track that was actually current when the page went away.
    const resumeAt = resumeRef.current;
    resumeRef.current = 0;
    if (resumeAt > 1) {
      const seek = () => {
        try {
          audio.currentTime = resumeAt;
        } catch {
          /* metadata not ready */
        }
      };
      audio.addEventListener('loadedmetadata', seek, { once: true });
    }

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
    return () => {
      clearBufferGuard();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Top up when fewer than 3 songs remain in the queue.
  //
  // Deliberately NOT gated on isPlaying: a queue can be short while paused
  // (autoplay blocked, headphone unplugged, user opened a jam), and it still
  // needs songs waiting when play resumes. extendQueue() is lock-guarded, so
  // running it for a paused queue costs nothing.
  useEffect(() => {
    if (!current || queueSource === 'jam') return;
    if (queue.length - index <= 3) {
      void extendQueue(current, 8);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, queue.length, queueSource]);

  // A song the listener just disliked must leave immediately — both from
  // the queue and from the speakers (this is what "don't use that song in
  // his feed" means in practice).
  useEffect(() => {
    if (!disliked.length || !current) return;
    // Dislikes are permanent too — they must not reappear via the radio.
    for (const track of queue) {
      if (disliked.includes(track.id)) removedRef.current.add(trackKey(track));
    }
    if (!disliked.includes(current.id)) {
      // Also evict disliked songs sitting further down the queue.
      setQueue((prev) => {
        const filtered = prev.filter((t, i) => i === index || !disliked.includes(t.id));
        return filtered.length === prev.length ? prev : filtered;
      });
      return;
    }
    next(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disliked, current?.id]);

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

  // Persist queue + history so a reload doesn't replay songs, plus the
  // playback position and whether we were playing — that combination is what
  // makes a refresh feel like nothing happened.
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          queue,
          index,
          source: queueSource,
          position: progressRef.current,
          wasPlaying: isPlaying,
        }),
      );
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
    // `progress` changes every second; writing localStorage that often is
    // fine (a few hundred bytes) and a refresh then resumes mid-song.
  }, [queue, index, queueSource, current?.id, isPlaying]);

  /**
   * Collapse versions of the same recording in a list the listener picked.
   *
   * Catalogs are full of them — "Minnum Minnamai", "Minnum Minnamai (Male)",
   * "Minnum Minnamai (Female)" — and putting the raw rows in the queue is what
   * made it look like the app kept replaying one song. The clicked track
   * always survives.
   */
  const dedupeContext = useCallback((tracks: Track[], keepId?: string): Track[] => {
    const seen = new Set<string>();
    const out: Track[] = [];
    for (const track of tracks) {
      if (!track?.id) continue;
      const key = trackKey(track);
      if (seen.has(key) && track.id !== keepId) continue;
      seen.add(key);
      out.push(track);
    }
    return out;
  }, []);

  /**
   * The queue itself is never allowed to hold two versions of one song.
   *
   * dedupeContext() only sanitises what we were handed; the queue can still
   * accumulate duplicates via appendToQueue/enqueue and via state persisted
   * by an older build. This effect is the backstop, and it keeps the current
   * track's position valid when rows disappear. (The visible bug: 12 "Next
   * up" rows where 4 were the same song.)
   */
  useEffect(() => {
    if (queue.length < 2) return;
    const seen = new Set<string>();
    const kept: Track[] = [];
    // Index of the *currently playing* track once duplicates are gone.
    let anchor = -1;
    const currentId = queue[index]?.id;

    queue.forEach((track, i) => {
      const key = trackKey(track);
      if (seen.has(key)) return;
      seen.add(key);
      kept.push(track);
      if (i === index) anchor = kept.length - 1;
    });

    if (kept.length === queue.length) return;
    setQueue(kept);
    // If the playing row was itself the duplicate that got dropped, stay on
    // the surviving version of the same song rather than jumping elsewhere.
    const nextIndex = anchor >= 0
      ? anchor
      : Math.max(0, kept.findIndex((t) => t.id === currentId));
    setIndex(Math.min(nextIndex, kept.length - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.length, index]);

  const playQueue = useCallback(
    (tracks: Track[], startIndex = 0, source: QueueSource = 'manual') => {
      if (!tracks.length) return;
      const anchor = tracks[Math.max(0, Math.min(startIndex, tracks.length - 1))];
      const list = dedupeContext(tracks, anchor?.id);
      const safe = Math.max(0, list.findIndex((t) => t.id === anchor?.id));
      setQueueSource(source);
      setQueue(list);
      setIndex(Math.max(0, safe));
    },
    [dedupeContext],
  );

  const playTrack = useCallback(
    (track: Track, context?: Track[]) => {
      const raw = context && context.length ? context : [track];
      const list = dedupeContext(raw, track.id);
      const i = list.findIndex((t) => t.id === track.id);
      setQueueSource('manual');
      setQueue(list);
      setIndex(i >= 0 ? i : 0);
    },
    [dedupeContext],
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
      // Remember it so the radio can't immediately serve it up again.
      removedRef.current.add(trackKey(prev[at]));
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
    armBufferGuard();
    audio.src = streamUrl(track);
    audio.load();
    void audio.play().catch(() => undefined);
  }, [armBufferGuard]);

  const seek = useCallback((s: number) => {
    if (audioRef.current) audioRef.current.currentTime = s;
    setProgress(s);
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (audioRef.current) audioRef.current.volume = v;
  }, []);

  /**
   * Sleep timer.
   *
   * The timer **pauses** playback; it never calls stop() or tears the audio
   * element down. That is deliberate and is the whole point of the feature:
   * a paused session keeps the OS media notification alive, so the listener
   * can tap play from the notification bar and carry on from the exact spot
   * they fell asleep at. A stop() would clear the notification and leave
   * nothing to resume from.
   *
   * A duration timer fades the volume out over the last ~10 seconds instead
   * of cutting mid-line, then restores the volume so the next play is
   * audible.
   */
  const cancelSleepTimer = useCallback(() => {
    // If a fade was in progress, put the volume back before clearing the state.
    if (audioRef.current && sleepVolumeRef.current !== null) {
      audioRef.current.volume = volumeRef.current;
    }
    setSleepTimerState(null);
    setSleepRemainingMs(null);
    sleepVolumeRef.current = null;
  }, []);

  const setSleepTimer = useCallback(
    (option: SleepTimerOption | null) => {
      if (!option) {
        cancelSleepTimer();
        return;
      }
      if (option.kind === 'track') {
        // Fires in the ended handler; no clock to run.
        setSleepTimerState({ kind: 'track', endsAt: null, totalMs: null });
        setSleepRemainingMs(null);
        return;
      }
      const totalMs = Math.max(1, option.minutes) * 60_000;
      setSleepTimerState({ kind: 'duration', endsAt: Date.now() + totalMs, totalMs });
      setSleepRemainingMs(totalMs);
    },
    [cancelSleepTimer],
  );

  // Drive a duration timer. One interval, cleaned up with the timer, so a
  // closed tab can't leave a stray loop running.
  useEffect(() => {
    if (!sleepTimer || sleepTimer.kind !== 'duration' || !sleepTimer.endsAt) return;
    const endsAt = sleepTimer.endsAt;

    const tick = () => {
      const left = endsAt - Date.now();
      setSleepRemainingMs(Math.max(0, left));

      // Fade over the last 10s, but only while something is actually playing.
      const audio = audioRef.current;
      if (audio && left <= 10_000 && left > 0 && !audio.paused) {
        if (sleepVolumeRef.current === null) sleepVolumeRef.current = volumeRef.current;
        audio.volume = Math.max(0, (left / 10_000) * volumeRef.current);
      }

      if (left <= 0) {
        if (audio) {
          audio.pause();
          // Restore the volume straight away, or the next play is silent.
          audio.volume = sleepVolumeRef.current ?? volumeRef.current;
        }
        setIsPlaying(false);
        setSleepTimerState(null);
        setSleepRemainingMs(null);
        sleepVolumeRef.current = null;
      }
    };

    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
    // volumeRef is a ref, so it never needs to be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleepTimer]);

  /** Called when a track ends: the 'track' timer's moment. */
  const fireTrackSleepTimer = useCallback(() => {
    if (!sleepTimer || sleepTimer.kind !== 'track') return false;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.volume = volumeRef.current;
    }
    // Only claim "paused" if something was playing; otherwise ending a track
    // that had already stopped would flip the UI into a wrong state.
    setIsPlaying(audio ? !audio.paused : false);
    setSleepTimerState(null);
    return true;
  }, [sleepTimer]);
  fireTrackSleepTimerRef.current = fireTrackSleepTimer;

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
      setTaste,
      setOnPlayed,
      sleepTimer,
      sleepRemainingMs,
      setSleepTimer,
      disliked,
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
      setTaste,
      setOnPlayed,
      sleepTimer,
      sleepRemainingMs,
      setSleepTimer,
      disliked,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
