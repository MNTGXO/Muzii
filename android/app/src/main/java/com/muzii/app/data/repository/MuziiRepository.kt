package com.muzii.app.data.repository

import com.muzii.app.BuildConfig
import com.muzii.app.data.DemoCatalog
import com.muzii.app.data.api.MuziiApi
import com.muzii.app.data.api.MuziiApiFactory
import com.muzii.app.data.model.Playlist
import com.muzii.app.data.model.Track
import com.muzii.app.data.taste.TasteStore
import kotlinx.coroutines.delay

/**
 * Single source of truth. Tries the Cloudflare Worker first; on any failure
 * (offline, Worker not deployed) falls back to the bundled demo catalog so
 * the app is always usable.
 */
class MuziiRepository(private val api: MuziiApi = MuziiApiFactory.create()) {

    /**
     * True when the last catalog load fell back to the bundled demo tracks.
     * The UI shows a banner in that case: silently serving 16 SoundHelix
     * tracks looked like the app was broken with no explanation.
     */
    @Volatile
    var usingDemoCatalog: Boolean = false
        private set

    /**
     * Why the last catalog load failed, in the user's words.
     *
     * The banner used to say only "check your connection", which is
     * unactionable when the real cause is a wrong/unreachable API host — and
     * impossible for anyone to diagnose from a screenshot. Naming the host and
     * the failure type turns a mystery into a one-line bug report.
     */
    @Volatile
    var lastError: String? = null
        private set

    /**
     * One retry before giving up. A single dropped packet on a phone should
     * not silently swap the whole catalog for the 16 demo tracks — that was
     * the most visible "app looks broken" symptom.
     *
     * But a retry is only useful for a *fast* failure. Retrying a timeout
     * doubles the wait, and the request was already at OkHttp's 30 s read
     * limit — so a cold, slow backend kept the home screen empty for roughly
     * a minute before the banner appeared. That reads as a hung app, not a
     * retry. Connections that never establish are bounded separately below,
     * so this only ever waits on a request that has a realistic chance.
     */
    private suspend fun <T> withRetry(block: suspend () -> T): Result<T> {
        val first = runCatching { block() }
        if (first.isSuccess) return first
        // Do not retry something that ran out of time or was cancelled: the
        // second attempt will burn the same budget for nothing.
        val cause = first.exceptionOrNull()
        if (cause is java.net.SocketTimeoutException ||
            cause is kotlinx.coroutines.CancellationException
        ) {
            return first
        }
        delay(400)
        return runCatching { block() }
    }

    /** Turn an exception into something a person can act on. */
    private fun describe(err: Throwable?): String {
        val host = BuildConfig.API_BASE_URL.trimEnd('/')
            .removePrefix("https://").removePrefix("http://")
        return when (err) {
            null -> "Unknown error"
            is java.net.UnknownHostException -> "Can't find $host"
            is java.net.SocketTimeoutException -> "$host is not responding"
            is javax.net.ssl.SSLException -> "Secure connection to $host failed"
            is java.net.ConnectException -> "Can't connect to $host"
            is retrofit2.HttpException -> "$host returned HTTP ${err.code()}"
            is com.google.gson.JsonSyntaxException -> "$host sent an unexpected reply"
            else -> err::class.java.simpleName
        }
    }

    /**
     * Home feed, scoped to the languages picked at onboarding. An empty
     * `languages` means "everything" (used before onboarding).
     */
    suspend fun getCatalog(
        languages: String = TasteStore.languagesParam(),
    ): List<Track> {
        val remote = withRetry {
            api.getCatalog(languages).map { it.copy(streamUrl = proxiedStreamUrl(it)) }
        }
        usingDemoCatalog = remote.isFailure
        lastError = if (remote.isFailure) describe(remote.exceptionOrNull()) else null
        return remote.getOrElse { DemoCatalog.TRACKS }
    }

    suspend fun getPlaylists(
        languages: String = TasteStore.languagesParam(),
    ): List<Playlist> {
        val remote = withRetry { api.getPlaylists(languages) }
        if (remote.isFailure) return DemoCatalog.PLAYLISTS
        // Playlist tracks must stream through the Worker too (the demo
        // fallback above already points at real URLs, so it is left alone).
        return remote.getOrThrow().map { pl ->
            pl.copy(tracks = pl.tracks?.map { it.copy(streamUrl = proxiedStreamUrl(it)) })
        }
    }

