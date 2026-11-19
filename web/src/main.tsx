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
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
