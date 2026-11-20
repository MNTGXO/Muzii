import { useState } from 'react';
import { importPlaylist, type ImportResult } from '../api/client';
import { usePlaylists } from '../playlists/PlaylistsContext';
import { Sheet } from './Sheet';

export function ImportPlaylistSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [input, setInput] = useState('');
  const [name, setName] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const { create, storageFailed } = usePlaylists();
  async function run() {
    setBusy(true); setError(''); setResult(null);
    try {
      const lines = input.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      const isLink = lines.length === 1 && /^(https?:\/\/|(?:music|www)\.youtube\.com\/|open\.spotify\.com\/)/i.test(lines[0]);
      const batches = isLink ? [input.trim()] : Array.from({ length: Math.ceil(lines.length / 10) }, (_, i) => lines.slice(i * 10, i * 10 + 10).join('\n'));
      if (lines.length > 500) throw new Error('Please import no more than 500 songs at a time.');
      let all: ImportResult = { source: 'text', title: '', tracks: [], unmatched: [] };
      for (let i = 0; i < batches.length; i++) {
        setProgress(`Checking batch ${i + 1} of ${batches.length}…`);
        const part = await importPlaylist(batches[i]);
        all = { source: part.source, title: part.title || all.title, tracks: [...all.tracks, ...part.tracks], unmatched: [...all.unmatched, ...part.unmatched], notice: [all.notice, part.notice].filter(Boolean).join(' ') || undefined };
        if (part.notice && !part.tracks.length && !part.unmatched.length) break;
      }
      setResult(all); setName(all.title || 'Imported playlist');
    } catch { setError('Import failed or timed out. Please try a smaller batch.'); }
    finally { setBusy(false); setProgress(''); }
  }
  return <Sheet title="Import a playlist" subtitle="Tracklists only — songs are played from Muzii's catalogue." onClose={onClose} wide>
    <p className="sheet-note">Paste a public YouTube Music, YouTube or JioSaavn playlist link. For Spotify, Apple Music or any other app, paste a song list: one “Title - Artist” per line.</p>
    <textarea className="text-input import-text" disabled={busy} value={input} onChange={e => { setInput(e.target.value); setResult(null); }} placeholder={'Playlist link, or:\nSong title - Artist\nAnother song - Artist'} aria-label="Playlist link or song list" />
    <button className="btn-primary" disabled={!input.trim() || busy} onClick={() => void run()}>{busy ? progress : 'Find songs'}</button>
    {error && <p role="alert" className="sheet-note">{error}</p>}
    {result && <div className="import-result" aria-live="polite">
      {result.notice && <p>{result.notice}</p>}
      <p><strong>{result.tracks.length} matched</strong> · {result.unmatched.length} unmatched</p>
      {result.unmatched.length > 0 && <details open><summary>Unmatched songs</summary><ul>{result.unmatched.map((x, i) => <li key={i}>{x.query} {x.reason === 'unreadable' ? '(unavailable)' : ''}</li>)}</ul></details>}
      {result.tracks.length > 0 && <><label htmlFor="import-name">Playlist name</label><input id="import-name" className="text-input" value={name} onChange={e => setName(e.target.value)} /><button className="btn-primary" disabled={!name.trim()} onClick={() => { const p = create(name, { tracks: result.tracks, importedFrom: result.source }); if (p) { onClose(); onCreated(p.id); } }}>Save playlist</button></>}
    </div>}
    {storageFailed && <p role="alert">Could not save. Check browser storage or playlist limits.</p>}
  </Sheet>;
}
