package com.muzii.app.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.muzii.app.data.model.Playlist
import com.muzii.app.data.model.Track
import com.muzii.app.data.repository.MuziiRepository
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

    init {
        viewModelScope.launch {
            _tracks.value = repository.getCatalog()
            _playlists.value = repository.getPlaylists()
            _searchResults.value = _tracks.value
        }
    }

    fun onQueryChange(query: String) {
        _searchQuery.value = query
        viewModelScope.launch {
            _searchResults.value =
                if (query.isBlank()) _tracks.value else repository.search(query)
        }
    }
}
