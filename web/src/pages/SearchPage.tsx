import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { searchTracks } from '../api/client';
import type { Track } from '../api/types';
import { TrackRow } from '../components/TrackRow';

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);

  useEffect(() => {
    const id = setTimeout(() => {
      void searchTracks(query).then(setResults);
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  return (
    <div className="page">
      <h1 className="page-title">Search</h1>
      <label className="search-box">
        <Search size={18} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Songs, artists, albums…"
          autoFocus
        />
      </label>
      <div className="track-list">
        {results.map((t, i) => (
          <TrackRow key={t.id} track={t} context={results} index={i} />
        ))}
      </div>
      {query && results.length === 0 && <p className="empty">No results for “{query}”.</p>}
    </div>
  );
}
