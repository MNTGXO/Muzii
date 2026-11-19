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

    private fun proxiedStreamUrl(id: String): String =
        BuildConfig.API_BASE_URL.trimEnd('/') + "/api/stream/$id"
}
