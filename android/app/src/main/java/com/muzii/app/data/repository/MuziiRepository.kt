package com.muzii.app.data.repository

import com.muzii.app.BuildConfig
import com.muzii.app.data.DemoCatalog
import com.muzii.app.data.api.MuziiApi
import com.muzii.app.data.api.MuziiApiFactory
import com.muzii.app.data.model.Playlist
import com.muzii.app.data.model.Track
import kotlinx.coroutines.delay

/**
 * Single source of truth. Tries the Cloudflare Worker first; on any failure
 * (offline, Worker not deployed) falls back to the bundled demo catalog so
 * the app is always usable.
 */
class MuziiRepository(private val api: MuziiApi = MuziiApiFactory.create()) {

    /**
     * One retry before giving up. A single dropped packet on a phone should
     * not silently swap the whole catalog for the 16 demo tracks — that was
     * the most visible "app looks broken" symptom.
     */
    private suspend fun <T> withRetry(block: suspend () -> T): Result<T> {
        val first = runCatching { block() }
        if (first.isSuccess) return first
        delay(700)
        return runCatching { block() }
    }

    suspend fun getCatalog(): List<Track> = withRetry {
        api.getCatalog().map { it.copy(streamUrl = proxiedStreamUrl(it.id)) }
    }.getOrElse { DemoCatalog.TRACKS }

    suspend fun getPlaylists(): List<Playlist> {
        val remote = withRetry { api.getPlaylists() }
        if (remote.isFailure) return DemoCatalog.PLAYLISTS
        // Playlist tracks must stream through the Worker too (the demo
        // fallback above already points at real URLs, so it is left alone).
        return remote.getOrThrow().map { pl ->
            pl.copy(tracks = pl.tracks?.map { it.copy(streamUrl = proxiedStreamUrl(it.id)) })
        }
    }

    suspend fun search(query: String): List<Track> = withRetry {
        api.search(query).map { it.copy(streamUrl = proxiedStreamUrl(it.id)) }
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
            )
        }.getOrElse { emptyList() }

        val usable = remote.filter { it.id != seed.id }.map {
            it.copy(streamUrl = proxiedStreamUrl(it.id))
        }
        if (usable.isNotEmpty()) return usable

        // Local fallback: same artist first, then the rest of the catalog.
        val artist = seed.artist.split(",", "&", "feat.", "ft.").firstOrNull()?.trim() ?: seed.artist
        val catalog = runCatching { getCatalog() }.getOrElse { DemoCatalog.TRACKS }
        val playedIds = played.toSet()
        return catalog
            .filter { it.id != seed.id && it.id !in playedIds }
            .sortedByDescending { it.artist.contains(artist, ignoreCase = true) }
            .take(10)
    }

    /**
     * Route audio through the Worker (range support + ad-block + CDN
     * handling). The id is appended to a stable prefix, so calling this twice
     * on an already-proxied URL must not nest another prefix.
     */
    private fun proxiedStreamUrl(id: String): String =
        BuildConfig.API_BASE_URL.trimEnd('/') + "/api/stream/" + id.trimStart('/')
}