    suspend fun search(query: String): List<Track> = withRetry {
        api.search(query).map { it.copy(streamUrl = proxiedStreamUrl(it)) }
    }.getOrElse {
        DemoCatalog.TRACKS.filter {
            it.title.contains(query, ignoreCase = true) ||
                it.artist.contains(query, ignoreCase = true) ||
                it.album.contains(query, ignoreCase = true)
        }
    }

    /**
     * "What plays next" for a song radio: same artist and vibe, never the
     * seed and never anything already played this session. Falls back to the
     * local catalog when the Worker can't help, so a radio never dead-ends.
     */
    suspend fun radio(seed: Track, played: List<String>): List<Track> {
        val remote = runCatching {
            api.radio(
                seedId = seed.id,
                title = seed.title,
                artist = seed.artist,
                exclude = played.joinToString(","),
                limit = 10,
                // Seed metadata keeps the station in its own language; the
                // taste profile keeps disliked songs out for good.
                language = seed.language,
                composer = seed.composer,
                year = seed.year,
                avoid = TasteStore.avoidParam().ifBlank { null },
                loved = TasteStore.lovedParam().ifBlank { null },
                prefLanguages = TasteStore.languagesParam().ifBlank { null },
            )
        }.getOrElse { emptyList() }

        val disliked = TasteStore.dislikedIds.value.toSet()
        val usable = remote
            .filter { it.id != seed.id && it.id !in disliked }
            .map { it.copy(streamUrl = proxiedStreamUrl(it)) }
        if (usable.isNotEmpty()) return usable

        // Keep the language and devotional category even if the catalogue
        // is thin. Rank energy, era and credits softly instead of padding
        // a station with unrelated songs or sample tracks.
        val artist = seed.artist.split(",", "&", "feat.", "ft.").firstOrNull()?.trim().orEmpty()
        val catalog = runCatching { getCatalog() }.getOrElse { emptyList() }
        if (usingDemoCatalog && !seed.id.startsWith("sh-")) return emptyList()
        val playedIds = played.toSet()
        val seedLanguage = seed.language?.trim()?.lowercase()
        return catalog
            .filter { track ->
                track.id != seed.id && track.id !in playedIds && track.id !in disliked &&
                    (seedLanguage.isNullOrBlank() || track.language?.trim()?.lowercase() == seedLanguage) &&
                    isDevotional(track) == isDevotional(seed)
            }
            .sortedByDescending { track ->
                var score = 0
                if (artist.isNotBlank() && track.artist.contains(artist, ignoreCase = true)) score += 40
                if (!seed.composer.isNullOrBlank() && seed.composer.equals(track.composer, ignoreCase = true)) score += 50
                val seedEnergy = energy(seed)
                val trackEnergy = energy(track)
                if (seedEnergy != 0 && trackEnergy != 0 && seedEnergy != trackEnergy) score -= 90
                val sy = seed.year
                val ty = track.year
                if (sy != null && ty != null) score -= (kotlin.math.abs(sy - ty) * 2).coerceAtMost(40)
                score
            }
            .take(10)
    }

    private fun isDevotional(track: Track): Boolean {
        val text = "${track.title} ${track.album}".lowercase()
        return listOf("bhajan", "devotional", "harivarasanam", "suprabhatam", "kirtan", "ashtakam", "stotram", "chalisa", "aarti", "mantra", "hymn", "qawwali", "shloka").any { text.contains(it) }
    }

    private fun energy(track: Track): Int {
        val text = "${track.title} ${track.album}".lowercase()
        val high = listOf("remix", "dj", "club", "edm", "dance", "mashup", "party").any { text.contains(it) }
        val low = listOf("melody", "acoustic", "lullaby", "sad", "mellow", "soft", "romantic", "soulful").any { text.contains(it) }
        return if (high && !low) 1 else if (low && !high) -1 else 0
    }

    /**
     * Route audio through the Worker (range support + ad-block + CDN
     * handling). The id is appended to a stable prefix, so calling this twice
     * on an already-proxied URL must not nest another prefix.
     */
    private fun proxiedStreamUrl(track: Track): String {
        val builder = android.net.Uri.parse(BuildConfig.API_BASE_URL.trimEnd('/'))
            .buildUpon().appendPath("api").appendPath("stream").appendPath(track.id)
        if (track.id.startsWith("js:") || track.streamUrl.startsWith("ytmusic://")) {
            builder.appendQueryParameter("title", track.title)
                .appendQueryParameter("artist", track.artist)
        }
        return builder.build().toString()
    }
}
