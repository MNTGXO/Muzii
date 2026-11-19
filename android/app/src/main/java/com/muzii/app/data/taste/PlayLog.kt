package com.muzii.app.data.taste

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.muzii.app.data.model.Track

/**
 * What the listener actually plays, on Android.
 *
 * Mirrors the play log in `web/src/taste/store.ts`, which is what feeds the
 * home screen's "Recently played" / "Your top songs" shelves. Before this,
 * Android's home screen had no history at all: the shelves were the first
 * tracks of the catalog, so the labels meant nothing.
 *
 * SharedPreferences rather than a cookie (the Android equivalent), and a lean
 * record rather than whole tracks, so the log stays small: 60 entries is a
 * handful of KB, not the 26KB that broke the web cookie.
 */
object PlayLog {

    private const val PREFS = "muzii-playlog-v1"
    private const val KEY = "plays"
    private const val MAX_ENTRIES = 60

    /** One listened track. `count` is plays, `at` is the last listen (ms). */
    data class Entry(
        val id: String,
        val count: Int,
        val at: Long,
        val title: String,
        val artist: String,
        val artworkUrl: String,
        val language: String? = null,
    )

    private val gson = Gson()
    private var prefs: SharedPreferences? = null
    private val entries = mutableListOf<Entry>()

    fun init(context: Context) {
        if (prefs != null) return
        val p = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs = p
        val raw = p.getString(KEY, null) ?: return
        runCatching {
            gson.fromJson<List<Entry>>(raw, object : TypeToken<List<Entry>>() {}.type)
        }.getOrNull()?.let {
            entries.clear()
            entries.addAll(it)
        }
    }

    /** Record one completed listen: repeat plays increase the count. */
    @Synchronized
    fun record(track: Track) {
        if (track.id.isBlank()) return
        val existing = entries.firstOrNull { it.id == track.id }
        entries.removeAll { it.id == track.id }
        val latest = entries.maxOfOrNull { it.at } ?: 0L
        entries.add(
            Entry(
                id = track.id,
                count = (existing?.count ?: 0) + 1,
                // Strictly increasing, so two plays in one millisecond don't
                // tie and make "most recent" order-dependent.
                at = maxOf(System.currentTimeMillis(), latest + 1),
                title = track.title,
                artist = track.artist,
                artworkUrl = track.artworkUrl,
                language = track.language,
            ),
        )
        while (entries.size > MAX_ENTRIES) entries.removeAt(0)
        persist()
    }

    private fun persist() {
        val p = prefs ?: return
        p.edit().putString(KEY, gson.toJson(entries)).apply()
    }

    /** Most played first. */
    @Synchronized
    fun topPlayed(limit: Int = 12): List<Entry> =
        entries.sortedWith(compareByDescending<Entry> { it.count }.thenByDescending { it.at })
            .take(limit)

    /** Most recent first. */
    @Synchronized
    fun recentlyPlayed(limit: Int = 12): List<Entry> =
        entries.sortedByDescending { it.at }.take(limit)

    /** Rebuild a Track for playback. The id is all the stream needs. */
    @Synchronized
    fun toTrack(entry: Entry): Track = Track(
        id = entry.id,
        title = entry.title,
        artist = entry.artist,
        album = "",
        durationSec = 0,
        streamUrl = "",
        artworkUrl = entry.artworkUrl,
        gradientSeed = entry.id.fold(0) { acc, c -> acc + c.code } % 360,
        language = entry.language,
    )

    @Synchronized
    fun recentlyPlayedTracks(limit: Int = 12): List<Track> =
        recentlyPlayed(limit).map(::toTrack)

    @Synchronized
    fun topPlayedTracks(limit: Int = 12): List<Track> = topPlayed(limit).map(::toTrack)

    /** Clear the log (used by a future "reset my profile" action). */
    @Synchronized
    fun clear() {
        entries.clear()
        persist()
    }
}
