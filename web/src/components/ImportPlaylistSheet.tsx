import { useEffect, useRef, useState } from 'react';
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
  const request = useRef<AbortController | null>(null);
  const { create, storageFailed } = usePlaylists();
  useEffect(() => () => request.current?.abort(), []);

  async function run() {
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(''); setResult(null);
    try {
      const lines = input.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      const isLink = lines.length === 1 && /^(https?:\/\/|(?:music|www)\.youtube\.com\/|open\.spotify\.com\/|spotify:playlist:)/i.test(lines[0]);
      const batches = isLink ? [input.trim()] : Array.from({ length: Math.ceil(lines.length / 10) }, (_, i) => lines.slice(i * 10, i * 10 + 10).join('\n'));
      if (!isLink && lines.length > 500) {
        setError('Please import no more than 500 pasted songs at a time.');
        return;
      }
      let all: ImportResult = { source: 'text', title: '', tracks: [], unmatched: [] };
      for (let i = 0; i < batches.length; i++) {
        setProgress(isLink ? 'Reading playlist…' : `Checking batch ${i + 1} of ${batches.length}…`);
        const part = await importPlaylist(batches[i], { signal: controller.signal });
        all = { source: part.source, title: part.title || all.title, tracks: [...all.tracks, ...part.tracks], unmatched: [...all.unmatched, ...part.unmatched], notice: [all.notice, part.notice].filter(Boolean).join(' ') || undefined };
        if (part.source === 'spotify' && part.spotifyEntries) {
          const entries = part.spotifyEntries;
          for (let start = 0; start < entries.length; start += 5) {
            setProgress(`Matching Spotify songs ${start + 1}–${Math.min(start + 5, entries.length)} of ${entries.length}…`);
            try {
              const matched = await importPlaylist('', { entries: entries.slice(start, start + 5), signal: controller.signal });
              all.tracks.push(...matched.tracks);
              all.unmatched.push(...matched.unmatched);
            } catch (err) {
              if (controller.signal.aborted) throw err;
              // Keep completed matches, and make every unprocessed song visible.
              all.unmatched.push(...entries.slice(start).map(e => ({ query: `${e.title} - ${e.artist}`, reason: 'unreadable' as const })));
              all.notice = `${all.notice ?? ''} Matching stopped because the service was unavailable. Unchecked songs are listed below.`.trim();
              break;
            }
          }
        }
        if (part.notice && !part.tracks.length && !part.unmatched.length && !part.spotifyEntries?.length) break;
      }
      if (!controller.signal.aborted) { setResult(all); setName(all.title || 'Imported playlist'); }
    } catch {
      if (!controller.signal.aborted) setError('Import failed or timed out. Please try again or paste a smaller list.');
    } finally {
      if (!controller.signal.aborted) { setBusy(false); setProgress(''); }
      if (request.current === controller) request.current = null;
    }
  }
  return <Sheet title="Import a playlist" subtitle="Tracklists only — songs are played from Muzii's catalogue." onClose={onClose} wide>
    <p className="sheet-note">Paste a public Spotify, YouTube Music, YouTube or JioSaavn playlist link. For Apple Music or any other app, paste a song list: one “Title - Artist” per line.</p>
    <textarea className="text-input import-text" disabled={busy} value={input} onChange={e => { setInput(e.target.value); setResult(null); }} placeholder={'Playlist link, or:\nSong title - Artist\nAnother song - Artist'} aria-label="Playlist link or song list" />
    <button className="btn-primary" disabled={!input.trim() || busy} onClick={() => void run()}>{busy ? progress : 'Find songs'}</button>
    {error && <p role="alert" className="sheet-note">{error}</p>}
    {result && <div className="import-result" aria-live="polite">
      {result.notice && <p>{result.notice}</p>}
      <p><strong>{result.tracks.length} {result.source === 'youtube' ? 'songs found' : 'matched'}</strong> · {result.unmatched.length} unmatched</p>
      {result.source === 'youtube' && result.tracks.length > 0 && <p className="sheet-note">Songs are matched when played. Some may be unavailable.</p>}
      {result.unmatched.length > 0 && <details open><summary>Unmatched or unchecked songs</summary><ul>{result.unmatched.map((x, i) => <li key={i}>{x.query} {x.reason === 'unreadable' ? '(unavailable or unchecked)' : ''}</li>)}</ul></details>}
      {result.tracks.length > 0 && <><label htmlFor="import-name">Playlist name</label><input id="import-name" className="text-input" value={name} onChange={e => setName(e.target.value)} /><button className="btn-primary" disabled={!name.trim()} onClick={() => { const p = create(name, { tracks: result.tracks, importedFrom: result.source }); if (p) { onClose(); onCreated(p.id); } }}>Save playlist</button></>}
    </div>}
    {storageFailed && <p role="alert">Could not save. Browser storage may be full or unavailable; free up space and try again.</p>}
  </Sheet>;
}
