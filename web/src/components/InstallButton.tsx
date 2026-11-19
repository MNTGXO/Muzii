import { useEffect, useRef, useState } from 'react';
import { Check, Share, X } from 'lucide-react';

/**
 * "Install Muzii" — a real install button, and an honest one.
 *
 * Two things this deliberately does NOT do:
 *
 *  1. It never shows a button when the browser hasn't offered an install
 *     prompt. `beforeinstallprompt` firing is the browser's own statement
 *     that the app qualifies; without it there is nothing to trigger.
 *
 *  2. It never claims success unless install actually happened. The old
 *     version set "installed" the moment the prompt resolved, which meant the
 *     UI could say "installed" while the browser aborted (NotFoundError, a
 *     navigation, a cancelled intent). The fix is to hold the prompt, call
 *     prompt() exactly once, and then decide from the `appinstalled` event
 *     and the choice outcome — not from optimism.
 *
 * A prompt event is single-use by specification: calling prompt() twice
 * throws. So the event is captured into a ref and cleared after one use.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'muzii-install-dismissed';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
}

type Phase = 'idle' | 'working' | 'failed' | 'installed';

export function InstallButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [phase, setPhase] = useState<Phase>('idle');
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  /** Guards against a double-tap calling prompt() twice (it throws). */
  const usedRef = useRef(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Chrome draws its own mini-infobar unless this is prevented; we want
      // our own button at a moment the user chooses.
      e.preventDefault();
      usedRef.current = false;
      setPromptEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPhase('installed');
      setPromptEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // While an install prompt is pending the browser can silently resolve it
  // with nothing happening. Poll the display mode briefly afterwards so the
  // UI reflects reality instead of hoping.
  const watchForStandalone = () => {
    let tries = 0;
    const id = setInterval(() => {
      tries += 1;
      if (isStandalone()) {
        setInstalled(true);
        setPhase('installed');
        clearInterval(id);
      } else if (tries >= 20) {
        clearInterval(id);
        // Ten seconds and still running in a tab: the install did not
        // happen. Say so rather than leaving a success message.
        setPhase((p) => (p === 'working' ? 'failed' : p));
      }
    }, 500);
  };

  if (installed || dismissed) return null;

  const hide = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode */
    }
  };

  // iOS Safari has no prompt API at all; the honest thing is the real steps.
  if (isIos() && !promptEvent) {
    return (
      <div className="install-banner">
        <div className="install-text">
          <strong>Install Muzii</strong>
          <span>
            Tap <Share size={13} aria-label="Share" /> Share, then “Add to Home Screen”.
          </span>
        </div>
        <button className="install-dismiss" onClick={hide} aria-label="Dismiss">
          <X size={16} />
        </button>
      </div>
    );
  }

  /*
   * Show the banner when there is a live prompt to act on, OR a failure worth
   * reporting. Hiding it the instant a prompt fails would erase the only
   * explanation the user gets - they tapped Install, saw "Installing…", and
   * the banner would simply vanish with no word about what happened.
   */
  if (!promptEvent && phase !== 'failed' && phase !== 'working') return null;

  return (
    <div className="install-banner">
      <div className="install-text">
        <strong>
          {phase === 'failed'
            ? 'Install didn’t finish'
            : phase === 'working'
              ? 'Installing Muzii…'
              : 'Install Muzii'}
        </strong>
        <span>
          {phase === 'failed'
            ? 'Your browser blocked it. Use the browser menu → “Install app”, or open Muzii in Chrome.'
            : phase === 'working'
              ? 'Confirming with your browser — this only takes a moment.'
              : 'Opens like an app — no browser bar, works offline.'}
        </span>
      </div>
      {/*
        Only render the action when there is a live prompt to use. A disabled
        button after a failure is worse than no button: it invites a tap that
        cannot do anything.
      */}
      {promptEvent && (
      <button
        className="btn-primary install-action"
        disabled={phase === 'working'}
        onClick={async () => {
          if (usedRef.current) return;
          usedRef.current = true;
          setPhase('working');
          // prompt() can throw *synchronously-ish* before returning a promise
          // (NotFoundError when the app is not installable at this instant),
          // and userChoice rejects if the prompt is dismissed by navigation.
          // The reported bug was the button sitting on "Installing…" forever
          // because the throw was caught but the state was never moved off
          // `working` before the catch ran. Clear the pending event first,
          // then decide.
          const pending = promptEvent;
          setPromptEvent(null);
          try {
            await pending.prompt();
            const choice = await pending.userChoice.catch(() => null);
            if (choice?.outcome === 'accepted') {
              // Accepted, but the browser may still abort the install. Confirm
              // from the display mode rather than asserting success.
              watchForStandalone();
            } else {
              setPhase('idle');
              hide();
            }
          } catch {
            // Not an install. Say so, and leave a way to retry.
            setPhase('failed');
          }
        }}
      >
        {phase === 'working' ? (
          <>Installing…</>
        ) : (
          <>
            <Check size={16} /> Install
          </>
        )}
      </button>
      )}
      <button className="install-dismiss" onClick={hide} aria-label="Dismiss">
        <X size={16} />
      </button>
    </div>
  );
}
