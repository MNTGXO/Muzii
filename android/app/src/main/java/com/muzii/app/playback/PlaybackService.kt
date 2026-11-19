package com.muzii.app.playback

import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

/**
 * Background playback service (Media3).
 *
 * Runs ExoPlayer in a foreground service with a media notification, so
 * music keeps playing with the screen off / app backgrounded, with
 * lock-screen and headset controls. Declared with
 * foregroundServiceType="mediaPlayback" in the manifest.
 */
class PlaybackService : MediaSessionService() {

    private var mediaSession: MediaSession? = null
    private lateinit var player: ExoPlayer

    override fun onCreate() {
        super.onCreate()
        player = ExoPlayer.Builder(this).build()
        mediaSession = MediaSession.Builder(this, player).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? =
        mediaSession

    override fun onDestroy() {
        mediaSession?.release()
        player.release()
        super.onDestroy()
    }
}
