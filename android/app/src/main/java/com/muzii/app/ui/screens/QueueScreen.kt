package com.muzii.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Equalizer
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.ThumbDown
import androidx.compose.material.icons.filled.ThumbDownOffAlt
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.muzii.app.data.model.Track
import com.muzii.app.ui.components.ArtworkBox
import com.muzii.app.ui.theme.ApplePink
import com.muzii.app.ui.theme.SurfaceDark
import com.muzii.app.ui.theme.SurfaceElevated
import com.muzii.app.ui.theme.TextSecondary

/**
 * The queue, opened from Now Playing.
 *
 * This exists because there was no way to see what was coming after the
 * current song — the web has an Up Next panel and the phone had nothing.
 * A LazyColumn is used deliberately: the list can grow without bound as the
 * radio extends itself, so it must be virtualised and must scroll to the
 * current item on open.
 */
@Composable
fun QueueScreen(
    queue: List<Track>,
    index: Int,
    onJump: (Int) -> Unit,
    onClose: () -> Unit,
    likedIds: List<String> = emptyList(),
    dislikedIds: List<String> = emptyList(),
    onToggleLike: (Track) -> Unit = {},
    onToggleDislike: (Track) -> Unit = {},
) {
    val listState = rememberLazyListState()

    // Open scrolled to what is playing, not at the top of a long history.
    LaunchedEffect(index, queue.size) {
        if (index in queue.indices) listState.scrollToItem(index.coerceAtLeast(0))
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 20.dp, end = 8.dp, top = 16.dp, bottom = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    "Up Next",
                    color = Color.White,
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    "${queue.size} songs in the queue",
                    color = TextSecondary,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            IconButton(onClick = onClose) {
                Icon(Icons.Filled.Close, contentDescription = "Close queue", tint = TextSecondary)
            }
        }

        if (queue.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Nothing queued yet.", color = TextSecondary)
            }
            return@Column
        }

        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                start = 12.dp,
                end = 12.dp,
                top = 4.dp,
                bottom = 24.dp,
            ),
        ) {
            itemsIndexed(queue, key = { i, track -> "$i-${track.id}" }) { i, track ->
                val active = i == index
                val liked = likedIds.contains(track.id)
                val disliked = dislikedIds.contains(track.id)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 3.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (active) SurfaceElevated else Color.Transparent)
                        .clickable { onJump(i) }
                        .padding(horizontal = 8.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (active) {
                        Icon(
                            Icons.Filled.Equalizer,
                            contentDescription = "Now playing",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(18.dp),
                        )
                    } else {
                        Text(
                            "${i + 1}",
                            color = TextSecondary,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.width(18.dp),
                        )
                    }
                    Spacer(Modifier.width(8.dp))
                    ArtworkBox(track = track, size = 42.dp)
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            track.title,
                            color = when {
                                disliked -> TextSecondary
                                active -> MaterialTheme.colorScheme.primary
                                liked -> ApplePink
                                else -> Color.White
                            },
                            maxLines = 1,
                            textDecoration = if (disliked) TextDecoration.LineThrough else null,
                        )
                        Text(
                            listOfNotNull(track.artist, track.language?.uppercase())
                                .joinToString(" · "),
                            color = TextSecondary,
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 1,
                        )
                    }
                    IconButton(
                        onClick = { onToggleLike(track) },
                        modifier = Modifier.size(36.dp),
                    ) {
                        Icon(
                            if (liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                            contentDescription = if (liked) "Unlike" else "Like",
                            tint = if (liked) ApplePink else TextSecondary,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                    IconButton(
                        onClick = { onToggleDislike(track) },
                        modifier = Modifier.size(36.dp),
                    ) {
                        Icon(
                            if (disliked) Icons.Filled.ThumbDown else Icons.Filled.ThumbDownOffAlt,
                            contentDescription = "Not for me",
                            tint = if (disliked) Color(0xFF64D2FF) else TextSecondary,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
        }
    }
}
