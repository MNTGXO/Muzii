package com.muzii.app.playback

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.muzii.app.data.model.Track
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * App-wide player facade. Owns the MediaController connected to
 * [PlaybackService] and exposes playback state as StateFlows for Compose.
 */
@UnstableApi
object PlayerManager {

    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var controller: MediaController? = null

    // Queue requested before the MediaController finished connecting.
    private var pendingQueue: List<Track>? = null
    private var pendingIndex: Int = 0

    private val _queue = MutableStateFlow<List<Track>>(emptyList())
    val queue: StateFlow<List<Track>> = _queue.asStateFlow()

    private val _currentIndex = MutableStateFlow(0)
    val currentIndex: StateFlow<Int> = _currentIndex.asStateFlow()

    private val _isPlaying = MutableStateFlow(false)
    val isPlaying: StateFlow<Boolean> = _isPlaying.asStateFlow()

    private val _positionMs = MutableStateFlow(0L)
    val positionMs: StateFlow<Long> = _positionMs.asStateFlow()

    private val _durationMs = MutableStateFlow(0L)
    val durationMs: StateFlow<Long> = _durationMs.asStateFlow()

    val current: Track? get() = _queue.value.getOrNull(_currentIndex.value)

    fun init(context: Context) {
        if (controllerFuture != null) return
        val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
        controllerFuture = MediaController.Builder(context, token).buildAsync()
        controllerFuture!!.addListener(
            {
                controller = controllerFuture!!.get()
                controller?.addListener(Listener)
                // Play anything the user queued before connecting.
                pendingQueue?.let { tracks ->
                    controller?.let { startPlayback(it, tracks, pendingIndex) }
                    pendingQueue = null
                }
            },
            ContextCompat.getMainExecutor(context),
        )
    }

    private val Listener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            _isPlaying.value = isPlaying
        }

        override fun onPlaybackStateChanged(state: Int) {
            if (state == Player.STATE_READY) {
                _durationMs.value = controller?.duration?.takeIf { it > 0 } ?: 0L
            }
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            _currentIndex.value = controller?.currentMediaItemIndex ?: 0
        }
    }

    fun playQueue(tracks: List<Track>, startIndex: Int = 0) {
        _queue.value = tracks
        _currentIndex.value = startIndex
        val c = controller
        if (c == null) {
            // Controller not connected yet — play once it is.
            pendingQueue = tracks
            pendingIndex = startIndex
            return
        }
        startPlayback(c, tracks, startIndex)
    }

    private fun startPlayback(c: MediaController, tracks: List<Track>, startIndex: Int) {
        val items = tracks.map { track ->
            MediaItem.Builder()
                .setUri(track.streamUrl)
                .setMediaId(track.id)
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle(track.title)
                        .setArtist(track.artist)
                        .setAlbumTitle(track.album)
                        .setArtworkUri(Uri.parse(track.artworkUrl))
                        .build(),
                )
                .build()
        }
        c.setMediaItems(items, startIndex, 0L)
        c.prepare()
        c.play()
    }

    fun toggle() {
        val c = controller ?: return
        if (c.isPlaying) c.pause() else c.play()
    }

    fun next() {
        controller?.seekToNextMediaItem()
    }

    fun prev() {
        controller?.seekToPreviousMediaItem()
    }

    fun seekTo(positionMs: Long) {
        controller?.seekTo(positionMs)
    }

    /** Call from a ticker (e.g. LaunchedEffect) to keep progress fresh. */
    fun tick() {
        _positionMs.value = controller?.currentPosition ?: 0L
        _durationMs.value = controller?.duration?.takeIf { it > 0 } ?: _durationMs.value
    }
}
