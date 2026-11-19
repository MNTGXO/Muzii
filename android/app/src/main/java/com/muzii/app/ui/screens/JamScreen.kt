package com.muzii.app.ui.screens

import com.muzii.app.data.model.toJamMap
import androidx.compose.material3.OutlinedButton
import androidx.compose.runtime.collectAsState
import androidx.compose.foundation.background
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import com.muzii.app.data.api.JamApiFactory
import com.muzii.app.data.model.JamState
import com.muzii.app.playback.PlayerManager
import com.muzii.app.ui.components.ArtworkBox
import com.muzii.app.ui.theme.SurfaceElevated
import com.muzii.app.ui.theme.TextSecondary
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Muzii Jam on Android — the same shared-listening rooms as the web app.
 *
 * Android joins as a guest: it follows the room's queue and can add songs.
 * Hosting stays on web (a phone that hosts would stop the party the moment
 * the app is swiped away), so this screen is join-and-listen.
 */
@Composable
fun JamScreen() {
    val api = remember { JamApiFactory.create() }
    val scope = rememberCoroutineScope()

    var name by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var token by remember { mutableStateOf<String?>(null) }
    var state by remember { mutableStateOf<JamState?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    /** True when THIS device created the room and is therefore the speaker. */
    var hosting by remember { mutableStateOf(false) }

    val queue by PlayerManager.queue.collectAsState()
    val currentIndex by PlayerManager.currentIndex.collectAsState()
    val positionMs by PlayerManager.positionMs.collectAsState()
    val isPlaying by PlayerManager.isPlaying.collectAsState()

    /*
     * Host mirroring.
     *
     * The room does not stream audio: the host's device is the speaker and
     * reports what it is playing, and guests follow. Without this loop a phone
     * that hosted a jam would leave everyone else frozen on the first song.
     * A signature guard means we only POST when something actually changed,
     * plus a slow heartbeat so a seek or a paused host still converges.
     */
    LaunchedEffect(hosting, token) {
        if (!hosting) return@LaunchedEffect
        val jwt = token ?: return@LaunchedEffect
        var lastSignature = ""
        var tick = 0
        while (true) {
            val signature = "${queue.joinToString(",") { it.id }}|$currentIndex"
            if (signature != lastSignature || tick % 8 == 0) {
                runCatching {
                    api.sync(
                        code = code,
                        body = mapOf(
                            "token" to jwt,
                            "queue" to queue.map { it.toJamMap() },
                            "index" to currentIndex,
                            "positionMs" to positionMs,
                            "playing" to isPlaying,
                        ),
                    )
                }.onSuccess { state = it }
                lastSignature = signature
            }
            tick++
            delay(2500)
        }
    }

    // Poll the room while we're in it.
    LaunchedEffect(token) {
        val current = token ?: return@LaunchedEffect
        while (true) {
            runCatching { api.getJam(code, current) }.onSuccess { state = it }
            delay(4000)
        }
    }

    // Follow the room's playback.
    LaunchedEffect(state?.currentTrack?.id) {
        val track = state?.currentTrack ?: return@LaunchedEffect
        if (PlayerManager.current?.id != track.id) {
            val queue = state?.queue?.map { it.toTrack() } ?: return@LaunchedEffect
            PlayerManager.playQueue(queue, state?.index ?: 0)
        }
    }

    val room = state
    if (room != null) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(MaterialTheme.colorScheme.primary),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    "JAM LIVE",
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                )
                if (room.locked) {
                    Spacer(Modifier.width(8.dp))
                    Icon(
                        Icons.Filled.Lock,
                        contentDescription = null,
                        tint = TextSecondary,
                        modifier = Modifier.size(12.dp),
                    )
                }
            }
            Text(
                "${room.hostName}'s Jam",
                style = MaterialTheme.typography.headlineMedium,
                color = Color.White,
            )
            Text(
                "${room.members.size} listening · ${room.queue.size} songs",
                color = TextSecondary,
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(Modifier.height(16.dp))

            room.currentTrack?.let { track ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(SurfaceElevated)
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    ArtworkBox(track = track.toTrack(), size = 52.dp)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(track.title, color = Color.White, maxLines = 1)
                        Text(
                            track.artist,
                            color = TextSecondary,
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 1,
                        )
                    }
                    Button(
                        onClick = {
                            scope.launch {
                                // Apply the room's new state; the poll would
                                // otherwise flash the old track back.
                                runCatching {
                                    api.skip(code, mapOf("token" to (token ?: "")))
                                }.onSuccess { state = it }
                            }
                        },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color.White,
                            contentColor = Color.Black,
                        ),
                    ) {
                        Icon(Icons.Filled.SkipNext, contentDescription = "Skip")
                    }
                }
            }

            Spacer(Modifier.height(20.dp))
            Text("Queue", style = MaterialTheme.typography.titleMedium, color = Color.White)
            Spacer(Modifier.height(8.dp))
            room.queue.forEachIndexed { index, track ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "${index + 1}",
                        color = if (index == room.index) MaterialTheme.colorScheme.primary else TextSecondary,
                        modifier = Modifier.width(24.dp),
                    )
                    ArtworkBox(track = track.toTrack(), size = 40.dp)
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            track.title,
                            color = if (index == room.index) MaterialTheme.colorScheme.primary else Color.White,
                            maxLines = 1,
                        )
                        Text(
                            track.artist,
                            color = TextSecondary,
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 1,
                        )
                    }
                }
            }
            if (room.queue.isEmpty()) {
                Text("Queue is empty — add songs from the web app.", color = TextSecondary)
            }
        }
        return
    }

    // ---------- Join form ----------
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Muzii Jam", style = MaterialTheme.typography.headlineMedium, color = Color.White)
        Text(
            "Listen together — everyone adds songs, all devices stay in sync.",
            color = TextSecondary,
            style = MaterialTheme.typography.bodySmall,
        )
        Spacer(Modifier.height(20.dp))
        OutlinedTextField(
            value = code,
            onValueChange = { code = it.uppercase().take(5) },
            label = { Text("Jam code") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
            modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color.White,
                unfocusedTextColor = Color.White,
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = TextSecondary,
            ),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = name,
            onValueChange = { name = it.take(24) },
            label = { Text("Your name") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Color.White,
                unfocusedTextColor = Color.White,
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = TextSecondary,
            ),
        )
        Spacer(Modifier.height(16.dp))
        Button(
            onClick = {
                busy = true
                error = null
                scope.launch {
                    runCatching {
                        api.join(code, mapOf("name" to name.ifBlank { "Guest" }))
                    }.onSuccess { response ->
                        token = response.token
                        state = response.state
                    }.onFailure {
                        error = "Couldn't join — check the code and your connection."
                    }
                    busy = false
                }
            },
            enabled = code.length >= 4 && !busy,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (busy) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    color = Color.White,
                    strokeWidth = 2.dp,
                )
            } else {
                Icon(Icons.Filled.Groups, contentDescription = null)
            }
            Spacer(Modifier.width(8.dp))
            Text("Join jam")
        }
        error?.let {
            Spacer(Modifier.height(10.dp))
            Text(it, color = Color(0xFFFF9F0A), style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.height(20.dp))
        /*
         * Hosting from the phone.
         *
         * This screen used to say "host on the web". That was a real gap: the
         * host is by definition the device playing the audio, so telling
         * someone holding a phone to go find a laptop was backwards. The room
         * is seeded with the live queue so guests join mid-song.
         */
        OutlinedButton(
            onClick = {
                busy = true
                error = null
                scope.launch {
                    runCatching {
                        api.host(
                            mapOf(
                                "name" to name.ifBlank { "Host" },
                                "queue" to queue.map { it.toJamMap() },
                                "index" to currentIndex,
                                "positionMs" to positionMs,
                            ),
                        )
                    }.onSuccess { response ->
                        token = response.hostToken
                        code = response.code
                        state = response.state
                        hosting = true
                    }.onFailure {
                        error = if (queue.isEmpty()) {
                            "Play something first, then host a jam from it."
                        } else {
                            "Couldn't start the jam — check your connection."
                        }
                    }
                    busy = false
                }
            },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Icon(Icons.Filled.Groups, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text(if (queue.isEmpty()) "Start a jam (play a song first)" else "Host this queue")
        }
        Spacer(Modifier.height(10.dp))
        Text(
            "Hosting means this device is the speaker: everyone else hears what you hear, in sync.",
            color = TextSecondary,
            style = MaterialTheme.typography.bodySmall,
        )
    }
}
