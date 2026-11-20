import { useMemo, useState } from 'react';
import { Check, ListPlus, Loader2, Music2, Plus } from 'lucide-react';
import { usePlaylists } from '../playlists/PlaylistsContext';
import { playlistHas } from '../playlists/store';
import type { Track } from '../api/types';
import { Sheet } from './Sheet';

/** Add a song to an existing or new local playlist. */
export function AddToPlaylistSheet({
  track,
  onClose,
  onCreated,
}: {
  track: Track;
  onClose: () => void;
  /** Lets the shell send the listener straight to the new playlist. */
  onCreated?: (playlistId: string) => void;
}) {
  const { byRecency, create, addTrack, storageFailed } = usePlaylists();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  /** Ids of lists that already contain this song. */
  const containing = useMemo(() => {
    const set = new Set<string>();
    for (const p of byRecency) if (playlistHas(p, track)) set.add(p.id);
    return set;
  }, [byRecency, track]);

  const submitNew = () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    const playlist = create(name, { tracks: [track] });
    if (!playlist) { setCreating(false); return; }
    onClose();
    onCreated?.(playlist.id);
  };

  return (
    <Sheet
      title="Add to playlist"
      subtitle={track.title}
      onClose={onClose}
      footer={
        <div className="add-new-row">
          <input
            className="text-input"
            value={newName}
            placeholder="New playlist name"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNew();
            }}
            aria-label="New playlist name"
          />
          <button
            className="btn-primary btn-sm"
            onClick={submitNew}
            disabled={!newName.trim() || creating}
          >
            <Plus size={16} /> Create
          </button>
        </div>
      }
    >
      {byRecency.length === 0 ? (
        <div className="sheet-empty">
          <Music2 size={22} />
          <p>No playlists yet. Name one below and this song starts it off.</p>
        </div>
      ) : (
        <div className="pick-list">
          {byRecency.map((playlist) => {
            const has = containing.has(playlist.id);
            return (
              <button
                key={playlist.id}
                disabled={has}
                className={`pick-row${has ? ' on' : ''}`}
                onClick={() => {
                  if (!has) addTrack(playlist.id, track);
                }}
              >
                <span className="pick-art" style={{ background: playlist.gradient }}>
                  <Music2 size={18} />
                </span>
                <span className="pick-meta">
                  <span className="pick-title">{playlist.title}</span>
                  <span className="pick-sub">
                    {playlist.tracks.length} {playlist.tracks.length === 1 ? 'song' : 'songs'}
                  </span>
                </span>
                <span className={`pick-state${has ? ' on' : ''}`}>
                  {has ? <Check size={16} /> : <ListPlus size={16} />}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {storageFailed && <p className="sheet-note" role="alert">Could not save. Browser storage may be full or unavailable; free up space and try again.</p>}
      {creating ? (
        <p className="sheet-note">
          <Loader2 size={14} className="spin" /> Creating…
        </p>
      ) : null}
    </Sheet>
  );
}
