package com.muzii.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.ThumbDown
import androidx.compose.material.icons.filled.ThumbDownOffAlt
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.muzii.app.data.model.Track
import com.muzii.app.ui.components.ArtworkBox
import com.muzii.app.ui.theme.ApplePink
import com.muzii.app.ui.theme.TextSecondary

@Composable
fun NowPlayingScreen(
    track: Track,
    isPlaying: Boolean,
    positionMs: Long,
    durationMs: Long,
    onToggle: () -> Unit,
    onNext: () -> Unit,
    onPrev: () -> Unit,
    onSeek: (Long) -> Unit,
    onClose: () -> Unit,
    /** Opens the Up Next list (there was no way to see the queue before). */
    onOpenQueue: (() -> Unit)? = null,
    /**
     * Like / dislike for the track that is playing. Previously these existed
     * only in the queue, so the one screen where you are actually looking at
     * the song had no way to rate it. Mirrors the web player.
     */
    liked: Boolean = false,
    disliked: Boolean = false,
    onToggleLike: () -> Unit = {},
    onToggleDislike: () -> Unit = {},
    /** Milliseconds left on a countdown sleep timer; null when off. */
    sleepRemainingMs: Long? = null,
    /** True when the timer is "end of track" instead of a countdown. */
    sleepAtTrackEnd: Boolean = false,
    /** minutes > 0 = countdown, 0 = end of track, null = cancel. */
    onSetSleepTimer: (Int?) -> Unit = {},
) {
    var timerOpen by remember { mutableStateOf(false) }
    val hue = (track.gradientSeed % 360).toFloat()

    // Responsive artwork: shrink on short/landscape screens so the controls
    // never get pushed off the bottom.
    val config = LocalConfiguration.current
    val artSize = when {
        config.screenHeightDp < 560 -> 180.dp
        config.screenWidthDp >= 600 -> 320.dp
        else -> 280.dp
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Color.hsv(hue, 0.7f, 0.55f), Color.Black),
                ),
            )
            // Scrollable so nothing is ever clipped (small phones, landscape,
            // large font settings).
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onClose) {
                Icon(Icons.Filled.KeyboardArrowDown, contentDescription = "Close", tint = Color.White)
            }
            Text(
                "Ad-free • Background play on",
                color = Color.White.copy(alpha = 0.7f),
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.weight(1f),
                textAlign = TextAlign.Center,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                // Sleep timer toggle. A dot marks an armed timer so it is
                // visible without opening the panel.
                IconButton(onClick = { timerOpen = !timerOpen }) {
                    Icon(
                        Icons.Filled.Bedtime,
                        contentDescription = "Sleep timer",
                        tint = if (sleepRemainingMs != null || sleepAtTrackEnd) {
                            ApplePink
                        } else {
                            Color.White
                        },
                    )
                }
                if (onOpenQueue != null) {
                    IconButton(onClick = onOpenQueue) {
                        Icon(
                            Icons.AutoMirrored.Filled.QueueMusic,
                            contentDescription = "Up next",
                            tint = Color.White,
                        )
                    }
                } else {
                    // Keep the title centred when there is no queue button.
                    Spacer(Modifier.width(48.dp))
                }
            }
        }
        Spacer(Modifier.height(24.dp))
        ArtworkBox(track = track, size = artSize)
        Spacer(Modifier.height(32.dp))
        // Heart sits beside the title, Apple Music style. The title takes the
        // remaining width so a long name can never squeeze the button off.
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            Text(
                track.title,
                style = MaterialTheme.typography.headlineSmall,
                color = Color.White,
                maxLines = 1,
                modifier = Modifier.weight(1f, fill = false),
                textAlign = TextAlign.End,
            )
            IconButton(onClick = onToggleLike, modifier = Modifier.size(48.dp)) {
                Icon(
                    if (liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    contentDescription = if (liked) "Unlike" else "Like",
                    tint = if (liked) ApplePink else Color.White.copy(alpha = 0.75f),
                )
            }
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("${track.artist} — ${track.album}", color = TextSecondary, maxLines = 1,
                modifier = Modifier.weight(1f, fill = false))
            IconButton(onClick = onToggleDislike, modifier = Modifier.size(40.dp)) {
                Icon(
                    if (disliked) Icons.Filled.ThumbDown else Icons.Filled.ThumbDownOffAlt,
                    contentDescription = if (disliked) "Stop disliking" else "Dislike",
                    tint = if (disliked) Color(0xFF64D2FF) else Color.White.copy(alpha = 0.6f),
                    modifier = Modifier.size(18.dp),
                )
            }
        }
        Spacer(Modifier.height(24.dp))
        Slider(
            value = positionMs.toFloat(),
            onValueChange = { onSeek(it.toLong()) },
            valueRange = 0f..(durationMs.coerceAtLeast(1L).toFloat()),
            modifier = Modifier.fillMaxWidth(),
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(formatMs(positionMs), color = TextSecondary, style = MaterialTheme.typography.bodySmall)
            Text(formatMs(durationMs), color = TextSecondary, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.height(16.dp))
        Row(
            horizontalArrangement = Arrangement.SpaceEvenly,
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onPrev, modifier = Modifier.size(56.dp)) {
                Icon(
                    Icons.Filled.SkipPrevious,
                    contentDescription = "Previous",
                    tint = Color.White,
                    modifier = Modifier.size(36.dp),
                )
            }
            IconButton(
                onClick = onToggle,
                modifier = Modifier
                    .size(72.dp)
                    .clip(RoundedCornerShape(36.dp))
                    .background(Color.White),
            ) {
                Icon(
                    if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                    contentDescription = "Play/Pause",
                    tint = Color.Black,
                    modifier = Modifier.size(40.dp),
                )
            }
            IconButton(onClick = onNext, modifier = Modifier.size(56.dp)) {
                Icon(
                    Icons.Filled.SkipNext,
                    contentDescription = "Next",
                    tint = Color.White,
                    modifier = Modifier.size(36.dp),
                )
            }
        }

        if (timerOpen) {
            Spacer(Modifier.height(20.dp))
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(18.dp))
                    .background(Color.White.copy(alpha = 0.1f))
                    .padding(16.dp),
            ) {
                Text(
                    "Sleep timer",
                    color = Color.White,
                    style = MaterialTheme.typography.titleSmall,
                )
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(15, 30, 45, 60).forEach { min ->
                        TimerChip(
                            label = "$min min",
                            active = sleepRemainingMs != null &&
                                sleepRemainingMs > (min * 60_000L) - 60_000L,
                            onClick = {
                                onSetSleepTimer(min)
                                timerOpen = false
                            },
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TimerChip(
                        label = "End of track",
                        active = sleepAtTrackEnd,
                        onClick = {
                            // The nicest option at night: finish this song.
                            onSetSleepTimer(0)
                            timerOpen = false
                        },
                    )
                    TimerChip(
                        label = "Off",
                        active = sleepRemainingMs == null && !sleepAtTrackEnd,
                        onClick = {
                            onSetSleepTimer(null)
                            timerOpen = false
                        },
                    )
                }
                Spacer(Modifier.height(10.dp))
                Text(
                    when {
                        sleepAtTrackEnd ->
                            "Stops when this song ends. The notification stays, so you can resume from it."
                        sleepRemainingMs != null ->
                            "Pausing in ${formatMs(sleepRemainingMs)}. The notification stays, so you can resume from it."
                        else ->
                            "Music pauses when the timer ends — the notification stays alive so you can resume."
                    },
                    color = Color.White.copy(alpha = 0.6f),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

/** Small pill button used by the sleep-timer panel. */
@Composable
private fun TimerChip(label: String, active: Boolean, onClick: () -> Unit) {
    Text(
        label,
        color = if (active) Color.White else Color.White.copy(alpha = 0.9f),
        style = MaterialTheme.typography.bodySmall,
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(if (active) ApplePink else Color.White.copy(alpha = 0.14f))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 9.dp),
    )
}

private fun formatMs(ms: Long): String {
    val totalSec = (ms / 1000).coerceAtLeast(0)
    return "%d:%02d".format(totalSec / 60, totalSec % 60)
}
