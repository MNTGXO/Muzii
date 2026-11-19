package com.muzii.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.muzii.app.data.model.Playlist
import com.muzii.app.data.model.Track
import com.muzii.app.data.repository.MuziiRepository
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

    private var searchJob: Job? = null

    init {
        viewModelScope.launch {
            // Fetch in parallel: a slow playlist call shouldn't delay the catalog.
            _tracks.value = repository.getCatalog()
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
            _playlists.value = repository.getPlaylists()
            _loading.value = false
        }
    }
}
