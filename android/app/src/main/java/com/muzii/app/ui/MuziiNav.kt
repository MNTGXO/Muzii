package com.muzii.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.Podcasts
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
import com.muzii.app.ui.screens.JamScreen
import com.muzii.app.ui.screens.NowPlayingScreen
import com.muzii.app.ui.screens.OnboardingScreen
import com.muzii.app.ui.screens.QueueScreen
import com.muzii.app.data.taste.PlayLog
import com.muzii.app.ui.screens.PlaylistScreen
import com.muzii.app.ui.screens.SearchScreen
import com.muzii.app.ui.theme.SurfaceDark
import kotlinx.coroutines.delay

private enum class Tab(val label: String) {
    HOME("Home"),
    SEARCH("Search"),
    LIBRARY("Library"),
    JAM("Jam"),
}

@Composable
fun MuziiNav(
    tracks: List<Track>,
    playlists: List<Playlist>,
    searchQuery: String,
    searchResults: List<Track>,
    onQueryChange: (String) -> Unit,
    onboarded: Boolean = true,
    onCompleteOnboarding: (List<String>) -> Unit = {},
    likedIds: List<String> = emptyList(),
    dislikedIds: List<String> = emptyList(),
    onToggleLike: (Track) -> Unit = {},
    onToggleDislike: (Track) -> Unit = {},
    /** True when the catalog is the bundled demo set (backend unreachable). */
    offline: Boolean = false,
    onRetry: () -> Unit = {},
) {
    var tab by remember { mutableStateOf(Tab.HOME) }
    var showNowPlaying by remember { mutableStateOf(false) }
    var showQueue by remember { mutableStateOf(false) }
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

    // First run: pick languages before the feed is built, so the home screen
    // is never populated with the wrong ones.
    if (!onboarded) {
        OnboardingScreen(onDone = onCompleteOnboarding)
        return
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
                        liked = likedIds.contains(track.id),
                        onToggleLike = { onToggleLike(track) },
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
                    NavigationBarItem(
                        selected = tab == Tab.JAM,
                        onClick = { tab = Tab.JAM },
                        icon = { Icon(Icons.Filled.Podcasts, contentDescription = null) },
                        label = { Text(Tab.JAM.label) },
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
                    onStartRadio = { track -> PlayerManager.startRadio(track) },
                    likedIds = likedIds,
                    dislikedIds = dislikedIds,
                    onToggleLike = onToggleLike,
                    onToggleDislike = onToggleDislike,
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
                        onStartRadio = { track -> PlayerManager.startRadio(track) },
                        onOpenJam = { tab = Tab.JAM },
                        onOpenQueue = { showQueue = true },
                        likedIds = likedIds,
                        dislikedIds = dislikedIds,
                        onToggleLike = onToggleLike,
                        onToggleDislike = onToggleDislike,
                        offline = offline,
                        onRetry = onRetry,
                        // Read straight from PlayLog: it changes as tracks
                        // finish, and this composable already recomposes on
                        // every player state change.
                        recentlyPlayed = PlayLog.recentlyPlayedTracks(8),
                        topPlayed = PlayLog.topPlayedTracks(12),
                    )
                    Tab.SEARCH -> SearchScreen(
                        query = searchQuery,
                        results = searchResults,
                        currentTrackId = currentTrack?.id,
                        isPlaying = isPlaying,
                        onQueryChange = onQueryChange,
                        onPlayTrack = playTrack,
                        onStartRadio = { track -> PlayerManager.startRadio(track) },
                        likedIds = likedIds,
                        dislikedIds = dislikedIds,
                        onToggleLike = onToggleLike,
                        onToggleDislike = onToggleDislike,
                    )
                    Tab.LIBRARY -> LibraryScreen(
                        playlists = playlists,
                        onOpenPlaylist = { openPlaylist = it },
                    )
                    Tab.JAM -> JamScreen()
                }
            }
        }
    }

    if (showQueue) {
        QueueScreen(
            queue = queue,
            index = currentIndex,
            onJump = { PlayerManager.jumpTo(it) },
            onClose = { showQueue = false },
            likedIds = likedIds,
            dislikedIds = dislikedIds,
            onToggleLike = onToggleLike,
            onToggleDislike = onToggleDislike,
        )
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
            onOpenQueue = {
                showNowPlaying = false
                showQueue = true
            },
            liked = likedIds.contains(currentTrack.id),
            disliked = dislikedIds.contains(currentTrack.id),
            onToggleLike = { onToggleLike(currentTrack) },
            onToggleDislike = { onToggleDislike(currentTrack) },
        )
    }
}
