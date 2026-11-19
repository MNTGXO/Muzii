package com.muzii.app.data.taste

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.muzii.app.data.model.Track
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The listener's taste profile on Android.
 *
 * Mirrors `web/src/taste/store.ts`: liking a song boosts its artist and
 * composer in every later station, disliking one removes it from the feed
 * and from the queue immediately. Persisted to SharedPreferences (the
 * cookie equivalent) so it survives restarts.
 *
 * The profile is also sent to the Worker as query params, so the server does
 * the heavy lifting; this class is the durable copy plus the UI state.
 */
object TasteStore {

    private const val PREFS = "muzii-taste-v1"
    private const val KEY_LIKE = "like"
    private const val KEY_DISLIKE = "dislike"
    private const val KEY_LANG = "languages"
    private const val KEY_ONBOARDED = "onboarded"
    private const val MAX = 200

    private val gson = Gson()
    private lateinit var prefs: SharedPreferences

    private val _likedIds = MutableStateFlow<List<String>>(emptyList())
    val likedIds: StateFlow<List<String>> = _likedIds.asStateFlow()

    private val _dislikedIds = MutableStateFlow<List<String>>(emptyList())
    val dislikedIds: StateFlow<List<String>> = _dislikedIds.asStateFlow()

    /** Language codes chosen at onboarding, e.g. ["malayalam"]. */
    private val _languages = MutableStateFlow<List<String>>(emptyList())
    val languages: StateFlow<List<String>> = _languages.asStateFlow()

    private val _onboarded = MutableStateFlow(false)
    val onboarded: StateFlow<Boolean> = _onboarded.asStateFlow()

    /** Liked tracks, kept whole so the Library can render them. */
    private var likedTracks: List<Track> = emptyList()
    private var dislikedTracks: List<Track> = emptyList()

    fun init(context: Context) {
        if (::prefs.isInitialized) return
        prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        _likedIds.value = readList(KEY_LIKE)
        _dislikedIds.value = readList(KEY_DISLIKE)
        _languages.value = readList(KEY_LANG)
        _onboarded.value = prefs.getBoolean(KEY_ONBOARDED, false)
        likedTracks = readTracks("liked_tracks")
        dislikedTracks = readTracks("disliked_tracks")
    }

    private fun readList(key: String): List<String> {
        val raw = prefs.getString(key, null) ?: return emptyList()
        return runCatching {
            gson.fromJson<List<String>>(raw, object : TypeToken<List<String>>() {}.type)
        }.getOrNull() ?: emptyList()
    }

    private fun readTracks(key: String): List<Track> {
        val raw = prefs.getString(key, null) ?: return emptyList()
        return runCatching {
            gson.fromJson<List<Track>>(raw, object : TypeToken<List<Track>>() {}.type)
        }.getOrNull() ?: emptyList()
    }

    private fun write(key: String, value: Any) {
        prefs.edit().putString(key, gson.toJson(value)).apply()
    }

    fun isLiked(id: String) = _likedIds.value.contains(id)
    fun isDisliked(id: String) = _dislikedIds.value.contains(id)

    /** Like or un-like. A like always clears a previous dislike. */
    fun toggleLike(track: Track) {
        val liked = _likedIds.value.toMutableList()
        val disliked = _dislikedIds.value.toMutableList()
        disliked.remove(track.id)
        dislikedTracks = dislikedTracks.filterNot { it.id == track.id }
        if (liked.contains(track.id)) {
            liked.remove(track.id)
            likedTracks = likedTracks.filterNot { it.id == track.id }
        } else {
            liked.add(track.id)
            // History, newest last. The cap exists so the JSON blob cannot grow
            // without bound, but 40 was low enough that a regular listener
            // silently lost liked songs; likes are cheap to keep.
            likedTracks = (likedTracks + track).takeLast(500)
        }
        commit(liked, disliked)
    }

    /** Dislike or un-dislike. A dislike always clears a previous like. */
    fun toggleDislike(track: Track) {
        val liked = _likedIds.value.toMutableList()
        val disliked = _dislikedIds.value.toMutableList()
        liked.remove(track.id)
        likedTracks = likedTracks.filterNot { it.id == track.id }
        if (disliked.contains(track.id)) {
            disliked.remove(track.id)
            dislikedTracks = dislikedTracks.filterNot { it.id == track.id }
        } else {
            disliked.add(track.id)
            dislikedTracks = (dislikedTracks + track).takeLast(500)
        }
        commit(liked, disliked)
    }

    private fun commit(liked: List<String>, disliked: List<String>) {
        _likedIds.value = liked.takeLast(MAX)
        _dislikedIds.value = disliked.takeLast(MAX)
        write(KEY_LIKE, _likedIds.value)
        write(KEY_DISLIKE, _dislikedIds.value)
        write("liked_tracks", likedTracks)
        write("disliked_tracks", dislikedTracks)
    }

    fun likedTracks(): List<Track> = likedTracks
    fun dislikedTracks(): List<Track> = dislikedTracks

    /** Called by the onboarding screen. */
    fun setLanguages(langs: List<String>) {
        _languages.value = langs
        write(KEY_LANG, langs)
        prefs.edit().putBoolean(KEY_ONBOARDED, true).apply()
        _onboarded.value = true
    }

    fun markOnboarded() {
        prefs.edit().putBoolean(KEY_ONBOARDED, true).apply()
        _onboarded.value = true
    }

    /** Comma-joined ids for the radio request's `avoid` param. */
    fun avoidParam(): String = _dislikedIds.value.takeLast(60).joinToString(",")
    fun lovedParam(): String = _likedIds.value.takeLast(60).joinToString(",")
    fun languagesParam(): String = _languages.value.joinToString(",")
}
