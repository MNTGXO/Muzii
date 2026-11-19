package com.muzii.app.ui

import androidx.activity.compose.BackHandler
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
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
import com.muzii.app.data.taste.TasteStore
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
    offlineReason: String? = null,
    onRetry: () -> Unit = {},
) {
    /*
     * rememberSaveable, not remember.
     *
     * Nothing in the app was saveable, so rotating the device or letting the
     * process be reclaimed dropped you back on Home with the player shut —
     * the music kept playing (it lives in a service) but the UI forgot where
     * you were. Tab and overlay visibility survive now; the playlist is
     * restored by id because Playlist is not Parcelable.
     */
    // Stored as an ordinal: rememberSaveable cannot serialise a custom enum.
    var tabOrdinal by rememberSaveable { mutableIntStateOf(Tab.HOME.ordinal) }
    val tab = Tab.entries[tabOrdinal.coerceIn(0, Tab.entries.lastIndex)]
    var showNowPlaying by rememberSaveable { mutableStateOf(false) }
    var showQueue by rememberSaveable { mutableStateOf(false) }
    var openPlaylistId by rememberSaveable { mutableStateOf<String?>(null) }
    val openPlaylist = openPlaylistId?.let { id -> playlists.find { it.id == id } }

    val queue by PlayerManager.queue.collectAsState()
    val currentIndex by PlayerManager.currentIndex.collectAsState()
    val isPlaying by PlayerManager.isPlaying.collectAsState()
    val positionMs by PlayerManager.positionMs.collectAsState()
    val durationMs by PlayerManager.durationMs.collectAsState()
    val sleepRemainingMs by PlayerManager.sleepRemainingMs.collectAsState()
    val sleepAtTrackEnd by PlayerManager.sleepAtTrackEnd.collectAsState()
    val shuffle by PlayerManager.shuffle.collectAsState()
    // These two were never collected, so a player error or a long buffer was
    // completely invisible: a track failed, the player silently skipped it,
    // and the only clue was that the song changed by itself.
    val buffering by PlayerManager.buffering.collectAsState()
    val playerError by PlayerManager.error.collectAsState()
    val repeatMode by PlayerManager.repeatMode.collectAsState()
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

    /*
     * System Back.
     *
     * There was no BackHandler anywhere, so pressing back while the full
     * player or Up Next was open closed the whole app — a jarring exit that
     * lost the screen you were on. Peel overlays in the order they stack:
     * now playing → queue → playlist → exit.
     */
    BackHandler(enabled = showNowPlaying) { showNowPlaying = false }
    BackHandler(enabled = showQueue) { showQueue = false }
    BackHandler(enabled = openPlaylistId != null) { openPlaylistId = null }

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
                        buffering = buffering,
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
                        onClick = { tabOrdinal = Tab.HOME.ordinal },
                        icon = { Icon(Icons.Filled.Home, contentDescription = null) },
                        label = { Text(Tab.HOME.label) },
                    )
                    NavigationBarItem(
                        selected = tab == Tab.SEARCH,
                        onClick = { tabOrdinal = Tab.SEARCH.ordinal },
                        icon = { Icon(Icons.Filled.Search, contentDescription = null) },
                        label = { Text(Tab.SEARCH.label) },
                    )
                    NavigationBarItem(
                        selected = tab == Tab.LIBRARY,
                        onClick = { tabOrdinal = Tab.LIBRARY.ordinal },
                        icon = { Icon(Icons.Filled.LibraryMusic, contentDescription = null) },
                        label = { Text(Tab.LIBRARY.label) },
                    )
                    NavigationBarItem(
                        selected = tab == Tab.JAM,
                        onClick = { tabOrdinal = Tab.JAM.ordinal },
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
                    onBack = { openPlaylistId = null },
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
                        onOpenPlaylist = { openPlaylistId = it.id },
                        onStartRadio = { track -> PlayerManager.startRadio(track) },
                        onOpenJam = { tabOrdinal = Tab.JAM.ordinal },
                        onOpenQueue = { showQueue = true },
                        likedIds = likedIds,
                        dislikedIds = dislikedIds,
                        onToggleLike = onToggleLike,
                        onToggleDislike = onToggleDislike,
                        offline = offline,
                        offlineReason = offlineReason,
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
                        onOpenPlaylist = { openPlaylistId = it.id },
                        // Keyed on likedIds so liking a song while Library is
                        // open actually updates the card: reading the store
                        // directly is invisible to Compose.
                        likedTracks = remember(likedIds) { TasteStore.likedTracks() },
                        recentTracks = remember(currentIndex, isPlaying) {
                            PlayLog.recentlyPlayedTracks(50)
                        },
                        onPlayLiked = {
                            val liked = TasteStore.likedTracks()
                            if (liked.isNotEmpty()) PlayerManager.playQueue(liked, 0)
                        },
                        onPlayRecent = {
                            val recent = PlayLog.recentlyPlayedTracks(50)
                            if (recent.isNotEmpty()) PlayerManager.playQueue(recent, 0)
                        },
                        currentTrackId = currentTrack?.id,
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
            onRemove = { PlayerManager.removeAt(it) },
            onMove = { from, to -> PlayerManager.moveItem(from, to) },
            onPlayNext = { PlayerManager.playNext(it) },
        )
    }

    if (showNowPlaying && currentTrack != null) {
        NowPlayingScreen(
            track = currentTrack,
            isPlaying = isPlaying,
            buffering = buffering,
            error = playerError,
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
            sleepRemainingMs = sleepRemainingMs,
            sleepAtTrackEnd = sleepAtTrackEnd,
            onSetSleepTimer = { PlayerManager.setSleepTimer(it) },
            shuffle = shuffle,
            onToggleShuffle = { PlayerManager.toggleShuffle() },
            repeatMode = repeatMode,
            onCycleRepeat = { PlayerManager.cycleRepeat() },
        )
    }
}
