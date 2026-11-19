package com.muzii.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.muzii.app.data.model.Playlist
import com.muzii.app.data.model.Track
import com.muzii.app.ui.components.TrackRow
import com.muzii.app.ui.theme.TextSecondary

@Composable
fun HomeScreen(
    tracks: List<Track>,
    playlists: List<Playlist>,
    currentTrackId: String?,
    isPlaying: Boolean,
    onPlayTrack: (Track, List<Track>) -> Unit,
    onOpenPlaylist: (Playlist) -> Unit,
    onStartRadio: (Track) -> Unit = {},
    onOpenJam: () -> Unit = {},
    onOpenQueue: () -> Unit = {},
    likedIds: List<String> = emptyList(),
    dislikedIds: List<String> = emptyList(),
    onToggleLike: (Track) -> Unit = {},
    onToggleDislike: (Track) -> Unit = {},
    /** What this listener actually played, for the personal shelves. */
    recentlyPlayed: List<Track> = emptyList(),
    topPlayed: List<Track> = emptyList(),
    offline: Boolean = false,
    onRetry: () -> Unit = {},
) {
    // When there is a play log, the song list IS the listener's top songs;
    // otherwise fall back to the language feed so a new profile isn't empty.
    val shelfTracks = if (topPlayed.isNotEmpty()) topPlayed else tracks.take(12)
    // Responsive card sizing: two-and-a-bit cards on a phone, more on a
    // tablet or in landscape, instead of one fixed 150.dp everywhere.
    val screenWidthDp = LocalConfiguration.current.screenWidthDp
    val cardSize = when {
        screenWidthDp >= 900 -> 190.dp
        screenWidthDp >= 600 -> 168.dp
        else -> 140.dp
    }

    LazyColumn(modifier = Modifier.fillMaxSize()) {
        if (offline) {
            item {
                // The demo catalog means the Worker is unreachable. Say so:
                // silently showing 16 stock tracks looked like a broken app.
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0x33FF9F0A))
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            "Can't reach Muzii right now",
                            color = Color(0xFFFFD60A),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            "These are offline sample tracks. Check your connection and retry.",
                            color = TextSecondary,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    Button(onClick = onRetry) { Text("Retry") }
                }
            }
        }
        item {
            Text(
                "Good evening",
                style = MaterialTheme.typography.headlineMedium,
                color = Color.White,
                modifier = Modifier.padding(16.dp),
            )
        }
        playlists.firstOrNull()?.let { featured ->
            item {
                // Prefer embedded tracks — provider playlist ids are not in
                // the catalog, so filtering renders an empty playlist.
                val featuredTracks = featured.tracks?.takeIf { it.isNotEmpty() }
                    ?: tracks.filter { featured.trackIds.contains(it.id) }
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                        .clip(RoundedCornerShape(20.dp))
                        .background(
                            Brush.linearGradient(
                                listOf(Color(0xFFFA2D48), Color(0xFFFC3C44)),
                            ),
                        )
                        .padding(20.dp),
                ) {
                    Column {
                        Text(
                            "FEATURED PLAYLIST",
                            style = MaterialTheme.typography.labelSmall,
                            color = Color.White.copy(alpha = 0.8f),
                        )
                        Text(
                            featured.title,
                            style = MaterialTheme.typography.headlineSmall,
                            color = Color.White,
                        )
                        Text(
                            featured.description,
                            color = Color.White.copy(alpha = 0.85f),
                        )
                        Spacer(Modifier.height(12.dp))
                        Button(
                            onClick = {
                                if (featuredTracks.isNotEmpty()) {
                                    onPlayTrack(featuredTracks.first(), featuredTracks)
                                }
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Color.White,
                                contentColor = Color.Black,
                            ),
                        ) {
                            Icon(Icons.Filled.PlayArrow, contentDescription = null)
                            Spacer(Modifier.width(6.dp))
                            Text("Play")
                        }
                    }
                }
            }
        }
        item {
            // Muzii Jam entry point (shared listening).
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(
                        Brush.linearGradient(
                            listOf(Color(0x29FA2D48), Color(0x1FBF5AF2)),
                        ),
                    )
                    .clickable(onClick = onOpenJam)
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    Icons.Filled.Groups,
                    contentDescription = null,
                    tint = Color.White,
                )
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text("Start a Jam", color = Color.White)
                    Text(
                        "Listen together — every device stays in sync.",
                        color = TextSecondary,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
        // ---- personal shelves -------------------------------------------
        // These used to be the first N catalog tracks, so "Recently played"
        // showed songs the listener had never played. They now come from
        // PlayLog, which is filled as tracks actually finish.
        if (recentlyPlayed.isNotEmpty()) {
            item {
                Text(
                    "Recently played",
                    style = MaterialTheme.typography.titleLarge,
                    color = Color.White,
                    modifier = Modifier.padding(16.dp),
                )
            }
            item {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(recentlyPlayed, key = { it.id }) { track ->
                        Column(
                            modifier = Modifier
                                .width(112.dp)
                                .clickable { onPlayTrack(track, recentlyPlayed) },
                        ) {
                            ArtworkBox(track = track, size = 112.dp)
                            Spacer(Modifier.height(6.dp))
                            Text(track.title, color = Color.White, maxLines = 1)
                            Text(
                                track.artist,
                                color = TextSecondary,
                                maxLines = 1,
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }
            }
        }
        if (topPlayed.isNotEmpty()) {
            item {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(16.dp),
                ) {
                    Text(
                        "On repeat",
                        style = MaterialTheme.typography.titleLarge,
                        color = Color.White,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        "${topPlayed.first().title} · most played",
                        color = TextSecondary,
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                    )
                }
            }
        }
        item {
            Text(
                if (topPlayed.isNotEmpty()) "Your top songs" else "Start here",
                style = MaterialTheme.typography.titleLarge,
                color = Color.White,
                modifier = Modifier.padding(16.dp),
            )
        }
        item {
            Text(
                "Playlists",
                style = MaterialTheme.typography.titleLarge,
                color = Color.White,
                modifier = Modifier.padding(16.dp),
            )
        }
        item {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                items(playlists) { pl ->
                    Column(
                        modifier = Modifier
                            .width(cardSize)
                            .clickable { onOpenPlaylist(pl) },
                    ) {
                        Box(
                            modifier = Modifier
                                .size(cardSize)
                                .clip(RoundedCornerShape(16.dp))
                                .background(
                                    Brush.linearGradient(
                                        listOf(Color(0xFFFA2D48), Color(0xFFBF5AF2)),
                                    ),
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                Icons.Filled.PlayArrow,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(40.dp),
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(pl.title, color = Color.White, maxLines = 1)
                        Text(
                            pl.description,
                            color = TextSecondary,
                            maxLines = 2,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        }
        itemsIndexed(shelfTracks) { index, track ->
            TrackRow(
                track = track,
                index = index,
                isActive = track.id == currentTrackId,
                isPlaying = isPlaying,
                onClick = { onPlayTrack(track, shelfTracks) },
                onStartRadio = { onStartRadio(track) },
                isLiked = likedIds.contains(track.id),
                isDisliked = dislikedIds.contains(track.id),
                onToggleLike = { onToggleLike(track) },
                onToggleDislike = { onToggleDislike(track) },
            )
        }
        item { Spacer(Modifier.height(120.dp)) }
    }
}
