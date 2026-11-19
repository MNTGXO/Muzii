package com.muzii.app.playback

import android.app.PendingIntent
import android.content.Intent
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.muzii.app.MainActivity

/**
 * Background playback service (Media3).
 *
 * Runs ExoPlayer in a foreground service with a media notification, so
 * music keeps playing with the screen off / app backgrounded, with
 * lock-screen and headset controls. Declared with
 * foregroundServiceType="mediaPlayback" in the manifest.
 */
@UnstableApi
class PlaybackService : MediaSessionService() {

    private var mediaSession: MediaSession? = null
    private lateinit var player: ExoPlayer

    override fun onCreate() {
        super.onCreate()
        player = ExoPlayer.Builder(this)
            // Without an audio attributes/usage set, the player can be treated
            // as a generic stream: it may not take audio focus properly and
            // ducks/interruptions behave unpredictably on some OEM builds.
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .setUsage(C.USAGE_MEDIA)
                    .build(),
                /* handleAudioFocus = */ true,
            )
            .setHandleAudioBecomingNoisy(true) // pause on headphone unplug
            .build()

        mediaSession = MediaSession.Builder(this, player)
            // Tapping the media notification or the lock-screen artwork must
            // reopen Muzii. Without this the notification is inert: the tap
            // does nothing, which reads as a frozen app.
            .setSessionActivity(
                PendingIntent.getActivity(
                    this,
                    0,
                    Intent(this, MainActivity::class.java)
                        .setAction(Intent.ACTION_MAIN)
                        .addCategory(Intent.CATEGORY_LAUNCHER)
                        .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                ),
            )
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? =
        mediaSession

    override fun onDestroy() {
        mediaSession?.release()
        player.release()
        mediaSession = null
        super.onDestroy()
    }
}
