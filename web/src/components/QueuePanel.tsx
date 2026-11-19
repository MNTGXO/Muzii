import { X } from 'lucide-react';
import { usePlayer } from '../player/PlayerContext';
import { TrackRow } from './TrackRow';

export function QueuePanel({ onClose }: { onClose: () => void }) {
  const { queue, current } = usePlayer();

  return (
    <aside className="queue-panel">
      <header>
        <h3>Up Next</h3>
        <button onClick={onClose} aria-label="Close queue">
          <X size={18} />
        </button>
      </header>
      {queue.length === 0 ? (
        <p className="empty">Nothing queued yet. Play a track to get started.</p>
      ) : (
        queue.map((t, i) => <TrackRow key={t.id} track={t} context={queue} index={i} />)
      )}
      {current && <p className="queue-note">Now playing: {current.title}</p>}
    </aside>
  );
}
