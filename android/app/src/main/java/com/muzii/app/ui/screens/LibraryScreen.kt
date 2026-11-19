package com.muzii.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.muzii.app.data.model.Playlist
import com.muzii.app.data.model.Track
import com.muzii.app.ui.components.pressScale
import com.muzii.app.ui.theme.ApplePink
import com.muzii.app.ui.theme.AccentBlue
import com.muzii.app.ui.theme.SurfaceDark
import com.muzii.app.ui.theme.TextSecondary

/**
 * Library.
 *
 * This screen used to be a bare grid of playlists. Two of the most obvious
 * things to want were missing: the songs you had liked, and what you had
 * played. Liking a song wrote it to storage and then gave you no way to reach
 * it again — the heart was effectively a one-way action.
 */
@Composable
fun LibraryScreen(
    playlists: List<Playlist>,
    onOpenPlaylist: (Playlist) -> Unit,
    likedTracks: List<Track> = emptyList(),
    recentTracks: List<Track> = emptyList(),
    onPlayLiked: () -> Unit = {},
    onPlayRecent: () -> Unit = {},
    currentTrackId: String? = null,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 28.dp),
    ) {
        item {
            Text(
                "Library",
                style = MaterialTheme.typography.headlineMedium,
                color = Color.White,
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 12.dp),
            )
        }

        // ---- smart collections -------------------------------------------
        // Two generated shelves so likes and history are actually reachable.
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                SmartCard(
                    modifier = Modifier.weight(1f),
                    title = "Liked Songs",
                    subtitle = if (likedTracks.isEmpty()) {
                        "Nothing yet"
                    } else {
                        "${likedTracks.size} ${if (likedTracks.size == 1) "song" else "songs"}"
                    },
                    colors = listOf(ApplePink, Color(0xFFBF5AF2)),
                    icon = { Icon(Icons.Filled.Favorite, null, tint = Color.White, modifier = Modifier.size(26.dp)) },
                    enabled = likedTracks.isNotEmpty(),
                    onClick = onPlayLiked,
                )
                SmartCard(
                    modifier = Modifier.weight(1f),
                    title = "Recently played",
                    subtitle = if (recentTracks.isEmpty()) {
                        "Nothing yet"
                    } else {
                        "${recentTracks.size} ${if (recentTracks.size == 1) "song" else "songs"}"
                    },
                    colors = listOf(AccentBlue, Color(0xFF5E5CE6)),
                    icon = { Icon(Icons.Filled.History, null, tint = Color.White, modifier = Modifier.size(26.dp)) },
                    enabled = recentTracks.isNotEmpty(),
                    onClick = onPlayRecent,
                )
            }
        }

        // ---- playlists ----------------------------------------------------
        if (playlists.isNotEmpty()) {
            item {
                Text(
                    "Playlists",
                    style = MaterialTheme.typography.titleLarge,
                    color = Color.White,
                    modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 24.dp, bottom = 12.dp),
                )
            }
            items(playlists) { pl ->
                PlaylistRow(playlist = pl, onClick = { onOpenPlaylist(pl) })
            }
        }
    }
}

@Composable
private fun SmartCard(
    modifier: Modifier = Modifier,
    title: String,
    subtitle: String,
    colors: List<Color>,
    icon: @Composable () -> Unit,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    Column(
        modifier = modifier
            .pressScale(interaction)
            .clip(RoundedCornerShape(16.dp))
            .background(Brush.linearGradient(colors))
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                onClick = onClick,
            )
            .padding(14.dp),
    ) {
        icon()
        Spacer(Modifier.height(26.dp))
        Text(
            title,
            color = Color.White,
            style = MaterialTheme.typography.titleMedium,
            maxLines = 1,
        )
        Text(
            subtitle,
            color = Color.White.copy(alpha = 0.75f),
            style = MaterialTheme.typography.bodySmall,
            maxLines = 1,
        )
    }
}

/**
 * A wide playlist row instead of a square tile: the title and song count fit
 * on one line, so scanning a long list does not require reading a grid.
 */
@Composable
private fun PlaylistRow(playlist: Playlist, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 5.dp)
            .pressScale(interaction, pressed = 0.985f)
            .clip(RoundedCornerShape(14.dp))
            .background(SurfaceDark)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(Brush.linearGradient(parseGradient(playlist.gradient))),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.PlayArrow,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.9f),
                modifier = Modifier.size(24.dp),
            )
        }
        Spacer(Modifier.size(12.dp))
        Column(Modifier.weight(1f)) {
            Text(playlist.title, color = Color.White, maxLines = 1)
            Text(
                "${playlist.tracks?.size ?: playlist.trackIds.size} songs",
                color = TextSecondary,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
            )
        }
    }
}

/**
 * The Worker sends `linear-gradient(135deg,#FA2D48,#FC3C44)`. Parsing it here
 * keeps each playlist's real colours instead of the one hardcoded purple pair
 * every card used to share.
 */
private fun parseGradient(css: String): List<Color> {
    val hexes = Regex("#([0-9a-fA-F]{6})").findAll(css).map { it.groupValues[1] }.toList()
    val parsed = hexes.mapNotNull { hex ->
        runCatching { Color(android.graphics.Color.parseColor("#$hex")) }.getOrNull()
    }
    return if (parsed.size >= 2) parsed.take(2) else listOf(ApplePink, Color(0xFFBF5AF2))
}
