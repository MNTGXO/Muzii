package com.muzii.app.playback

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
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
 *
 * Queue rules mirror the web app and the Worker's song radio:
 * - a track that has been played this session is never queued again
 *   (matched on id and on normalised title+artist, so re-uploads and
 *   "Remastered" versions can't sneak back in),
 * - when the queue runs out, [onQueueExhausted] asks the app for more songs
 *   in the same lane instead of stopping,
 * - a failing track is skipped automatically rather than stalling playback.
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

    private val _buffering = MutableStateFlow(false)
    val buffering: StateFlow<Boolean> = _buffering.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    /** "radio" once the queue started extending itself from a seed song. */
    private val _isRadio = MutableStateFlow(false)
    val isRadio: StateFlow<Boolean> = _isRadio.asStateFlow()

    /** Set by the ViewModel: fetch more songs when the queue runs dry. */
    var onQueueExhausted: ((seed: Track, played: List<String>) -> Unit)? = null
    private var exhaustRequested = false

    val current: Track? get() = _queue.value.getOrNull(_currentIndex.value)

    /** Ids played this session — the never-repeat guard. */
    private val playedIds = linkedSetOf<String>()
    private val playedKeys = linkedSetOf<String>()

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
            _buffering.value = state == Player.STATE_BUFFERING
            if (state == Player.STATE_READY) {
                _durationMs.value = controller?.duration?.takeIf { it > 0 } ?: 0L
                _error.value = null
            }
            if (state == Player.STATE_ENDED) {
                // The service stops at the end of the playlist; ask for more
                // songs in this lane so a radio keeps playing.
                maybeExtend()
            }
        }

        override fun onPlayerError(error: PlaybackException) {
            // A dead track shouldn't stop the session — move on.
            _error.value = "Skipping a track that could not be played"
            val c = controller ?: return
            if (c.hasNextMediaItem()) c.seekToNextMediaItem()
            else maybeExtend()
        }

        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            _currentIndex.value = controller?.currentMediaItemIndex ?: 0
            _error.value = null
            // Top up before we actually hit the end, so playback is seamless.
            val c = controller ?: return
            if (c.mediaItemCount - c.currentMediaItemIndex <= 2) maybeExtend()
        }
    }

    private fun maybeExtend() {
        if (exhaustRequested) return
        val seed = current ?: return
        val callback = onQueueExhausted ?: return
        exhaustRequested = true
        callback(seed, playedIds.toList().takeLast(50))
    }

    /** Called by the ViewModel when fresh radio tracks arrive. */
    fun appendToQueue(tracks: List<Track>) {
        exhaustRequested = false
        if (tracks.isEmpty()) return
        val c = controller
        val fresh = tracks.filter { !playedIds.contains(it.id) && !playedKeys.contains(keyOf(it)) }
        if (fresh.isEmpty()) return

        _queue.value = _queue.value + fresh
        if (c == null) {
            pendingQueue = _queue.value
            return
        }
        runCatching {
            c.addMediaItems(fresh.map { toMediaItem(it) })
            if (c.playbackState == Player.STATE_ENDED || c.playbackState == Player.STATE_IDLE) {
                c.prepare()
                c.play()
            }
        }
    }

    fun playQueue(tracks: List<Track>, startIndex: Int = 0, radio: Boolean = false) {
        if (tracks.isEmpty()) return
        _isRadio.value = radio
        exhaustRequested = false
        _queue.value = tracks
        _currentIndex.value = startIndex
        tracks.getOrNull(startIndex)?.let { markPlayed(it) }

        val c = controller
        if (c == null) {
            // Controller not connected yet — play once it is.
            pendingQueue = tracks
            pendingIndex = startIndex
            return
        }
        // The session can die while the app is backgrounded; a dead controller
        // must not crash the UI thread.
        runCatching { startPlayback(c, tracks, startIndex) }
    }

    /** Start a song radio: the seed plays, then the app fills the rest. */
    fun startRadio(seed: Track) {
        playQueue(listOf(seed), 0, radio = true)
        maybeExtend()
    }

    private fun startPlayback(c: MediaController, tracks: List<Track>, startIndex: Int) {
        c.setMediaItems(tracks.map { toMediaItem(it) }, startIndex, 0L)
        c.prepare()
        c.play()
    }

    private fun toMediaItem(track: Track): MediaItem =
        MediaItem.Builder()
            .setUri(track.streamUrl)
            .setMediaId(track.id)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(track.title)
                    .setArtist(track.artist)
                    .setAlbumTitle(track.album)
                    .setArtworkUri(track.artworkUrl.takeIf { it.isNotBlank() }?.let(Uri::parse))
                    .build(),
            )
            .build()

    private fun keyOf(track: Track): String {
        fun clean(value: String) = value
            .lowercase()
            .replace(Regex("\\([^)]*\\)|\\[[^\\]]*\\]"), " ")
            .replace(Regex("\\s-\\s.*$"), " ")
            .replace(Regex("[^\\p{L}\\p{N}\\s]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
        val artist = track.artist.split(",", "&", "feat.", "ft.").firstOrNull() ?: track.artist
        return "${clean(track.title)}|${clean(artist)}"
    }

    private fun markPlayed(track: Track) {
        playedIds.add(track.id)
        playedKeys.add(keyOf(track))
    }

    fun toggle() {
        val c = controller ?: return
        runCatching { if (c.isPlaying) c.pause() else c.play() }
    }

    fun next() {
        val c = controller ?: return
        runCatching {
            if (c.hasNextMediaItem()) c.seekToNextMediaItem() else maybeExtend()
        }
    }

    fun prev() {
        val c = controller ?: return
        runCatching {
            if (c.currentPosition > 3000) c.seekTo(0) else c.seekToPreviousMediaItem()
        }
    }

    fun seekTo(positionMs: Long) {
        runCatching { controller?.seekTo(positionMs) }
    }

    /** Call from a ticker (e.g. LaunchedEffect) to keep progress fresh. */
    fun tick() {
        runCatching {
            _positionMs.value = controller?.currentPosition ?: 0L
            _durationMs.value = controller?.duration?.takeIf { it > 0 } ?: _durationMs.value
        }
    }
}
