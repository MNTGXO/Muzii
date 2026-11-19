# Muzii — Ad-Free Music Streaming (Web + Android)

Muzii is a music streaming app with an **Apple-Music-style UI**, a built-in
**ad blocker**, and **background play** — shipped as both a **web app** and a
native **Android app** (Kotlin + Jetpack Compose), backed by a
**Cloudflare Worker**.

```
┌──────────────┐      ┌──────────────────┐      ┌─────────────────────┐
│  Web app     │      │  Cloudflare      │      │  Android app        │
│  web/        │─────▶│  Worker (worker/)│◀─────│  android/ (Kotlin)  │
│  React + PWA │ API  │  API + streaming │ API  │  Compose + Media3   │
└──────────────┘      │  proxy + adblock │      └─────────────────────┘
                      └──────────────────┘
                              │
              upstream music provider (YouTube Music via
              InnerTube; demo catalog as automatic fallback)
```

## Why Cloudflare Workers (not Vercel)?

| Concern | Cloudflare Workers | Vercel |
|---|---|---|
| **Audio streaming** | Native `Range` support (206 Partial Content), edge cache, no function timeout — built for proxying media | Serverless functions time out (10–60s) and bill bandwidth per GB — painful for streaming |
| **Ad blocking at the edge** | Worker intercepts every request before it reaches the app; 300+ PoPs | Edge Middleware exists but is tuned for auth/rewrites, not media filtering |
| **Latency** | 300+ cities, cold-start-free | Fewer regions, cold starts on serverless |
| **Cost** | 100k requests/day free, R2/KV included | 100 GB bandwidth free, then pay-per-GB |
| **Web hosting** | Pages (same platform, one deploy) | Excellent for Next.js, but you'd split platforms |

**Decision:** Cloudflare Workers for the API/streaming/adblock layer +
Cloudflare Pages for the web app. One platform, edge-native streaming, and
the Android app talks to the same Worker. (Vercel would be the pick if this
were a Next.js content site with no media proxying.)

## Features

- 🎵 **Streaming** — catalog, search, playlists, and a range-aware streaming
  proxy with edge caching (`worker/src/stream.ts`).
- 🛡️ **Ad blocker (3 layers, one blocklist)**
  - Worker: drops ad/tracker requests at the edge (`worker/src/adblock.ts`).
  - Web: `fetchWithAdBlock` + DOM sweeper + popup guard (`web/src/adblock/blocker.ts`).
  - Android: OkHttp interceptor (`AdBlockInterceptor.kt`).
- 🔋 **Background play**
  - Web: shared `<audio>` element + Media Session API + PWA — music continues
    with the screen off, with lock-screen/notification controls.
  - Android: Media3 `MediaSessionService` foreground service (ExoPlayer) with
    media notification and headset/lock-screen controls.
- 🍎 **Apple-Music-style UI** — signature red gradient (`#FA2D48 → #FC3C44`),
  SF-like typography, rounded artwork cards, glass player bar, full-screen
  Now Playing — on both web and Android.
- 📱 **Android app** — Kotlin + Jetpack Compose (Material 3), minSdk 26.

## Quickstart

### Web + Worker (local dev)

```bash
# Terminal 1 — Worker API on :8787
cd worker && npm install && npm run dev

# Terminal 2 — Web app on :5173 (proxies /api to the Worker)
cd web && npm install && npm run dev
```

> No Worker running? The web app falls back to a bundled demo catalog, so it
> still works standalone.

### Android

```bash
cd android
# Generate the Gradle wrapper once (CI uses setup-gradle, so this is local-only):
gradle wrapper
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

Point the app at your Worker with `-Pmuzii.apiBaseUrl=https://your-worker.workers.dev/`.

### Deploy

```bash
cd worker && npm run deploy          # Cloudflare Worker
cd web && npm run build              # then deploy dist/ to Cloudflare Pages
```

Or use the included GitHub Actions workflow (`.github/workflows/deploy.yml`) —
add `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets and a
`WORKER_URL` variable.

## 📥 Download the APK

Every push to `main` builds APKs in GitHub Actions
(`.github/workflows/build-apk.yml`):

1. Open the **Actions** tab → latest **Build & Release APK** run →
   **Artifacts** → download `muzii-release-apk` (or `muzii-debug-apk`).
2. Or tag a release (`git tag v1.0.0 && git push origin v1.0.0`) — the APK is
   attached to the **GitHub Release** for one-click download.

## Project layout

```
worker/    Cloudflare Worker — API, streaming proxy, edge ad-blocker
web/       React + Vite + PWA web app (Apple-Music UI)
android/   Kotlin + Compose Android app (Media3 background playback)
.github/   APK build/release workflow + Cloudflare deploy workflow
```

## Music provider: YouTube Music (not Spotify)

The Worker ships with a **YouTube Music provider** (`worker/src/providers/youtube.ts`)
built on the unofficial InnerTube API (`ANDROID_MUSIC` client), plus a demo
provider as automatic fallback.

**Why YouTube Music over Spotify?**

| | YouTube Music (InnerTube) | Spotify |
|---|---|---|
| Audio streams | ✅ Stream URLs returned by the player endpoint — proxyable | ❌ DRM-protected, Premium-only via proprietary SDK — cannot be proxied |
| Metadata (search, playlists) | ✅ Same API | ✅ Official Web API (better quality) |
| Official support | ❌ Unofficial — Google can break it | ✅ Official, but audio still locked |
| ToS | ⚠️ Unofficial use | ❌ Stream extraction explicitly forbidden |

Spotify is the better *metadata* source but cannot supply audio to a
proxy-based app. YouTube Music is the only viable audio source here (same
approach as open-source apps like Spotube). Trade-offs are handled:
stream URLs expire (~6h) so they're resolved lazily at stream time
(`resolveStreamUrl`), and any InnerTube failure falls back to the demo
catalog automatically. A Spotify metadata layer can be added later behind
the same `MusicProvider` interface — the web and Android clients need no
changes either way.

## Roadmap

- [ ] Lyrics view (`/api/lyrics/:id` stub is ready)
- [ ] Offline downloads (Android Room + ExoPlayer cache; web Cache Storage)
- [ ] User accounts, liked songs, listening history (Cloudflare D1)
- [ ] Play Store signing (release builds currently use the debug key)
