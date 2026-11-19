package com.muzii.app.ui.screens

import com.muzii.app.ui.theme.TextSecondary
import androidx.compose.material3.OutlinedButton
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.muzii.app.data.model.Playlist
import com.muzii.app.data.model.Track
import com.muzii.app.ui.components.TrackRow

@Composable
fun PlaylistScreen(
    playlist: Playlist,
    tracks: List<Track>,
    currentTrackId: String?,
    isPlaying: Boolean,
    onBack: () -> Unit,
    onPlayTrack: (Track, List<Track>) -> Unit,
    onStartRadio: (Track) -> Unit = {},
    likedIds: List<String> = emptyList(),
    dislikedIds: List<String> = emptyList(),
    onToggleLike: (Track) -> Unit = {},
    onToggleDislike: (Track) -> Unit = {},
    /** Shuffle-play this playlist. The web has had this; the phone did not. */
    onShufflePlay: (() -> Unit)? = null,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = "Back", tint = Color.White)
            }
            Text(
                playlist.title,
                style = MaterialTheme.typography.headlineSmall,
                color = Color.White,
            )
        }
        Text(
            playlist.description,
            // Color.Gray here and TextSecondary everywhere else: two slightly
            // different greys in the same app read as a mistake.
            color = TextSecondary,
            modifier = Modifier.padding(horizontal = 16.dp),
            style = MaterialTheme.typography.bodySmall,
        )
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Button(onClick = { if (tracks.isNotEmpty()) onPlayTrack(tracks.first(), tracks) }) {
                Icon(Icons.Filled.PlayArrow, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("Play all")
            }
            if (onShufflePlay != null) {
                Spacer(Modifier.width(10.dp))
                OutlinedButton(
                    onClick = { if (tracks.isNotEmpty()) onShufflePlay() },
                ) {
                    Icon(Icons.Filled.Shuffle, contentDescription = null)
                    Spacer(Modifier.width(6.dp))
                    Text("Shuffle")
                }
            }
        }
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            itemsIndexed(tracks) { index, track ->
                TrackRow(
                    track = track,
                    index = index,
                    isActive = track.id == currentTrackId,
                    isPlaying = isPlaying,
                    onClick = { onPlayTrack(track, tracks) },
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
}
