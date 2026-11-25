import { useEffect, useRef, useState } from 'react';
import { Loader2, Search, WifiOff } from 'lucide-react';
import { searchTracks } from '../api/client';
import type { Track } from '../api/types';
import { TrackRow } from '../components/TrackRow';

const SUGGESTIONS = ['Top hits', 'Arijit Singh', 'Lofi beats', 'K-Pop', 'Ilayaraja', 'Workout'];

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    const id = ++requestId.current;
    if (!q) {
      setResults([]);
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      void searchTracks(q)
        .then((tracks) => {
          // Ignore stale responses from earlier keystrokes.
          if (id !== requestId.current) return;
          setResults(tracks);
          setError(false);
        })
        .catch(() => {
          if (id !== requestId.current) return;
          setResults([]);
          setError(true);
        })
        .finally(() => {
          if (id === requestId.current) setLoading(false);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const trimmed = query.trim();

  return (
    <div className="page">
      <h1 className="page-title">Search</h1>
      <label className="search-box">
        {loading ? <Loader2 size={18} className="spin" /> : <Search size={18} />}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Songs, artists, albums…"
          autoFocus
          enterKeyHint="search"
          aria-label="Search songs, artists, albums"
        />
      </label>

      {!trimmed && (
        <div className="chips">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => setQuery(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {loading && results.length === 0 && (
        <div className="skeleton-list" aria-label="Searching">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="skeleton-row" key={i} />
          ))}
        </div>
      )}

      {error && (
        <p className="empty error-text">
          <WifiOff size={16} /> Couldn’t reach the music service. Check your connection and try again.
        </p>
      )}

      <div className="track-list">
        {results.map((t, i) => (
          <TrackRow key={t.id} track={t} context={results} index={i} radioOnPlay />
        ))}
      </div>

      {!loading && !error && trimmed && results.length === 0 && (
        <p className="empty">No results for “{trimmed}”.</p>
      )}
    </div>
  );
}
