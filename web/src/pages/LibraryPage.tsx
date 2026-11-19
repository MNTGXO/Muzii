import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { getPlaylists } from '../api/client';
import type { Playlist } from '../api/types';

export function LibraryPage({
  onOpenPlaylist,
}: {
  onOpenPlaylist: (id: string) => void;
}) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    void getPlaylists().then(setPlaylists);
  }, []);

  return (
    <div className="page">
      <h1 className="page-title">Library</h1>
      <div className="card-grid">
        {playlists.map((pl) => (
          <button key={pl.id} className="album-card" onClick={() => onOpenPlaylist(pl.id)}>
            <span className="album-art" style={{ background: pl.gradient }}>
              <Play size={28} />
            </span>
            <span className="album-title">{pl.title}</span>
            <span className="album-sub">{pl.trackIds.length} songs</span>
          </button>
        ))}
      </div>
    </div>
  );
}
