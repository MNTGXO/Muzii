package com.muzii.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.muzii.app.data.model.Playlist
import com.muzii.app.data.model.Track
import com.muzii.app.data.repository.MuziiRepository
import com.muzii.app.data.taste.TasteStore
import com.muzii.app.playback.PlayerManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class MuziiViewModel(
    private val repository: MuziiRepository = MuziiRepository(),
) : ViewModel() {

    private val _tracks = MutableStateFlow<List<Track>>(emptyList())
    val tracks: StateFlow<List<Track>> = _tracks.asStateFlow()

    private val _playlists = MutableStateFlow<List<Playlist>>(emptyList())
    val playlists: StateFlow<List<Playlist>> = _playlists.asStateFlow()

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _searchResults = MutableStateFlow<List<Track>>(emptyList())
    val searchResults: StateFlow<List<Track>> = _searchResults.asStateFlow()

    private val _loading = MutableStateFlow(true)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    /**
     * True when the catalog fell back to the 16 bundled demo tracks, which
     * means the backend is unreachable. The home screen shows a banner so
     * "why am I seeing SoundHelix songs" has an answer.
     */
    private val _offline = MutableStateFlow(false)
    val offline: StateFlow<Boolean> = _offline.asStateFlow()

    private var searchJob: Job? = null

    /** True until the listener picks languages (or skips). */
    val onboarded: StateFlow<Boolean> = TasteStore.onboarded
    val likedIds: StateFlow<List<String>> = TasteStore.likedIds
    val dislikedIds: StateFlow<List<String>> = TasteStore.dislikedIds

    init {
        viewModelScope.launch {
            // The catalog is language-scoped, so taste must be loaded first.
            _tracks.value = repository.getCatalog()
            _offline.value = repository.usingDemoCatalog
            _loading.value = false
            _searchResults.value = _tracks.value
            _playlists.value = repository.getPlaylists()
        }

        // The player asks for more songs when a radio queue runs dry.
        PlayerManager.onQueueExhausted = { seed, played ->
            viewModelScope.launch {
                val more = repository.radio(seed, played)
                PlayerManager.appendToQueue(more)
            }
        }
    }

    /**
     * Debounced search. The previous job is cancelled so a slow earlier
     * request can never overwrite the results of a later keystroke.
     */
    fun onQueryChange(query: String) {
        _searchQuery.value = query
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            if (query.isBlank()) {
                _searchResults.value = _tracks.value
                return@launch
            }
            delay(300)
            val results = repository.search(query)
            // Cancelled jobs throw here, so stale results never land.
            if (_searchQuery.value == query) _searchResults.value = results
        }
    }

    fun retry() {
        viewModelScope.launch {
            _loading.value = true
            _tracks.value = repository.getCatalog()
            _offline.value = repository.usingDemoCatalog
            _playlists.value = repository.getPlaylists()
            _loading.value = false
        }
    }

    /** Called by onboarding once the listener picks their languages. */
    fun completeOnboarding(languages: List<String>) {
        if (languages.isEmpty()) {
            TasteStore.markOnboarded()
        } else {
            TasteStore.setLanguages(languages)
        }
        // The feed is language-scoped, so reload it immediately.
        retry()
    }

    fun toggleLike(track: Track) {
        TasteStore.toggleLike(track)
        // A like also nudges the current station: any future fetch will
        // boost this artist/composer.
    }

    fun toggleDislike(track: Track) {
        TasteStore.toggleDislike(track)
        // If the disliked song is playing, skip away from it right now.
        if (PlayerManager.current?.id == track.id) {
            PlayerManager.next()
        } else {
            PlayerManager.dropDisliked(TasteStore.dislikedIds.value)
        }
    }
}
