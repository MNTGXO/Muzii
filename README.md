# Muzii

**Ad-free music. No account, no paywall, no interruptions.**

Muzii plays music from a curated catalogue across Malayalam, Tamil, Telugu,
Hindi, Kannada, Punjabi, English, Marathi and Bengali — with a clean,
Apple-Music-style interface that stays out of the way.

**Try it:** [muzii.pages.dev](https://muzii.pages.dev)

---

## Install it

You can have Muzii as a real app on any device. No store, no APK required.

**On Android or desktop Chrome** — open the site and tap **Install** in the
banner at the top. It gets its own icon, opens full-screen without the browser
bar, and keeps working when your connection drops.

**On iPhone** — open it in Safari, tap the **Share** button, then
**Add to Home Screen**. (iOS doesn't let sites install themselves; this is the
only way, and it works exactly the same afterwards.)

**Prefer an APK?** The [latest release](https://github.com/MNTGXO/Muzii/releases/latest)
has a single `muzii.apk`. It's a work in progress — see *Known issues* below.

> **Updating from an older APK? Uninstall once first.**
> Earlier builds were each signed with a different key, so Android refuses to
> install the new one over the old ("App not installed"). Uninstall Muzii, then
> install the new APK. From this version on the key is fixed, so later updates
> install straight over the top — no uninstalling again.

---

## What you get

| | |
|---|---|
| **Ad-free** | No audio ads, no banners, no interruptions. Ever. |
| **Background play** | Music keeps going with the screen off. Lock-screen and headset controls work. |
| **Sleep timer** | 15, 30, 45 or 60 minutes, or "end of track". Music pauses rather than stops, so you can pick it back up from the notification whenever you wake. |
| **Listens to you** | Your home screen learns: top songs, recently played, and an *On repeat* station built from what you actually keep playing. |
| **Keeps the feel** | Play a melody and you get melodies — not a thumping remix three songs later. |
| **Jam** | Start a room from whatever is playing and share the code. Everyone hears the same song, at the same second. |
| **Your languages** | Pick your languages once; the feed stays in them. Search still reaches everything. |
| **Never repeats** | The same song never comes back mid-session, and different uploads of one song count as one song. |
| **Shuffle and repeat** | Randomise a queue, or loop the whole list or one song. |
| **Liked Songs** | Everything you've liked, in one place in Library, ready to play. |
| **Picks up where you left off** | Close the app and your queue and position are still there when you come back. |
| **Yours** | Likes and dislikes live on your device and shape every station after them. |

---

## Your playlists on the website

Create and edit playlists in Library, or add songs from the song rows. Your
playlists stay in this browser profile; they don't sync and are lost if you
clear site data. Import public YouTube Music, YouTube or JioSaavn links, or
paste a list of songs from Spotify, Apple Music or another app, one “Title -
Artist” per line. Muzii imports the tracklist, not the original service's
audio, and shows songs it couldn't find. Some public links may be unavailable.

---

## Known issues

Honest list, not a promise of perfection:

- **The APK may show sample tracks on first launch.** If it can't reach the
  music service, it says exactly what failed and offers Retry. Tapping Retry
  once your connection is back is enough.
- **Some Android phones kill background audio.** On certain Xiaomi, Oppo and
  Vivo builds, swiping the app away stops the music service and its
  notification. Resuming then has to happen from inside the app.
- **The music catalogue depends on a third-party service.** If it is
  unreachable, Muzii says so and offers a retry rather than pretending
  everything is fine.
- **Jam needs everyone online.** It syncs every few seconds, so a slow
  connection drifts slightly behind the host.

---

## Questions

**Is it really free?** Yes. No account, no subscription, nothing to sign up for.

**Where does the music come from?** Third-party catalogue services, streamed
through Muzii's own proxy — which is also why it never buffers an ad at you.

**Can I use it offline?** Once installed, the app itself opens offline. The
music needs a connection.

**Muzii doesn't replace buying music.** If you love an artist, support them.

---

<sub>Built with React, Cloudflare Workers and Kotlin. Issues and ideas:
[open an issue](https://github.com/MNTGXO/Muzii/issues).</sub>
