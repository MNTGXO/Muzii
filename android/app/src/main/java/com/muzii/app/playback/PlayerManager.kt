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
import com.muzii.app.data.taste.PlayLog
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
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

    /** Drives the sleep-timer countdown; cancelled when the timer is re-armed. */
    private var sleepJob: Job? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

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

    /** Sleep timer: null when off, else ms remaining (a 'track' timer = -1). */
    private val _sleepRemainingMs = MutableStateFlow<Long?>(null)
    val sleepRemainingMs: StateFlow<Long?> = _sleepRemainingMs.asStateFlow()
    /** Set when the timer is "end of track" rather than a countdown. */
    private val _sleepAtTrackEnd = MutableStateFlow(false)
    val sleepAtTrackEnd: StateFlow<Boolean> = _sleepAtTrackEnd.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    /**
     * Shuffle. The web player has had this all along; the APK had no way to
     * randomise a queue at all.
     *
     * Implemented by carrying ExoPlayer's own `shuffleModeEnabled` rather than
     * permuting our list, so "up next" order, next/previous and the queue
     * sheet all agree with what actually plays.
     */
    private val _shuffle = MutableStateFlow(false)
    val shuffle: StateFlow<Boolean> = _shuffle.asStateFlow()

    /** Repeat mode, mirroring the web player: off → all → one. */
    private val _repeatMode = MutableStateFlow(RepeatMode.OFF)
    val repeatMode: StateFlow<RepeatMode> = _repeatMode.asStateFlow()

    enum class RepeatMode { OFF, ALL, ONE }

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

    /**
     * True once a MediaController is connected. The UI uses this to explain
     * why nothing plays instead of silently doing nothing.
     */
    private val _ready = MutableStateFlow(false)
    val ready: StateFlow<Boolean> = _ready.asStateFlow()

    fun init(context: Context) {
        if (controllerFuture != null) return
        val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
        controllerFuture = MediaController.Builder(context, token).buildAsync()
        val future = controllerFuture ?: return
        future.addListener(
            {
                // get() throws if the service could not be bound (e.g. the
                // media session was destroyed while the app was in the
                // background, or playback was stopped by the system). That
                // exception is delivered on the main thread and would take
                // the whole app down, so it must be caught here and the
                // resource torn down for a later retry.
                val connected = runCatching { future.get() }.getOrNull()
                if (connected == null) {
                    runCatching { MediaController.releaseFuture(future) }
                    controllerFuture = null
                    controller = null
                    _ready.value = false
                    return@addListener
                }
                controller = connected
                connected.addListener(Listener)
                applyModes(connected)
                _ready.value = true
                // Play anything the user queued before connecting.
                val tracks = pendingQueue
                if (tracks != null) {
                    runCatching { startPlayback(connected, tracks, pendingIndex) }
                    pendingQueue = null
                }
            },
            ContextCompat.getMainExecutor(context),
        )
    }

    /**
     * Reconnect after the session died. Safe to call repeatedly; the UI calls
     * it when the user taps play and nothing is connected.
     */
    fun reconnect(context: Context) {
        if (controller != null) return
        context.applicationContext?.let(::init)
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
            // Log the track that just finished, before the index moves. The
            // guard inside logListen() ignores a skip that never really played,
            // so this is safe on both "ended" and manual "next".
            if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO ||
                reason == Player.MEDIA_ITEM_TRANSITION_REASON_SEEK
            ) {
                _queue.value.getOrNull(_currentIndex.value)?.let { logListen(it) }
            }
            // "End of track" sleep timer: stop on the boundary between songs,
            // never mid-line. Pausing keeps the notification alive.
            if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) {
                sleepTimerHitTrackEnd()
            }
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
        val seenKeys = HashSet<String>()
        val fresh = tracks.filter {
            !playedIds.contains(it.id) &&
                !playedKeys.contains(keyOf(it)) &&
                // Also dedupe within the batch itself (same song, two rows).
                seenKeys.add(keyOf(it))
        }
        if (fresh.isEmpty()) return

        _queue.value = _queue.value + fresh
        if (c == null) {
            pendingQueue = _queue.value
            return
        }
        runCatching {
            c.addMediaItems(fresh.map { toMediaItem(it) })
            applyModes(c)
            if (c.playbackState == Player.STATE_ENDED || c.playbackState == Player.STATE_IDLE) {
                c.prepare()
                c.play()
            }
        }
    }

    fun playQueue(tracks: List<Track>, startIndex: Int = 0, radio: Boolean = false) {
        if (tracks.isEmpty()) return
        // Collapse versions of one song before they reach the queue: catalogs
        // list "Minnum Minnamai", "... (Male)", "... (Female)" as separate
        // tracks, which filled the queue with the same song.
        val anchor = tracks.getOrNull(startIndex) ?: tracks.first()
        val seen = HashSet<String>()
        val unique = tracks.filter { seen.add(keyOf(it)) }
        val start = unique.indexOfFirst { it.id == anchor.id }.coerceAtLeast(0)

        _isRadio.value = radio
        exhaustRequested = false
        _queue.value = unique
        _currentIndex.value = start
        unique.getOrNull(start)?.let { markPlayed(it) }

        val c = controller
        if (c == null) {
            // Controller not connected yet — play once it is.
            pendingQueue = unique
            pendingIndex = start
            return
        }
        // The session can die while the app is backgrounded; a dead controller
        // must not crash the UI thread.
        runCatching { startPlayback(c, unique, start) }
    }

    /** Start a song radio: the seed plays, then the app fills the rest. */
    fun startRadio(seed: Track) {
        playQueue(listOf(seed), 0, radio = true)
        maybeExtend()
    }

    private fun startPlayback(c: MediaController, tracks: List<Track>, startIndex: Int) {
        c.setMediaItems(tracks.map { toMediaItem(it) }, startIndex, 0L)
        applyModes(c)
        c.prepare()
        c.play()
    }

    /**
     * Push shuffle/repeat onto the controller.
     *
     * Must be re-applied whenever the media items are replaced: setMediaItems
     * resets repeat mode, so without this a "repeat one" silently became
     * "repeat off" the next time a playlist started.
     */
    private fun applyModes(c: MediaController) {
        runCatching {
            c.shuffleModeEnabled = _shuffle.value
            c.repeatMode = when (_repeatMode.value) {
                RepeatMode.OFF -> Player.REPEAT_MODE_OFF
                RepeatMode.ALL -> Player.REPEAT_MODE_ALL
                RepeatMode.ONE -> Player.REPEAT_MODE_ONE
            }
        }
    }

    fun toggleShuffle() {
        val next = !_shuffle.value
        _shuffle.value = next
        controller?.let { applyModes(it) }
    }

    /** off → all → one → off, matching the web button's cycle. */
    fun cycleRepeat() {
        _repeatMode.value = when (_repeatMode.value) {
            RepeatMode.OFF -> RepeatMode.ALL
            RepeatMode.ALL -> RepeatMode.ONE
            RepeatMode.ONE -> RepeatMode.OFF
        }
        controller?.let { applyModes(it) }
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

    /**
     * Identity of a song for the no-repeat rule: the title alone.
     *
     * The same recording appears repeatedly with different singer credits and
     * the album name baked into the title ("Innale (K.J.Yesudas) (from
     * "Balettan")" vs "Innale (Chithra) (from "Balettan")"). Including the
     * artist let each variant into the queue. Mirrors normalizeKey() in
     * worker/src/radio.ts and trackKey() in web/src/player/queue.ts.
     */
    private fun keyOf(track: Track): String {
        val base = track.title
            .lowercase()
            .replace(Regex("\\([^)]*\\)|\\[[^\\]]*\\]"), " ")
            .replace(Regex("\\s-\\s.*$"), " ")
            .replace(Regex("[|/\\\\,]+"), " ")
            .replace(Regex("[^\\p{L}\\p{N}\\s]"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
        for (suffix in VARIANT_SUFFIXES) {
            if (!base.endsWith(" $suffix")) continue
            val stripped = base.dropLast(suffix.length + 1).trim()
            // Never reduce a title to nothing: "Male" is a real song title.
            if (stripped.length >= 3) return stripped
        }
        return base
    }

    /**
     * Trailing version words that don't make a song a different song.
     * Mirrors songKey() in worker/src/radio.ts and web/src/player/queue.ts.
     */
    private val VARIANT_SUFFIXES = listOf(
        "male", "female", "male version", "female version", "duet", "solo",
        "reprise", "remix", "remastered", "remaster", "unplugged", "acoustic",
        "live", "cover", "instrumental", "karaoke", "extended", "edit",
        "version", "from", "movie", "film", "full song", "lyrical", "video song",
    )

    private fun markPlayed(track: Track) {
        playedIds.add(track.id)
        playedKeys.add(keyOf(track))
    }

    /**
     * Count a *completed* listen for the home screen's "Recently played" and
     * "Your top songs" shelves. Deliberately separate from markPlayed(), which
     * fires on every track start for the no-repeat rule - counting that here
     * would let a skip inflate the play count.
     */
    private fun logListen(track: Track) {
        // A track skipped in the first few seconds is not a listen.
        val needed = when {
            track.durationSec <= 0L -> 15_000L
            else -> minOf(30_000L, maxOf(8_000L, track.durationSec * 1000L / 2))
        }
        if (_positionMs.value < needed) return
        PlayLog.record(track)
    }

    fun toggle() {
        val c = controller
        if (c == null) {
            // Session not connected (yet, or it was killed). Surface it so
            // the UI can retry instead of appearing dead.
            _error.value = "Player reconnecting…"
            return
        }
        runCatching { if (c.isPlaying) c.pause() else c.play() }
            .onFailure { _error.value = "Playback is not available right now" }
    }

    /**
     * Arm the sleep timer: [minutes] > 0 for a countdown, 0 for "end of track",
     * and null to cancel.
     *
     * The timer **pauses**; it never stops or releases the session. That is
     * what keeps the media notification alive so the listener can resume from
     * the notification bar at the spot they fell asleep at. Calling stop()
     * here would tear the session down and take the notification with it.
     */
    fun setSleepTimer(minutes: Int?) {
        sleepJob?.cancel()
        sleepJob = null
        if (minutes == null) {
            _sleepRemainingMs.value = null
            _sleepAtTrackEnd.value = false
            return
        }
        if (minutes <= 0) {
            // 0 means "when this track ends".
            _sleepRemainingMs.value = null
            _sleepAtTrackEnd.value = true
            return
        }
        _sleepAtTrackEnd.value = false
        val totalMs = minutes * 60_000L
        _sleepRemainingMs.value = totalMs
        sleepJob = scope.launch {
            val endsAt = System.currentTimeMillis() + totalMs
            while (true) {
                val left = endsAt - System.currentTimeMillis()
                if (left <= 0) break
                _sleepRemainingMs.value = left
                delay(500)
            }
            _sleepRemainingMs.value = null
            // Pause, not stop: the notification and session stay usable.
            runCatching { controller?.pause() }
        }
    }

    /** True when a track has just ended and an "end of track" timer fires. */
    private fun sleepTimerHitTrackEnd(): Boolean {
        if (!_sleepAtTrackEnd.value) return false
        _sleepAtTrackEnd.value = false
        _sleepRemainingMs.value = null
        runCatching { controller?.pause() }
        return true
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

    /**
     * Jump to a specific position in the queue (used by the Up Next list).
     * Clamped, because the queue can shrink while the list is on screen.
     */
    fun jumpTo(index: Int) {
        val c = controller
        val size = if (c != null) c.mediaItemCount else _queue.value.size
        if (size <= 0) return
        val safe = index.coerceIn(0, size - 1)
        _currentIndex.value = safe
        runCatching {
            c?.let {
                it.seekTo(safe, 0L)
                it.prepare()
                it.play()
            }
        }
    }

    fun seekTo(positionMs: Long) {
        runCatching { controller?.seekTo(positionMs) }
    }

    /**
     * Remove disliked songs from the pending part of the queue.
     *
     * The current item is never touched here — skipping away from a song you
     * just disliked is the ViewModel's job, because it has to happen after
     * the taste store has been updated.
     */
    fun dropDisliked(disliked: List<String>) {
        if (disliked.isEmpty()) return
        val blocked = disliked.toSet()
        val c = controller ?: return
        runCatching {
            for (i in c.mediaItemCount - 1 downTo 0) {
                if (i == c.currentMediaItemIndex) continue
                if (blocked.contains(c.getMediaItemAt(i).mediaId)) {
                    c.removeMediaItem(i)
                }
            }
        }
        _queue.value = _queue.value.filterIndexed { index, track ->
            index == _currentIndex.value || track.id !in blocked
        }
    }

    /** Call from a ticker (e.g. LaunchedEffect) to keep progress fresh. */
    fun tick() {
        runCatching {
            _positionMs.value = controller?.currentPosition ?: 0L
            _durationMs.value = controller?.duration?.takeIf { it > 0 } ?: _durationMs.value
        }
    }
}
