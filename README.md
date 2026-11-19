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
              provider chain: JioSaavn → YouTube Music
              (InnerTube) → bundled demo catalog
```

## Where the audio comes from (and why)

`PROVIDER` in `worker/wrangler.toml` selects a **provider chain** — each
provider is tried in order until one returns usable results
(`worker/src/providers/index.ts`):

| Order | Provider | Why |
|---|---|---|
| 1 | **JioSaavn** (`providers/jiosaavn.ts`) | Plain JSON API, and audio is served as permanent CDN links the Worker can proxy. Deepest catalog for Indian languages (Hindi, Malayalam, Tamil, Telugu, Punjabi…). |
| 2 | **YouTube Music** (`providers/youtube.ts`) | Widest catalog via InnerTube, with Piped/Invidious mirrors as a second path. |
| 3 | **Demo** (`providers/demo.ts`) | Always works — the app never hard-fails. |

**Honest constraint:** YouTube refuses most InnerTube *player* calls coming
from datacenter IPs (Cloudflare included) with "Sign in to confirm you're not
a bot", and the `googlevideo` URLs it does return are bound to the IP that
minted them. From a Worker that means YouTube audio is best-effort only —
which is exactly why JioSaavn leads the chain. If you want YouTube to be the
primary source, put a residential/mobile HTTP proxy in front of the Worker's
upstream calls (see the client-strategy comments in `worker/src/providers/youtube.ts`).

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

- 🔁 **Song radio that never repeats, and never changes language** — play
  *Arikil Pathiye* and the queue continues in that lane (*Thoominnal* next).
  The next track is ranked by **language → composer → artist → era**, so a
  Malayalam station stays Malayalam instead of drifting into Telugu. The
  queue refills itself when it runs low, and nothing you have heard this
  session comes back — matched on both track id *and* normalised
  title+artist, so a "Remastered" duplicate or a re-upload can't sneak in
  (`worker/src/radio.ts`, `web/src/player/queue.ts`).
- 🌐 **Pick your languages on first run** — the home feed is scoped to them
  from the very first request. Search is deliberately *not* scoped: if you
  look something up, you get it regardless of your settings.
- 👍 **Likes and dislikes that actually stick** — the profile lives in a
  first-party cookie (`muzii_taste`) and is sent with every radio request.
  A liked song pulls its artist and composer up the station; a disliked song
  is dropped from the feed immediately, skipped if it is playing, and never
  queued again. Dislike three songs by one singer and that singer stops
  appearing. Changeable any time from Library → Taste.
- 🎉 **Muzii Jam** — the Spotify-Jam equivalent. Host a room, share the
  5-character code or link, and everyone adds to one queue while every device
  plays the same track at the same time. Guests can skip, chat, and (if the
  host unlocks it) add songs. Hosted in a Cloudflare Durable Object
  (`worker/src/jam.ts`), reachable from both web and Android.
- 📐 **Responsive everywhere** — four breakpoints plus landscape and
  touch-specific handling: full sidebar → icon rail → bottom tab bar, the
  queue turns into a bottom sheet, artwork and type scale with `clamp()`, and
  safe-area insets keep controls clear of the notch. Android resizes its
  artwork and cards the same way and survives rotation without restarting
  playback.
- 📜 **The whole queue is reachable** — Up Next lives in a flex column with a
  single scroll body (`min-height: 0`), so a 25-song radio can be scrolled to
  the end instead of being clipped. Android gets the same list as a
  virtualised `LazyColumn` that opens scrolled to the current song.

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

## Muzii Jam

```
Host (web)                          Guests (web / Android)
──────────                          ──────────────────────
POST /api/jam          ──► code AB3K9
share #/jam/AB3K9      ──► POST /api/jam/AB3K9/join  ──► guest token
                                               │
queue / skip / chat    ──► Durable Object ◄────┘
                          (one per jam code)
host reports position  ──► guests seek to positionMs + elapsed
```

Rooms live in a Durable Object keyed by the jam code, so one room's writes
are serialised. The **host's device is the speaker**: it reports playback
position and everyone else follows, so audio never has to stream *through*
the server. Clients poll every 4s — that keeps it deployable on the Workers
free tier and survives proxies that break WebSockets. Rooms expire after 6h
or when everyone leaves; that is intended, a jam is ephemeral.

Playing from Android: open the **Jam** tab and enter the code. Hosting stays
on web (a phone that hosts would end the party when the app is swiped away).

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
add `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets. No `WORKER_URL`
variable is needed: the workflow captures the deployed Worker URL and writes
a Pages `_redirects` rule so the web app's `/api/*` requests are proxied to
the Worker same-origin.

## 📥 Download the APK

Every push to `mnbots` builds APKs in GitHub Actions
(`.github/workflows/build-apk.yml`):

**Install `muzii.apk` — there is only one file.** (Earlier builds published
both `app-debug.apk` and `app-release.apk`, which made it impossible to tell
which to install; only the release build is published now.)

1. Open the **Releases** page and download **`muzii.apk`** from the latest
   release — one tap on your phone.
2. Or from the **Actions** tab → latest **Build & Release APK** run →
   **Artifacts** → `muzii-apk`.

Tagging (`git tag v1.0.0 && git push origin v1.0.0`) is what publishes a
Release; a plain push to `mnbots` only builds the artifact.

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
