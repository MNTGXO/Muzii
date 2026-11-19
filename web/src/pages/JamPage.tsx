import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  Loader2,
  Lock,
  LogIn,
  Music2,
  Plus,
  Radio,
  Send,
  SkipForward,
  Unlock,
  Users,
} from 'lucide-react';
import { useJam, savedJamName } from '../jam/useJam';
import { usePlayer } from '../player/PlayerContext';
import { Artwork } from '../components/Artwork';
import { formatTime } from '../utils/format';
import type { JamSeed, Track } from '../api/types';

/**
 * Muzii Jam — the Spotify-Jam equivalent.
 *
 * Everyone in the room adds songs to one shared queue and the host's device
 * plays them. Guests follow the host's position, so the whole party hears the
 * same song at the same time without streaming audio through the server.
 */
export function JamPage({
  code,
  onBack,
  onOpenCode,
  catalog,
  seed,
  onSeedUsed,
}: {
  code: string | null;
  onBack: () => void;
  onOpenCode: (code: string) => void;
  catalog: Track[];
  /** Queue carried in from the player, for a jam started mid-listen. */
  seed?: JamSeed | null;
  /** Clears the seed once it has been used, so a reload doesn't re-host. */
  onSeedUsed?: () => void;
}) {
  const jam = useJam(code);
  const player = usePlayer();
  const [name, setName] = useState(() => savedJamName());
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');

  const state = jam.state;

  /**
   * Auto-host when arriving with a seed, i.e. from the player's Jam button.
   *
   * The point of the feature is one tap: you are listening, you tap Jam, and
   * you are in a room that is already playing what you were playing. Without
   * this you would land on the "create a jam" form and have to fill it in.
   */
  const seededRef = useRef(false);
  useEffect(() => {
    if (!seed || seededRef.current || code) return;
    seededRef.current = true;
    const hostName = savedJamName().trim() || 'Host';
    void jam.host(hostName, seed).then((created) => {
      onSeedUsed?.();
      if (created) onOpenCode(created);
    });
    // Runs once per seed; jam.host is stable enough for this one-shot call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, code]);
  // Trust the server's answer: only the host token gets `youAreHost`. Every
  // member has *a* token, so "has a token" is not the same as "is the host".
  const isHost = Boolean(state?.youAreHost);
  const current = state?.currentTrack ?? null;

  // Guests follow the room: whenever the room's track changes, load it.
  useEffect(() => {
    if (!state?.currentTrack || isHost) return;
    if (player.current?.id === state.currentTrack.id) return;
    player.playQueue(state.queue, state.index, 'jam');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.currentTrack?.id, isHost]);

  // ...and seek to where the room is, so everyone is in sync.
  useEffect(() => {
    if (!state?.active || isHost || !current) return;
    if (Math.abs(player.progress * 1000 - state.positionMs) > 2500) {
      player.seek(state.positionMs / 1000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.positionMs, current?.id]);

  /**
   * Host: keep the ROOM equal to the player.
   *
   * This used to report only `positionMs` every 8 seconds. Nothing ever told
   * the room which song was playing or that the queue had changed, so a host
   * with music playing still showed "Queue 0" and guests had nothing to
   * follow - they only ever saw tracks someone had manually added with
   * "Add from your library".
   *
   * Now the host mirrors the live queue and index into the room whenever
   * they change, and reports the playhead alongside. `jam.sync()` is one
   * round-trip for both.
   */
  const lastSyncRef = useRef({ signature: '', at: 0 });
  useEffect(() => {
    if (!isHost || !state) return;

    const push = (force: boolean) => {
      const q = player.queue;
      if (!q.length) return;
      // Signature covers queue identity + order + position in it, so an
      // unchanged queue does not spam the room.
      const signature = `${q.map((t) => t.id).join(',')}|${player.index}`;
      const changed = signature !== lastSyncRef.current.signature;
      const stale = Date.now() - lastSyncRef.current.at > 8000;
      if (!force && !changed && !stale) return;
      lastSyncRef.current = { signature, at: Date.now() };
      void jam.sync(
        q,
        player.index,
        Math.round(player.progress * 1000),
        player.isPlaying,
      );
    };

    // Immediately on becoming host, then on every meaningful change.
    push(true);

    // A slow heartbeat keeps late joiners in sync even when nothing changed
    // (a paused host drifts, a seek happens, a poll is missed).
    const id = setInterval(() => push(false), 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isHost,
    state?.code,
    player.queue.map((t) => t.id).join(','),
    player.index,
    current?.id,
    player.isPlaying,
  ]);

  const shareUrl = useMemo(
    () => (state ? `${location.origin}${location.pathname}#/jam/${state.code}` : ''),
    [state],
  );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the code is on screen anyway */
    }
  };

  // ---------- No room yet: create or join ----------
  if (!code) {
    return (
      <div className="page">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
        <section className="jam-hero">
          <div className="jam-hero-icon">
            <Radio size={26} />
          </div>
          <h1>Start a Jam</h1>
          <p>
            Everyone adds songs to one queue and every device plays the same track at the
            same time. Perfect for a party, a car ride, or a study room.
          </p>
        </section>

        <div className="jam-panels">
          <div className="jam-card">
            <h2>
              <Crown size={18} /> Host a jam
            </h2>
            <p className="jam-hint">
              Your device becomes the speaker. You can lock the queue so only you can add songs.
            </p>
            <input
              className="jam-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={24}
            />
            <button
              className="btn-primary jam-action"
              disabled={jam.busy || !name.trim()}
              onClick={async () => {
                const created = await jam.host(name.trim() || 'Host');
                if (created) onOpenCode(created);
              }}
            >
              {jam.busy ? <Loader2 size={18} className="spin" /> : <Radio size={18} />}
              Create jam
            </button>
          </div>

          <div className="jam-card">
            <h2>
              <LogIn size={18} /> Join a jam
            </h2>
            <p className="jam-hint">Enter the 5-character code your host shared.</p>
            <input
              className="jam-input jam-code-input"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 5))}
              placeholder="AB3K9"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={5}
            />
            <button
              className="btn-primary jam-action"
              disabled={jam.busy || joinCode.length < 4 || !name.trim()}
              onClick={async () => {
                await jam.join(joinCode, name.trim() || 'Guest');
                if (!jam.error) onOpenCode(joinCode);
              }}
            >
              {jam.busy ? <Loader2 size={18} className="spin" /> : <Users size={18} />}
              Join jam
            </button>
            {jam.error && <p className="jam-error">Couldn’t join — check the code and try again.</p>}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Joining by link without a token ----------
  if (state && !jam.hasToken) {
    return (
      <div className="page">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
        <section className="jam-hero">
          <div className="jam-hero-icon">
            <Users size={26} />
          </div>
          <h1>{state.hostName}’s Jam</h1>
          <p>
            {state.queue.length} song{state.queue.length === 1 ? '' : 's'} queued ·{' '}
            {state.members.length} listening
          </p>
        </section>
        <div className="jam-panels">
          <div className="jam-card">
            <h2>
              <LogIn size={18} /> Join this jam
            </h2>
            <input
              className="jam-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={24}
            />
            <button
              className="btn-primary jam-action"
              disabled={jam.busy || !name.trim()}
              onClick={() => void jam.join(code, name.trim() || 'Guest')}
            >
              {jam.busy ? <Loader2 size={18} className="spin" /> : <Users size={18} />}
              Join
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="page">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
        {jam.error === 'not-found' ? (
          <p className="empty">This jam has ended or the code is wrong.</p>
        ) : (
          <div className="skeleton-list">
            {Array.from({ length: 5 }).map((_, i) => (
              <div className="skeleton-row" key={i} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>
        <ArrowLeft size={18} /> Back
      </button>

      <section className="jam-live">
        <div className="jam-live-head">
          <span className="jam-live-dot" />
          <span>JAM LIVE</span>
          {state.locked && (
            <span className="jam-locked">
              <Lock size={12} /> locked
            </span>
          )}
        </div>
        <h1>{state.hostName}’s Jam</h1>
        <div className="jam-share">
          <span className="jam-code">{state.code}</span>
          <button className="btn-ghost jam-copy" onClick={copyLink}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
          {isHost && (
            <button
              className="btn-ghost jam-copy"
              onClick={() => void jam.setLocked(!state.locked)}
            >
              {state.locked ? <Unlock size={16} /> : <Lock size={16} />}
              {state.locked ? 'Unlock' : 'Lock queue'}
            </button>
          )}
        </div>
        <div className="jam-members">
          <Users size={14} />
          <span className="jam-member-list">{state.members.join(' · ')}</span>
        </div>
      </section>

      {current && (
        <section className="jam-now">
          <Artwork track={current} size={64} radius={14} />
          <div className="jam-now-meta">
            <span className="jam-now-label">
              <Music2 size={12} /> {isHost ? 'Playing here' : 'Everyone is hearing'}
            </span>
            <strong>{current.title}</strong>
            <span>{current.artist}</span>
          </div>
          <div className="jam-now-actions">
            {isHost ? (
              <>
                <button className="jam-ctrl" onClick={player.toggle} aria-label="Play/Pause">
                  {player.isPlaying ? 'Pause' : 'Play'}
                </button>
                <button
                  className="jam-ctrl"
                  onClick={() => {
                    player.next();
                    void jam.skip('next');
                  }}
                  aria-label="Skip"
                >
                  <SkipForward size={16} />
                </button>
              </>
            ) : (
              <button
                className="jam-ctrl"
                onClick={() => void jam.skip('next')}
                aria-label="Skip for everyone"
              >
                <SkipForward size={16} /> Skip
              </button>
            )}
          </div>
        </section>
      )}

      <section className="jam-section">
        <h2 className="section-title">
          Queue <span className="jam-count">{state.queue.length}</span>
        </h2>
        <div className="track-list">
          {state.queue.map((track, i) => (
            <div
              key={`${track.id}-${i}`}
              className={`jam-row${i === state.index ? ' active' : ''}`}
            >
              <span className="track-index">{i + 1}</span>
              <Artwork track={track} size={40} radius={8} />
              <span className="track-meta">
                <span className="track-title">{track.title}</span>
                <span className="track-artist">{track.artist}</span>
              </span>
              <span className="track-duration">{formatTime(track.durationSec)}</span>
              {isHost && i !== state.index && (
                <button
                  className="jam-remove"
                  onClick={() => void jam.remove(i)}
                  aria-label={`Remove ${track.title}`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {!state.queue.length && (
            <p className="empty">Queue is empty — add the first song below.</p>
          )}
        </div>
      </section>

      <section className="jam-section">
        <h2 className="section-title">
          <Plus size={18} /> Add from your library
        </h2>
        {!state.locked || isHost ? (
          <div className="jam-add-list">
            {catalog.slice(0, 12).map((track) => {
              const inQueue = state.queue.some((t) => t.id === track.id);
              return (
                <button
                  key={track.id}
                  className={`jam-add${inQueue ? ' added' : ''}`}
                  disabled={inQueue}
                  onClick={() => void jam.addTrack(track)}
                >
                  <Artwork track={track} size={36} radius={8} />
                  <span className="jam-add-meta">
                    <span className="quick-title">{track.title}</span>
                    <span className="quick-artist">{track.artist}</span>
                  </span>
                  {inQueue ? <Check size={16} /> : <Plus size={16} />}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="empty">The host locked the queue — you can still listen along.</p>
        )}
      </section>

      <section className="jam-section">
        <h2 className="section-title">Chat</h2>
        <div className="jam-chat">
          {state.messages.slice(-20).map((m) => (
            <p key={m.id} className="jam-message">
              <strong>{m.author}</strong> {m.text}
            </p>
          ))}
          {!state.messages.length && <p className="empty">No messages yet.</p>}
        </div>
        <form
          className="jam-chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!message.trim()) return;
            void jam.send(message.trim());
            setMessage('');
          }}
        >
          <input
            className="jam-input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Say something…"
            maxLength={200}
          />
          <button className="btn-primary" type="submit" disabled={!message.trim()}>
            <Send size={16} />
          </button>
        </form>
      </section>
    </div>
  );
}
