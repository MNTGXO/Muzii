package com.muzii.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Podcasts
import androidx.compose.material.icons.filled.ThumbDown
import androidx.compose.material.icons.filled.ThumbDownOffAlt
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.muzii.app.data.model.Track
import com.muzii.app.ui.theme.ApplePink
import com.muzii.app.ui.theme.TextSecondary

@Composable
fun TrackRow(
    track: Track,
    index: Int,
    isActive: Boolean,
    isPlaying: Boolean,
    onClick: () -> Unit,
    onStartRadio: (() -> Unit)? = null,
    /** Taste: liked songs pull their artist up every later station. */
    isLiked: Boolean = false,
    isDisliked: Boolean = false,
    onToggleLike: (() -> Unit)? = null,
    onToggleDislike: (() -> Unit)? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = (index + 1).toString(),
            color = if (isActive) MaterialTheme.colorScheme.primary else TextSecondary,
            modifier = Modifier.width(28.dp),
        )
        ArtworkBox(track = track, size = 48.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                text = track.title,
                color = when {
                    isDisliked -> TextSecondary
                    isActive -> MaterialTheme.colorScheme.primary
                    isLiked -> ApplePink
                    else -> Color.White
                },
                maxLines = 1,
                textDecoration = if (isDisliked) {
                    androidx.compose.ui.text.style.TextDecoration.LineThrough
                } else {
                    null
                },
            )
            Text(
                text = listOfNotNull(track.artist, track.language?.uppercase()).joinToString(" · "),
                color = TextSecondary,
                maxLines = 1,
                style = MaterialTheme.typography.bodySmall,
            )
        }
        // Taste controls. Disliked rows stay tappable so the action can be
        // undone; the title is dimmed and struck through instead.
        if (onToggleLike != null) {
            IconButton(onClick = onToggleLike) {
                Icon(
                    if (isLiked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    contentDescription = if (isLiked) "Unlike" else "Like",
                    tint = if (isLiked) ApplePink else TextSecondary,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
        if (onToggleDislike != null) {
            IconButton(onClick = onToggleDislike) {
                Icon(
                    if (isDisliked) Icons.Filled.ThumbDown else Icons.Filled.ThumbDownOffAlt,
                    contentDescription = if (isDisliked) "Undo dislike" else "Not for me",
                    tint = if (isDisliked) Color(0xFF64D2FF) else TextSecondary,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
        // Song radio: same artist / same vibe, never repeats this song.
        if (onStartRadio != null) {
            IconButton(onClick = onStartRadio) {
                Icon(
                    Icons.Filled.Podcasts,
                    contentDescription = "Start radio",
                    tint = TextSecondary,
                )
            }
        }
        Icon(
            imageVector = if (isActive && isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
            contentDescription = null,
            tint = if (isActive) MaterialTheme.colorScheme.primary else TextSecondary,
        )
    }
}

@Composable
fun ArtworkBox(track: Track, size: Dp) {
    val hue = (track.gradientSeed % 360).toFloat()
    Box(
        modifier = Modifier
            .size(size)
            .clip(RoundedCornerShape(10.dp))
            .background(
                Brush.linearGradient(
                    listOf(
                        Color.hsv(hue, 0.8f, 0.95f),
                        Color.hsv((hue + 60) % 360, 0.8f, 0.7f),
                    ),
                ),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            Icons.Filled.MusicNote,
            contentDescription = null,
            tint = Color.White.copy(alpha = 0.9f),
        )
    }
}
