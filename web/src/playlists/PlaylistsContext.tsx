import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Track } from '../api/types';
import { blankPlaylist, loadPlaylists, savePlaylists, withTrackAdded, withTrackMoved, withTrackRemoved, type UserPlaylist } from './store';

type Context = {
  playlists: UserPlaylist[]; byRecency: UserPlaylist[]; storageFailed: boolean;
  create: (title: string, opts?: { tracks?: Track[]; importedFrom?: string }) => UserPlaylist | null;
  rename: (id: string, title: string) => void; remove: (id: string) => boolean;
  addTrack: (id: string, track: Track) => boolean;
  removeTrack: (id: string, trackId: string) => void; moveTrack: (id: string, from: number, to: number) => void;
};
const Context = createContext<Context | null>(null);
export function usePlaylists() { const value = useContext(Context); if (!value) throw new Error('Missing PlaylistsProvider'); return value; }
export function PlaylistsProvider({ children }: { children: ReactNode }) {
  const [playlists, setPlaylists] = useState(loadPlaylists);
  const ref = useRef(playlists);
  const [storageFailed, setStorageFailed] = useState(false);
  useEffect(() => {
    const update = (event: StorageEvent) => {
      if (event.key !== 'muzii_playlists_v1' && event.key !== null) return;
      const latest = loadPlaylists();
      ref.current = latest;
      setPlaylists(latest);
    };
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, []);
  const commit = (next: UserPlaylist[]) => {
    if (!savePlaylists(next)) { setStorageFailed(true); return false; }
    ref.current = next; setPlaylists(next); setStorageFailed(false); return true;
  };
  const value: Context = {
    playlists, byRecency: useMemo(() => [...playlists].sort((a, b) => b.updatedAt - a.updatedAt), [playlists]), storageFailed,
    create: (title, opts) => { if (ref.current.length >= 60 || (opts?.tracks?.length ?? 0) > 500) { setStorageFailed(true); return null; } const p = blankPlaylist(title, opts); return commit([p, ...ref.current]) ? p : null; },
    rename: (id, title) => { if (title.trim()) commit(ref.current.map(p => p.id === id ? { ...p, title: title.trim(), updatedAt: Date.now() } : p)); },
    remove: id => commit(ref.current.filter(p => p.id !== id)),
    addTrack: (id, t) => { const p = ref.current.find(p => p.id === id); const next = p && withTrackAdded(p, t); return !!next && commit(ref.current.map(p => p.id === id ? next : p)); },
    removeTrack: (id, t) => { commit(ref.current.map(p => p.id === id ? withTrackRemoved(p, t) : p)); },
    moveTrack: (id, from, to) => { commit(ref.current.map(p => p.id === id ? withTrackMoved(p, from, to) : p)); },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
