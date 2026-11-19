package com.muzii.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Equalizer
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.automirrored.filled.PlaylistPlay
import androidx.compose.material.icons.filled.ThumbDown
import androidx.compose.material.icons.filled.ThumbDownOffAlt
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.muzii.app.data.model.Track
import com.muzii.app.ui.components.ArtworkBox
import com.muzii.app.ui.components.pressScale
import com.muzii.app.ui.theme.AccentBlue
import com.muzii.app.ui.theme.ApplePink
import com.muzii.app.ui.theme.SurfaceElevated
import com.muzii.app.ui.theme.TextSecondary

/**
 * The queue, opened from Now Playing or the mini bar.
 *
 * The web's Up Next panel lets you reorder and remove entries; the phone could
 * only look at the list and jump. Swipe an entry left to remove it, and tap
 * the arrows on the left to nudge an entry up or down.
 *
 * A LazyColumn is used deliberately: the list grows without bound as the radio
 * extends itself, so it must be virtualised and must open scrolled to the
 * current item rather than at the start of the history.
 */
@OptIn(ExperimentalMaterial3Api::class)
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
    /** Remove one entry by position. */
    onRemove: (Int) -> Unit = {},
    /** Reorder: `from` index to `to` index. */
    onMove: (Int, Int) -> Unit = { _, _ -> },
    /** Play this entry next, ahead of everything else. */
    onPlayNext: (Track) -> Unit = {},
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
                    if (queue.isEmpty()) {
                        "Nothing queued"
                    } else {
                        "${queue.size} songs · swipe left to remove"
                    },
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
                val dismissState = rememberSwipeToDismissBoxState(
                    confirmValueChange = { value ->
                        // Only the ending direction removes. A rightward swipe
                        // is a no-op so a stray gesture cannot delete by
                        // accident — deletion has to be deliberate.
                        if (value == SwipeToDismissBoxValue.EndToStart) {
                            onRemove(i)
                            true
                        } else {
                            false
                        }
                    },
                )
                SwipeToDismissBox(
                    state = dismissState,
                    enableDismissFromStartToEnd = false,
                    backgroundContent = {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .clip(RoundedCornerShape(12.dp))
                                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.22f))
                                .padding(horizontal = 20.dp),
                            contentAlignment = Alignment.CenterEnd,
                        ) {
                            Icon(
                                Icons.Filled.Delete,
                                contentDescription = "Remove",
                                tint = Color.White,
                            )
                        }
                    },
                ) {
                    QueueRow(
                        track = track,
                        position = i,
                        active = active,
                        liked = likedIds.contains(track.id),
                        disliked = dislikedIds.contains(track.id),
                        canMoveUp = i > 0,
                        canMoveDown = i < queue.lastIndex,
                        onClick = { onJump(i) },
                        onToggleLike = { onToggleLike(track) },
                        onToggleDislike = { onToggleDislike(track) },
                        onMoveUp = { onMove(i, i - 1) },
                        onMoveDown = { onMove(i, i + 1) },
                        onPlayNext = { onPlayNext(track) },
                    )
                }
            }
        }
    }
}

@Composable
private fun QueueRow(
    track: Track,
    position: Int,
    active: Boolean,
    liked: Boolean,
    disliked: Boolean,
    canMoveUp: Boolean,
    canMoveDown: Boolean,
    onClick: () -> Unit,
    onToggleLike: () -> Unit,
    onToggleDislike: () -> Unit,
    onMoveUp: () -> Unit,
    onMoveDown: () -> Unit,
    onPlayNext: () -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp)
            .pressScale(interaction, pressed = 0.99f)
            .clip(RoundedCornerShape(12.dp))
            .background(if (active) SurfaceElevated else Color.Transparent)
            .clickable(interactionSource = interaction, indication = null, onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Reorder controls. Two small arrows rather than a long-press drag:
        // a drag handle inside a swipe-to-dismiss row produces gestures the
        // user cannot predict, and these are unambiguous.
        Column(modifier = Modifier.width(20.dp)) {
            ReorderArrow(up = true, enabled = canMoveUp, onClick = onMoveUp)
            ReorderArrow(up = false, enabled = canMoveDown, onClick = onMoveDown)
        }
        Spacer(Modifier.width(6.dp))
        if (active) {
            Icon(
                Icons.Filled.Equalizer,
                contentDescription = "Now playing",
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(18.dp),
            )
        } else {
            Text(
                "${position + 1}",
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
                listOfNotNull(track.artist, track.language?.uppercase()).joinToString(" · "),
                color = TextSecondary,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
            )
        }
        IconButton(onClick = onPlayNext, modifier = Modifier.size(34.dp)) {
            Icon(
                Icons.AutoMirrored.Filled.PlaylistPlay,
                contentDescription = "Play next",
                tint = TextSecondary,
                modifier = Modifier.size(18.dp),
            )
        }
        IconButton(onClick = onToggleLike, modifier = Modifier.size(34.dp)) {
            Icon(
                if (liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                contentDescription = if (liked) "Unlike" else "Like",
                tint = if (liked) ApplePink else TextSecondary,
                modifier = Modifier.size(18.dp),
            )
        }
        IconButton(onClick = onToggleDislike, modifier = Modifier.size(34.dp)) {
            Icon(
                if (disliked) Icons.Filled.ThumbDown else Icons.Filled.ThumbDownOffAlt,
                contentDescription = "Not for me",
                tint = if (disliked) AccentBlue else TextSecondary,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

@Composable
private fun ReorderArrow(up: Boolean, enabled: Boolean, onClick: () -> Unit) {
    IconButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.size(16.dp),
    ) {
        Icon(
            if (up) Icons.Filled.KeyboardArrowUp else Icons.Filled.KeyboardArrowDown,
            contentDescription = if (up) "Move up" else "Move down",
            tint = if (enabled) TextSecondary else Color.Transparent,
            modifier = Modifier.size(14.dp),
        )
    }
}
