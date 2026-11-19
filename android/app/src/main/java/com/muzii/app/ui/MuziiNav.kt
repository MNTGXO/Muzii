package com.muzii.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.muzii.app.data.model.Playlist
import com.muzii.app.data.model.Track
import com.muzii.app.playback.PlayerManager
import com.muzii.app.ui.components.MiniPlayerBar
import com.muzii.app.ui.screens.HomeScreen
import com.muzii.app.ui.screens.LibraryScreen
import com.muzii.app.ui.screens.NowPlayingScreen
import com.muzii.app.ui.screens.PlaylistScreen
import com.muzii.app.ui.screens.SearchScreen
import com.muzii.app.ui.theme.SurfaceDark
import kotlinx.coroutines.delay

private enum class Tab(val label: String) {
    HOME("Home"),
    SEARCH("Search"),
    LIBRARY("Library"),
}

@Composable
fun MuziiNav(
    tracks: List<Track>,
    playlists: List<Playlist>,
    searchQuery: String,
    searchResults: List<Track>,
    onQueryChange: (String) -> Unit,
) {
    var tab by remember { mutableStateOf(Tab.HOME) }
    var showNowPlaying by remember { mutableStateOf(false) }
    var openPlaylist by remember { mutableStateOf<Playlist?>(null) }

    val queue by PlayerManager.queue.collectAsState()
    val currentIndex by PlayerManager.currentIndex.collectAsState()
    val isPlaying by PlayerManager.isPlaying.collectAsState()
    val positionMs by PlayerManager.positionMs.collectAsState()
    val durationMs by PlayerManager.durationMs.collectAsState()
    val currentTrack = queue.getOrNull(currentIndex)

    // Progress ticker while playing.
    LaunchedEffect(isPlaying) {
        while (isPlaying) {
            PlayerManager.tick()
            delay(500)
        }
    }

    val playTrack: (Track, List<Track>) -> Unit = { track, ctx ->
        PlayerManager.playQueue(ctx, ctx.indexOf(track))
    }

    Scaffold(
        containerColor = Color.Black,
        bottomBar = {
            Column {
                currentTrack?.let { track ->
                    MiniPlayerBar(
                        track = track,
                        isPlaying = isPlaying,
                        onToggle = { PlayerManager.toggle() },
                        onNext = { PlayerManager.next() },
                        onPrev = { PlayerManager.prev() },
                        onOpen = { showNowPlaying = true },
                    )
                }
                NavigationBar(containerColor = SurfaceDark) {
                    NavigationBarItem(
                        selected = tab == Tab.HOME,
                        onClick = { tab = Tab.HOME },
                        icon = { Icon(Icons.Filled.Home, contentDescription = null) },
                        label = { Text(Tab.HOME.label) },
                    )
                    NavigationBarItem(
                        selected = tab == Tab.SEARCH,
                        onClick = { tab = Tab.SEARCH },
                        icon = { Icon(Icons.Filled.Search, contentDescription = null) },
                        label = { Text(Tab.SEARCH.label) },
                    )
                    NavigationBarItem(
                        selected = tab == Tab.LIBRARY,
                        onClick = { tab = Tab.LIBRARY },
                        icon = { Icon(Icons.Filled.LibraryMusic, contentDescription = null) },
                        label = { Text(Tab.LIBRARY.label) },
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            val playlist = openPlaylist
            if (playlist != null) {
                // Prefer the playlist's embedded tracks: YouTube playlist
                // ids come from separate searches and are not in the
                // catalog, so filtering rendered empty playlists.
                val playlistTracks = playlist.tracks?.takeIf { it.isNotEmpty() }
                    ?: playlist.trackIds.mapNotNull { id -> tracks.find { it.id == id } }
                PlaylistScreen(
                    playlist = playlist,
                    tracks = playlistTracks,
                    currentTrackId = currentTrack?.id,
                    isPlaying = isPlaying,
                    onBack = { openPlaylist = null },
                    onPlayTrack = playTrack,
                )
            } else {
                when (tab) {
                    Tab.HOME -> HomeScreen(
                        tracks = tracks,
                        playlists = playlists,
                        currentTrackId = currentTrack?.id,
                        isPlaying = isPlaying,
                        onPlayTrack = playTrack,
                        onOpenPlaylist = { openPlaylist = it },
                    )
                    Tab.SEARCH -> SearchScreen(
                        query = searchQuery,
                        results = searchResults,
                        currentTrackId = currentTrack?.id,
                        isPlaying = isPlaying,
                        onQueryChange = onQueryChange,
                        onPlayTrack = playTrack,
                    )
                    Tab.LIBRARY -> LibraryScreen(
                        playlists = playlists,
                        onOpenPlaylist = { openPlaylist = it },
                    )
                }
            }
        }
    }

    if (showNowPlaying && currentTrack != null) {
        NowPlayingScreen(
            track = currentTrack,
            isPlaying = isPlaying,
            positionMs = positionMs,
            durationMs = durationMs,
            onToggle = { PlayerManager.toggle() },
            onNext = { PlayerManager.next() },
            onPrev = { PlayerManager.prev() },
            onSeek = { PlayerManager.seekTo(it) },
            onClose = { showNowPlaying = false },
        )
    }
}
