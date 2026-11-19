import { ArrowDown, ArrowUp, Heart, ListMusic, Radio, ThumbsDown, Trash2, X } from 'lucide-react';
import { usePlayer } from '../player/PlayerContext';
import { useTaste } from '../taste/TasteContext';
import { Artwork } from './Artwork';
import { formatTime } from '../utils/format';
import type { Track } from '../api/types';

/**
 * Up Next - the queue, now editable.
 *
 * Shows what plays after the current song, where it came from (a song radio
 * that keeps extending itself, a jam, or a queue you built by hand), and lets
 * you reorder, remove, or jump. The current track sits in its own section so
 * "next" always means the row directly under it.
 *
 * The whole list lives in a flex column with a single scrolling body: on a
 * phone the panel is a bottom sheet, and without `min-height: 0` on the
 * scroll container the browser happily grows it past the viewport and the
 * later songs become unreachable (the "can't scroll the queue" bug).
 */
function QueueRow({
  track,
  at,
  onJump,
  actions,
}: {
  track: Track;
  at: number;
  onJump: () => void;
  actions?: React.ReactNode;
}) {
  const { isLiked, isDisliked, toggleLike, toggleDislike } = useTaste();
  const liked = isLiked(track.id);
  const disliked = isDisliked(track.id);

  return (
    <div className={`queue-row${liked ? ' liked' : ''}${disliked ? ' disliked' : ''}`}>
      <button className="queue-play" onClick={onJump} aria-label={`Play ${track.title}`}>
        <Artwork track={track} size={40} radius={8} />
      </button>
      <span className="track-meta">
        <span className="track-title">{track.title}</span>
        <span className="track-artist">{track.artist}</span>
      </span>
      <span className="queue-row-actions">
        <button
          className={`queue-taste like${liked ? ' on' : ''}`}
          onClick={() => toggleLike(track)}
          aria-label={liked ? `Unlike ${track.title}` : `Like ${track.title}`}
          aria-pressed={liked}
        >
          <Heart size={14} fill={liked ? 'currentColor' : 'none'} />
        </button>
        <button
          className={`queue-taste dislike${disliked ? ' on' : ''}`}
          onClick={() => toggleDislike(track)}
          aria-label={`Never play ${track.title}`}
          aria-pressed={disliked}
        >
          <ThumbsDown size={14} fill={disliked ? 'currentColor' : 'none'} />
        </button>
        {actions}
        <span className="track-duration hide-sm">{formatTime(track.durationSec)}</span>
      </span>
      <span className="sr-only">{at}</span>
    </div>
  );
}

export function QueuePanel({ onClose }: { onClose: () => void }) {
  const { queue, current, queueSource, index, jumpTo, removeAt, moveItem, extending } =
    usePlayer();
  const { taste } = useTaste();

  // Disliked songs never appear in the visible list, so "next" is honest.
  const visible = (track: Track) => !taste.dislike.includes(track.id);
  const upNext = queue.slice(index + 1).filter(visible);
  const earlier = queue.slice(0, index).filter(visible);

  return (
    <aside className="queue-panel" role="dialog" aria-label="Up next">
      <header className="queue-head">
        <h3>
          <ListMusic size={18} /> Up Next
        </h3>
        <button onClick={onClose} aria-label="Close queue">
          <X size={18} />
        </button>
      </header>

      <div className="queue-scroll">
        <div className="queue-source">
          {queueSource === 'radio' ? (
            <>
              <Radio size={13} /> Song radio - keeps going in this lane
            </>
          ) : queueSource === 'jam' ? (
            <>
              <Radio size={13} /> Jam queue - controlled by the room
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
            <p className="empty">
              End of the queue - a new set will load as this song ends.
            </p>
          )}
          {upNext.map((track, offset) => {
            // Recover the real queue index: `upNext` is filtered, so the
            // offset alone would point at the wrong row.
            const at = queue.indexOf(track);
            return (
              <QueueRow
                key={`${track.id}-${at}`}
                track={track}
                at={offset}
                onJump={() => jumpTo(at)}
                actions={
                  <>
                    <button onClick={() => moveItem(at, at - 1)} aria-label="Move up" title="Move up">
                      <ArrowUp size={14} />
                    </button>
                    <button onClick={() => moveItem(at, at + 1)} aria-label="Move down" title="Move down">
                      <ArrowDown size={14} />
                    </button>
                    <button onClick={() => removeAt(at)} aria-label="Remove" title="Remove">
                      <Trash2 size={14} />
                    </button>
                  </>
                }
              />
            );
          })}
          {extending && (
            <div className="queue-extending">
              <span className="eq" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              Finding songs in this lane...
            </div>
          )}
        </section>

        {earlier.length > 0 && (
          <section className="queue-section">
            <h4>Earlier</h4>
            {earlier.map((track) => {
              const at = queue.indexOf(track);
              return (
                <div className="queue-row dim" key={`${track.id}-${at}`}>
                  <button className="queue-play" onClick={() => jumpTo(at)}>
                    <Artwork track={track} size={36} radius={8} />
                  </button>
                  <span className="track-meta">
                    <span className="track-title">{track.title}</span>
                    <span className="track-artist">{track.artist}</span>
                  </span>
                </div>
              );
            })}
          </section>
        )}

        <p className="queue-note">
          Like a song to hear more of it, dislike it to remove it from your feed.
        </p>
      </div>
    </aside>
  );
}
