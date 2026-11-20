import { useEffect, useState } from 'react';
import { Play, Plus, Upload } from 'lucide-react';
import { getPlaylists } from '../api/client';
import type { Playlist } from '../api/types';
import { usePlaylists } from '../playlists/PlaylistsContext';
import { Sheet } from '../components/Sheet';
import { ImportPlaylistSheet } from '../components/ImportPlaylistSheet';

export function LibraryPage({ onOpenPlaylist }: { onOpenPlaylist: (id: string) => void }) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [modal, setModal] = useState<'create' | 'import' | null>(null);
  const [name, setName] = useState('');
  const { byRecency, create, storageFailed } = usePlaylists();
  useEffect(() => { void getPlaylists().then(setPlaylists); }, []);
  return <div className="page">
    <h1 className="page-title">Library</h1>
    <div className="library-actions"><button className="btn-primary" onClick={() => setModal('create')}><Plus size={18} /> New playlist</button><button className="btn-ghost" onClick={() => setModal('import')}><Upload size={18} /> Import playlist</button></div>
    <h2 className="section-title">Your playlists</h2>
    <p className="sheet-note">Saved in this browser only. Clearing site data removes your playlists.</p>
    {storageFailed && <p role="alert">Could not save. Check browser storage or playlist limits.</p>}
    {byRecency.length === 0 ? <p className="empty">Create a playlist or import a song list to get started.</p> : <div className="card-grid">{byRecency.map(pl => <button key={pl.id} className="album-card" onClick={() => onOpenPlaylist(pl.id)}><span className="album-art" style={{ background: pl.gradient }}><Play size={28} /></span><span className="album-title">{pl.title}</span><span className="album-sub">{pl.tracks.length} songs</span></button>)}</div>}
    <h2 className="section-title">Made for you</h2>
    <div className="card-grid">{playlists.map(pl => <button key={pl.id} className="album-card" onClick={() => onOpenPlaylist(pl.id)}><span className="album-art" style={{ background: pl.gradient }}><Play size={28} /></span><span className="album-title">{pl.title}</span><span className="album-sub">{pl.tracks?.length ?? pl.trackIds.length} songs</span></button>)}</div>
    {modal === 'create' && <Sheet title="New playlist" onClose={() => setModal(null)}><form onSubmit={e => { e.preventDefault(); if (!name.trim()) return; const p = create(name); if (p) { setModal(null); setName(''); onOpenPlaylist(p.id); } }}><label htmlFor="playlist-name">Playlist name</label><input autoFocus id="playlist-name" className="text-input" value={name} onChange={e => setName(e.target.value)} maxLength={100} /><button className="btn-primary" disabled={!name.trim()}>Create</button>{storageFailed && <p role="alert">Could not save. Check browser storage or playlist limits.</p>}</form></Sheet>}
    {modal === 'import' && <ImportPlaylistSheet onClose={() => setModal(null)} onCreated={onOpenPlaylist} />}
  </div>;
}
