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
)

data class Playlist(
    val id: String,
    val title: String,
    val description: String,
    val trackIds: List<String>,
    val gradient: String,
)
