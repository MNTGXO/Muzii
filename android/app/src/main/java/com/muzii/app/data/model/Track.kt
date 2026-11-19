package com.muzii.app.data.model

import com.google.gson.annotations.SerializedName

/** Mirrors the Worker /api JSON (see worker/src/types.ts). */
data class Track(
    val id: String,
    val title: String,
    val artist: String,
    val album: String,
    @SerializedName("durationSec") val durationSec: Long,
    @SerializedName("streamUrl") val streamUrl: String,
    @SerializedName("artworkUrl") val artworkUrl: String,
    @SerializedName("gradientSeed") val gradientSeed: Int,
    /** Spoken language, e.g. "malayalam" — drives the language-locked radio. */
    val language: String? = null,
    /** Release year — keeps a station in one era. */
    val year: Int? = null,
    /** Music director / composer — a strong "same feel" signal. */
    val composer: String? = null,
)

/**
 * Wire form of a track for jam payloads.
 *
 * `streamUrl` is intentionally omitted: the room only needs identity and
 * display metadata, and each guest resolves audio through the Worker itself.
 */
fun Track.toJamMap(): Map<String, Any> = buildMap {
    put("id", id)
    put("title", title)
    put("artist", artist)
    put("album", album)
    put("durationSec", durationSec)
    put("artworkUrl", artworkUrl)
    put("gradientSeed", gradientSeed)
    language?.let { put("language", it) }
    year?.let { put("year", it) }
    composer?.let { put("composer", it) }
}

/** A track inside a jam room, as the Worker serialises it. */
data class JamTrack(
    val id: String,
    val title: String,
    val artist: String,
    val album: String,
    @SerializedName("durationSec") val durationSec: Long,
    @SerializedName("streamUrl") val streamUrl: String,
    @SerializedName("artworkUrl") val artworkUrl: String,
    @SerializedName("gradientSeed") val gradientSeed: Int,
    val language: String? = null,
    val year: Int? = null,
    val composer: String? = null,
) {
    /** Convert to the app's Track (jam tracks stream through the Worker). */
    fun toTrack(): Track = Track(
        id = id,
        title = title,
        artist = artist,
        album = album,
        durationSec = durationSec,
        streamUrl = streamUrl,
        artworkUrl = artworkUrl,
        gradientSeed = gradientSeed,
        language = language,
        year = year,
        composer = composer,
    )
}

/** Room state returned by /api/jam/:code (mirrors worker/src/jam.ts). */
data class JamState(
    val code: String,
    val hostName: String,
    val locked: Boolean,
    val active: Boolean,
    val queue: List<JamTrack>,
    val index: Int,
    val currentTrack: JamTrack?,
    @SerializedName("positionMs") val positionMs: Long,
    val members: List<String>,
)

data class Playlist(
    val id: String,
    val title: String,
    val description: String,
    val trackIds: List<String>,
    /**
     * Full track objects when the API provides them. YouTube Music playlist
     * ids come from separate searches and are NOT in the catalog, so
     * resolving playlist tracks by filtering the catalog renders empty —
     * always prefer this list.
     */
    val tracks: List<Track>? = null,
    val gradient: String,
)
