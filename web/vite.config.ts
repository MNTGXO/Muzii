import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In production the app is served from Cloudflare Pages and talks to the
// Muzii Worker (set VITE_API_BASE_URL). In dev, /api is proxied to a local
// `wrangler dev` instance on :8787.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
  },
});
