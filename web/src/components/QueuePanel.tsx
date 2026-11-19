import { ArrowDown, ArrowUp, ListMusic, Radio, Trash2, X } from 'lucide-react';
import { usePlayer } from '../player/PlayerContext';
import { Artwork } from './Artwork';
import { formatTime } from '../utils/format';

/**
 * Up Next — the queue, now editable.
 *
 * Shows what plays after the current song, where it came from (a song radio
 * that keeps extending itself, a jam, or a queue you built by hand), and lets
 * you reorder, remove, or jump. The current track sits in its own section so
 * "next" always means the row directly under it.
 */
export function QueuePanel({ onClose }: { onClose: () => void }) {
  const { queue, current, queueSource, index, jumpTo, removeAt, moveItem, extending } =
    usePlayer();

  const upNext = queue.slice(index + 1);
  const earlier = queue.slice(0, index);

  return (
    <aside className="queue-panel" role="dialog" aria-label="Up next">
      <header>
        <h3>
          <ListMusic size={18} /> Up Next
        </h3>
        <button onClick={onClose} aria-label="Close queue">
          <X size={18} />
        </button>
      </header>

      <div className="queue-source">
        {queueSource === 'radio' ? (
          <>
            <Radio size={13} /> Song radio — keeps going in this lane
          </>
        ) : queueSource === 'jam' ? (
          <>
            <Radio size={13} /> Jam queue — controlled by the room
          </>
        ) : (
          <>Playing your selection</>
        )}
      </div>

      {current && (
        <section className="queue-section">
          <h4>Now playing</h4>
          <div className="queue-row active">
            <Artwork track={current} size={40} radius={8} />
            <span className="track-meta">
              <span className="track-title">{current.title}</span>
              <span className="track-artist">{current.artist}</span>
            </span>
            <span className="track-duration">{formatTime(current.durationSec)}</span>
          </div>
        </section>
      )}

      <section className="queue-section">
        <h4>
          Next up <span className="queue-count">{upNext.length}</span>
        </h4>
        {upNext.length === 0 && !extending && (
          <p className="empty">End of the queue — a new set will load as this song ends.</p>
        )}
        {upNext.map((track, offset) => {
          const at = index + 1 + offset;
          return (
            <div className="queue-row" key={`${track.id}-${at}`}>
              <button
                className="queue-play"
                onClick={() => jumpTo(at)}
                aria-label={`Play ${track.title}`}
              >
                <Artwork track={track} size={40} radius={8} />
              </button>
              <span className="track-meta">
                <span className="track-title">{track.title}</span>
                <span className="track-artist">{track.artist}</span>
              </span>
              <span className="queue-row-actions">
                <button
                  onClick={() => moveItem(at, at - 1)}
                  aria-label="Move up"
                  title="Move up"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  onClick={() => moveItem(at, at + 1)}
                  aria-label="Move down"
                  title="Move down"
                >
                  <ArrowDown size={14} />
                </button>
                <button onClick={() => removeAt(at)} aria-label="Remove" title="Remove">
                  <Trash2 size={14} />
                </button>
              </span>
            </div>
          );
        })}
        {extending && (
          <div className="queue-extending">
            <span className="eq" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            Finding songs in this lane…
          </div>
        )}
      </section>

      {earlier.length > 0 && (
        <section className="queue-section">
          <h4>Earlier</h4>
          {earlier.map((track, at) => (
            <div className="queue-row dim" key={`${track.id}-${at}`}>
              <button className="queue-play" onClick={() => jumpTo(at)}>
                <Artwork track={track} size={36} radius={8} />
              </button>
              <span className="track-meta">
                <span className="track-title">{track.title}</span>
                <span className="track-artist">{track.artist}</span>
              </span>
            </div>
          ))}
        </section>
      )}
    </aside>
  );
}
