import type { Track } from '../api/types';

/**
 * The listener's taste profile, persisted in a first-party cookie.
 *
 * Why a cookie and not just localStorage: the Worker reads the same profile
 * to shape the radio, and cookies ride along on same-origin /api/* requests
 * automatically (Pages proxies those to the Worker). So the taste you build
 * on your phone follows the requests with no extra plumbing.
 *
 * Shape is deliberately small and additive-only:
 *   like    ids you loved       -> boosted in the station
 *   dislike ids you never want  -> filtered out entirely
 *   lang    languages chosen at onboarding -> the default feed
 */

const COOKIE = 'muzii_taste';
const MAX_ENTRIES = 200;
const MAX_AGE = 60 * 60 * 24 * 365;

export interface TasteSnapshot {
  like: string[];
  dislike: string[];
  /** Language codes picked at onboarding, e.g. ['malayalam', 'tamil']. */
  lang: string[];
  /** Track details for liked/disliked ids, so the Library can render them. */
  liked: Track[];
  disliked: Track[];
  /** True once the listener has completed (or skipped) onboarding. */
  onboarded: boolean;
}

const EMPTY: TasteSnapshot = {
  like: [],
  dislike: [],
  lang: [],
  liked: [],
  disliked: [],
  onboarded: false,
};

/** Compact payload: ids only, plus languages + flags. */
interface StoredTaste {
  l?: string[];
  d?: string[];
  g?: string[];
  o?: boolean;
  ld?: Track[];
  dd?: Track[];
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${MAX_AGE}; SameSite=Lax`;
}

export function loadTaste(): TasteSnapshot {
  try {
    const raw = readCookie(COOKIE);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as StoredTaste;
    return {
      like: Array.isArray(parsed.l) ? parsed.l : [],
      dislike: Array.isArray(parsed.d) ? parsed.d : [],
      lang: Array.isArray(parsed.g) ? parsed.g : [],
      liked: Array.isArray(parsed.ld) ? parsed.ld : [],
      disliked: Array.isArray(parsed.dd) ? parsed.dd : [],
      onboarded: Boolean(parsed.o),
    };
  } catch {
    return EMPTY;
  }
}

function persist(taste: TasteSnapshot): void {
  const payload: StoredTaste = {
    l: taste.like.slice(-MAX_ENTRIES),
    d: taste.dislike.slice(-MAX_ENTRIES),
    g: taste.lang,
    o: taste.onboarded,
    // Bounded history of actual tracks for the Library page.
    ld: taste.liked.slice(-40),
    dd: taste.disliked.slice(-40),
  };
  try {
    writeCookie(COOKIE, JSON.stringify(payload));
  } catch {
    /* cookie too large / disabled - the session still works */
  }
}

export type TasteAction = 'like' | 'dislike' | 'none';

/**
 * Apply a like/dislike. Liking clears a previous dislike and vice-versa:
 * the two are mutually exclusive so a track can never be both.
 */
export function applyTaste(
  taste: TasteSnapshot,
  track: Track,
  action: TasteAction,
): TasteSnapshot {
  const without = (list: string[]) => list.filter((id) => id !== track.id);
  const like = without(taste.like);
  const dislike = without(taste.dislike);
  const liked = taste.liked.filter((t) => t.id !== track.id);
  const disliked = taste.disliked.filter((t) => t.id !== track.id);

  if (action === 'like') {
    like.push(track.id);
    liked.push(track);
  } else if (action === 'dislike') {
    dislike.push(track.id);
    disliked.push(track);
  }

  const next: TasteSnapshot = { ...taste, like, dislike, liked, disliked };
  persist(next);
  return next;
}

export function setLanguages(taste: TasteSnapshot, lang: string[]): TasteSnapshot {
  const next: TasteSnapshot = { ...taste, lang, onboarded: true };
  persist(next);
  return next;
}

export function markOnboarded(taste: TasteSnapshot): TasteSnapshot {
  const next: TasteSnapshot = { ...taste, onboarded: true };
  persist(next);
  return next;
}

/** Query params shared by every radio request. */
export function tasteParams(taste: TasteSnapshot): URLSearchParams {
  const params = new URLSearchParams();
  if (taste.dislike.length) params.set('avoid', taste.dislike.slice(-60).join(','));
  if (taste.like.length) params.set('loved', taste.like.slice(-60).join(','));
  if (taste.lang.length) params.set('language', taste.lang.join(','));
  return params;
}

/** The languages offered at onboarding, in the order they are shown. */
export const LANGUAGES: { id: string; label: string; native: string; emoji: string }[] = [
  { id: 'malayalam', label: 'Malayalam', native: 'മലയാളം', emoji: '🌴' },
  { id: 'tamil', label: 'Tamil', native: 'தமிழ்', emoji: '🎬' },
  { id: 'telugu', label: 'Telugu', native: 'తెలుగు', emoji: '🎥' },
  { id: 'hindi', label: 'Hindi', native: 'हिन्दी', emoji: '🪔' },
  { id: 'kannada', label: 'Kannada', native: 'ಕನ್ನಡ', emoji: '🎵' },
  { id: 'punjabi', label: 'Punjabi', native: 'ਪੰਜਾਬੀ', emoji: '🥁' },
  { id: 'english', label: 'English', native: 'English', emoji: '🌍' },
  { id: 'marathi', label: 'Marathi', native: 'मराठी', emoji: '🎭' },
  { id: 'bengali', label: 'Bengali', native: 'বাংলা', emoji: '🌊' },
];
