import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

/**
 * "Install Muzii" — a real install button, not a link to instructions.
 *
 * Why this is not one line of code: browsers gate installation behind
 * platform rules.
 *
 *  - Chrome / Edge (desktop + Android) fire `beforeinstallprompt` when the
 *    app is installable. We hold that event and call prompt() on tap, which
 *    is the only way to open the install dialog at a moment of the user's
 *    choosing. If the event never fires, the app is NOT installable — so the
 *    button must not appear and pretend otherwise.
 *  - iOS Safari has no such API at all. The honest thing is to show the
 *    Share → "Add to Home Screen" hint instead of a button that does nothing.
 *  - Already installed (running standalone) → show nothing.
 *
 * Getting installability right is mostly the manifest: Chrome requires PNG
 * icons at 192 and 512 px. This manifest previously listed only an SVG, so
 * it could never be installed from Chrome no matter what the UI offered.
 */

/** The non-standard event Chrome fires; not in lib.dom.d.ts. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'muzii-install-dismissed';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari's own flag.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
}

export function InstallButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Chrome shows its own mini-infobar unless this is prevented; we want
      // our own button instead.
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || dismissed) return null;

  const hide = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode */
    }
  };

  // iOS: there is no prompt API, so offer the real instructions.
  if (isIos() && !prompt) {
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

  // Desktop/Android without a captured prompt: the app isn't installable yet
  // (or already was). Stay quiet rather than showing a dead button.
  if (!prompt) return null;

  return (
    <div className="install-banner">
      <div className="install-text">
        <strong>Install Muzii</strong>
        <span>Opens like an app — no browser bar, works offline.</span>
      </div>
      <button
        className="btn-primary install-action"
        onClick={async () => {
          await prompt.prompt();
          const choice = await prompt.userChoice.catch(() => null);
          // A dismissed prompt must not nag on every visit, but it should
          // come back if they change their mind later.
          setPrompt(null);
          if (choice?.outcome === 'accepted') setInstalled(true);
          else hide();
        }}
      >
        <Download size={16} /> Install
      </button>
      <button className="install-dismiss" onClick={hide} aria-label="Dismiss">
        <X size={16} />
      </button>
    </div>
  );
}
