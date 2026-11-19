import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Track } from '../api/types';
import {
  applyTaste,
  loadTaste,
  markOnboarded,
  setLanguages,
  type TasteAction,
  type TasteSnapshot,
} from './store';

interface TasteContextValue {
  taste: TasteSnapshot;
  isLiked: (trackId: string) => boolean;
  isDisliked: (trackId: string) => boolean;
  /** Like / dislike / clear. Mutually exclusive, persisted to a cookie. */
  rate: (track: Track, action: TasteAction) => void;
  /** Quick toggle used by the row buttons. */
  toggleLike: (track: Track) => void;
  toggleDislike: (track: Track) => void;
  /** Onboarding: which languages the home feed should use. */
  chooseLanguages: (lang: string[]) => void;
  finishOnboarding: () => void;
  /** True until the listener has picked languages (or skipped). */
  needsOnboarding: boolean;
}

const TasteContext = createContext<TasteContextValue | null>(null);

export function useTaste(): TasteContextValue {
  const ctx = useContext(TasteContext);
  if (!ctx) throw new Error('useTaste must be used within TasteProvider');
  return ctx;
}

export function TasteProvider({ children }: { children: ReactNode }) {
  const [taste, setTaste] = useState<TasteSnapshot>(() => loadTaste());

  const isLiked = useCallback((id: string) => taste.like.includes(id), [taste.like]);
  const isDisliked = useCallback(
    (id: string) => taste.dislike.includes(id),
    [taste.dislike],
  );

  const rate = useCallback((track: Track, action: TasteAction) => {
    setTaste((prev) => applyTaste(prev, track, action));
  }, []);

  const toggleLike = useCallback((track: Track) => {
    setTaste((prev) =>
      applyTaste(prev, track, prev.like.includes(track.id) ? 'none' : 'like'),
    );
  }, []);

  const toggleDislike = useCallback((track: Track) => {
    setTaste((prev) =>
      applyTaste(prev, track, prev.dislike.includes(track.id) ? 'none' : 'dislike'),
    );
  }, []);

  const chooseLanguages = useCallback((lang: string[]) => {
    setTaste((prev) => setLanguages(prev, lang));
  }, []);

  const finishOnboarding = useCallback(() => {
    setTaste((prev) => markOnboarded(prev));
  }, []);

  const value = useMemo<TasteContextValue>(
    () => ({
      taste,
      isLiked,
      isDisliked,
      rate,
      toggleLike,
      toggleDislike,
      chooseLanguages,
      finishOnboarding,
      needsOnboarding: !taste.onboarded,
    }),
    [taste, isLiked, isDisliked, rate, toggleLike, toggleDislike, chooseLanguages, finishOnboarding],
  );

  return <TasteContext.Provider value={value}>{children}</TasteContext.Provider>;
}
