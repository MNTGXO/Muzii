package com.muzii.app.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.muzii.app.data.model.Track
import com.muzii.app.ui.components.TrackRow
import com.muzii.app.ui.theme.TextSecondary

@Composable
fun SearchScreen(
    query: String,
    results: List<Track>,
    currentTrackId: String?,
    isPlaying: Boolean,
    onQueryChange: (String) -> Unit,
    onStartRadio: (Track) -> Unit = {},
    likedIds: List<String> = emptyList(),
    dislikedIds: List<String> = emptyList(),
    onToggleLike: (Track) -> Unit = {},
    onToggleDislike: (Track) -> Unit = {},
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Text(
            "Search",
            style = MaterialTheme.typography.headlineMedium,
            color = Color.White,
            modifier = Modifier.padding(16.dp),
        )
        OutlinedTextField(
            value = query,
            onValueChange = onQueryChange,
            placeholder = { Text("Songs, artists, albums…", color = TextSecondary) },
            leadingIcon = {
                Icon(Icons.Filled.Search, contentDescription = null, tint = TextSecondary)
            },
            singleLine = true,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color.White,
                unfocusedTextColor = Color.White,
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = TextSecondary,
            ),
        )
        // An empty result set used to render as a blank panel with no
        // explanation, which reads as a broken screen rather than "no matches".
        if (results.isEmpty()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(32.dp),
                horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally,
                verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
            ) {
                Icon(
                    Icons.Filled.Search,
                    contentDescription = null,
                    tint = TextSecondary.copy(alpha = 0.5f),
                    modifier = Modifier.size(44.dp),
                )
                Spacer(Modifier.height(14.dp))
                Text(
                    if (query.isBlank()) "Find something to play" else "No matches for \"$query\"",
                    color = Color.White,
                    style = MaterialTheme.typography.titleMedium,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    if (query.isBlank()) {
                        "Search across every language. Your home feed stays \nscoped to the languages you picked."
                    } else {
                        "Try a shorter phrase, or the singer's name."
                    },
                    color = TextSecondary,
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
            }
            return@Column
        }
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            itemsIndexed(results) { index, track ->
                TrackRow(
                    track = track,
                    index = index,
                    isActive = track.id == currentTrackId,
                    isPlaying = isPlaying,
                    onClick = { onStartRadio(track) },
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
