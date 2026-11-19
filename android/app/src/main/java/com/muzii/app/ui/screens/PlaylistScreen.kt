package com.muzii.app.ui.screens

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
            color = Color.Gray,
            modifier = Modifier.padding(horizontal = 16.dp),
        )
        Button(
            onClick = { if (tracks.isNotEmpty()) onPlayTrack(tracks.first(), tracks) },
            modifier = Modifier.padding(16.dp),
        ) {
            Icon(Icons.Filled.PlayArrow, contentDescription = null)
            Spacer(Modifier.width(6.dp))
            Text("Play all")
        }
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            itemsIndexed(tracks) { index, track ->
                TrackRow(
                    track = track,
                    index = index,
                    isActive = track.id == currentTrackId,
                    isPlaying = isPlaying,
                ) {
                    onPlayTrack(track, tracks)
                }
            }
            item { Spacer(Modifier.height(120.dp)) }
        }
    }
}
