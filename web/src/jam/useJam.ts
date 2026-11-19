import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createJam,
  getJam,
  jamAction,
  joinJam,
} from '../api/client';
import type { JamState, Track } from '../api/types';

const TOKEN_KEY = 'muzii-jam-token';
const NAME_KEY = 'muzii-jam-name';

/**
 * Client for one Muzii Jam room.
 *
 * The room state lives in a Durable Object; this hook polls it every few
 * seconds and re-syncs the local player to the room's queue and position.
 * Polling (rather than WebSockets) keeps it deployable everywhere and is
 * plenty responsive for a listening party.
 *
 * The jam *host* is the speaker: their device reports playback position, and
 * everyone else follows. That avoids streaming audio from the server.
 */
export function useJam(code: string | null) {
  const [state, setState] = useState<JamState | null>(null);
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const joinedCode = useRef<string | null>(null);

  // Remember which jam this token belongs to — one session, one room.
  const tokenFor = useCallback((jamCode: string) => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? '{}') as Record<string, string>;
      return stored[jamCode] ?? null;
    } catch {
      return null;
    }
  }, []);

  const rememberToken = useCallback((jamCode: string, value: string) => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? '{}') as Record<string, string>;
      stored[jamCode] = value;
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify(stored));
    } catch {
      /* storage unavailable */
    }
    setToken(value);
  }, []);

  const refresh = useCallback(async (jamCode: string) => {
    try {
      const next = await getJam(jamCode);
      setState(next);
      setError(null);
    } catch {
      setError('not-found');
    }
  }, []);

  // Adopt a stored token when entering a room we've already joined.
  useEffect(() => {
    if (!code) return;
    joinedCode.current = code;
    const stored = tokenFor(code);
    if (stored) setToken(stored);
    void refresh(code);
  }, [code, refresh, tokenFor]);

  // Poll while the room is open.
  useEffect(() => {
    if (!code) return;
    const id = setInterval(() => void refresh(code), 4000);
    return () => clearInterval(id);
  }, [code, refresh]);

  const host = useCallback(
    async (name: string) => {
      setBusy(true);
      try {
        const session = await createJam(name);
        rememberToken(session.state.code, session.token);
        setState(session.state);
        sessionStorage.setItem(NAME_KEY, name);
        return session.state.code;
      } catch {
        setError('create-failed');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [rememberToken],
  );

  const join = useCallback(
    async (jamCode: string, name: string) => {
      setBusy(true);
      try {
        const session = await joinJam(jamCode, name);
        rememberToken(jamCode, session.token);
        setState(session.state);
        sessionStorage.setItem(NAME_KEY, name);
        setError(null);
      } catch {
        setError('join-failed');
      } finally {
        setBusy(false);
      }
    },
    [rememberToken],
  );

  /** Fire a room action; the response is the full room state. */
  const act = useCallback(
    async (action: string, body: Record<string, unknown> = {}) => {
      if (!code || !token) return;
      try {
        const next = await jamAction<JamState>(code, action, { token, ...body });
        setState(next);
      } catch {
        // A locked jam or a stale token shouldn't break playback locally.
      }
    },
    [code, token],
  );

  const addTrack = useCallback((track: Track) => act('queue', { track }), [act]);
  const skip = useCallback((direction: 'next' | 'prev' = 'next') => act('skip', { direction }), [act]);
  const play = useCallback((at?: number) => act('play', at === undefined ? {} : { index: at }), [act]);
  const pause = useCallback(() => act('pause'), [act]);
  const seek = useCallback((positionMs: number) => act('seek', { positionMs }), [act]);
  const remove = useCallback((at: number) => act('remove', { index: at }), [act]);
  const setLocked = useCallback((locked: boolean) => act('lock', { locked }), [act]);
  const send = useCallback((text: string) => act('message', { text }), [act]);

  return {
    state,
    token,
    error,
    busy,
    host,
    join,
    addTrack,
    skip,
    play,
    pause,
    seek,
    remove,
    setLocked,
    send,
    refresh: () => (code ? refresh(code) : Promise.resolve()),
    hasToken: Boolean(token),
  };
}

export function savedJamName(): string {
  return sessionStorage.getItem(NAME_KEY) ?? '';
}
