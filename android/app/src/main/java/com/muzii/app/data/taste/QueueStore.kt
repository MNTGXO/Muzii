package com.muzii.app.data.taste

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.muzii.app.data.model.Track

/**
 * Remembers the queue and where you were in it.
 *
 * The web player keeps playing across a refresh; the APK did not survive
 * anything. If Android reclaimed the process, or you swiped the app away, the
 * queue was gone and you had no way back to the album you were halfway
 * through — the music simply stopped and the player came up empty.
 *
 * This stores the queue lazily (ids and the small metadata needed to render
 * and resume) rather than the full Track payloads, and caps the size so a
 * very long radio session cannot grow the preference blob without bound.
 */
object QueueStore {

    private const val PREFS = "muzii-queue"
    private const val KEY_TRACKS = "queue"
    private const val KEY_INDEX = "index"
    private const val KEY_POSITION = "position"
    private const val KEY_RADIO = "radio"

    /** Enough to reopen where you left off, not an entire day of radio. */
    private const val MAX_TRACKS = 60

    private lateinit var prefs: SharedPreferences
    private val gson = Gson()

    fun init(context: Context) {
        if (::prefs.isInitialized) return
        prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    }

    data class Snapshot(
        val tracks: List<Track>,
        val index: Int,
        val positionMs: Long,
        val radio: Boolean,
    )

    fun save(tracks: List<Track>, index: Int, positionMs: Long, radio: Boolean) {
        if (!::prefs.isInitialized) return
        if (tracks.isEmpty()) {
            clear()
            return
        }
        // Persist the window around the current track so a long radio queue
        // still restores something sensible rather than only its first 60.
        val window = tracks.drop(index).take(MAX_TRACKS)
        if (window.isEmpty()) return
        runCatching {
            prefs.edit()
                .putString(KEY_TRACKS, gson.toJson(window))
                .putInt(KEY_INDEX, 0)
                .putLong(KEY_POSITION, positionMs.coerceAtLeast(0))
                .putBoolean(KEY_RADIO, radio)
                .apply()
        }
    }

    fun load(): Snapshot? {
        if (!::prefs.isInitialized) return null
        val raw = prefs.getString(KEY_TRACKS, null) ?: return null
        val tracks: List<Track> = runCatching {
            gson.fromJson<List<Track>>(
                raw,
                object : TypeToken<List<Track>>() {}.type,
            )
        }.getOrNull() ?: return null
        if (tracks.isEmpty()) return null
        return Snapshot(
            tracks = tracks,
            index = prefs.getInt(KEY_INDEX, 0).coerceIn(0, tracks.lastIndex),
            positionMs = prefs.getLong(KEY_POSITION, 0L).coerceAtLeast(0L),
            radio = prefs.getBoolean(KEY_RADIO, false),
        )
    }

    fun clear() {
        if (!::prefs.isInitialized) return
        prefs.edit().clear().apply()
    }
}
