import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installAdBlocker } from './adblock/blocker';
import './index.css';

// Ad-blocker is installed before first render so no ad node survives.
installAdBlocker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA service worker (production only) — app-shell caching + offline shell.
//
// Registered immediately rather than on `load`: on a slow phone `load` can
// arrive after the user has already tapped Install, and a service worker
// that installs mid-tap is one of the ways an install silently fails.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const register = () => {
    void navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Pick up a new worker as soon as it exists, so a corrected manifest
        // is not served from a stale cache.
        void reg.update().catch(() => undefined);
      })
      .catch(() => undefined);
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });

  // When a new worker takes over, reload once so the page uses it. Without
  // this the old cache can keep serving the previous index.html indefinitely.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
  });
}
