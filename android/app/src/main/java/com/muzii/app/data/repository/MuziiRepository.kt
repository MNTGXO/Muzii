package com.muzii.app.data.repository

import com.muzii.app.BuildConfig
import com.muzii.app.data.DemoCatalog
import com.muzii.app.data.api.MuziiApi
import com.muzii.app.data.api.MuziiApiFactory
import com.muzii.app.data.model.Playlist
import com.muzii.app.data.model.Track

/**
 * Single source of truth. Tries the Cloudflare Worker first; on any failure
 * (offline, Worker not deployed) falls back to the bundled demo catalog so
 * the app is always usable.
 */
class MuziiRepository(private val api: MuziiApi = MuziiApiFactory.create()) {

    suspend fun getCatalog(): List<Track> = runCatching {
        api.getCatalog().map { it.copy(streamUrl = proxiedStreamUrl(it.id)) }
    }.getOrElse { DemoCatalog.TRACKS }

    suspend fun getPlaylists(): List<Playlist> = runCatching {
        api.getPlaylists()
    }.getOrElse { DemoCatalog.PLAYLISTS }
        // Playlist tracks must be streamed through the Worker too.
        .map { pl ->
            pl.copy(tracks = pl.tracks?.map { it.copy(streamUrl = proxiedStreamUrl(it.id)) })
        }

    suspend fun search(query: String): List<Track> = runCatching {
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

    private fun proxiedStreamUrl(id: String): String =
        BuildConfig.API_BASE_URL.trimEnd('/') + "/api/stream/$id"
}
