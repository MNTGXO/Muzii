package com.muzii.app.data

import com.muzii.app.data.model.Playlist
import com.muzii.app.data.model.Track

/**
 * Bundled fallback catalog (mirrors worker/src/providers/demo.ts).
 * Used when the Cloudflare Worker is unreachable so the app always works.
 */
object DemoCatalog {

    private const val BASE = "https://www.soundhelix.com/examples/js/electronic"

    private fun t(
        n: Int,
        title: String,
        artist: String,
        album: String,
        durationSec: Long,
    ) = Track(
        id = "sh-$n",
        title = title,
        artist = artist,
        album = album,
        durationSec = durationSec,
        streamUrl = "$BASE/SoundHelix-Song-$n.mp3",
        artworkUrl = "https://picsum.photos/seed/muzii$n/600/600",
        gradientSeed = (n * 37) % 360,
    )

    val TRACKS: List<Track> = listOf(
        t(1, "Neon Skyline", "SoundHelix", "Midnight Drive", 372),
        t(2, "Golden Hour", "SoundHelix", "Summer Static", 345),
        t(3, "Electric Dreams", "SoundHelix", "Voltage", 401),
        t(4, "Ocean Breeze", "SoundHelix", "Coastal", 318),
        t(5, "City Lights", "SoundHelix", "Urban Pulse", 356),
        t(6, "Midnight Run", "SoundHelix", "After Dark", 389),
        t(7, "Solar Flare", "SoundHelix", "Orbit", 334),
        t(8, "Velvet Moon", "SoundHelix", "Lunar", 412),
        t(9, "Thunder Road", "SoundHelix", "Storm Chaser", 367),
        t(10, "Fire Starter", "SoundHelix", "Ignition", 298),
        t(11, "Crystal Waves", "SoundHelix", "Tidepool", 351),
        t(12, "Neon Rain", "SoundHelix", "Cyberpunk", 383),
        t(13, "Starlight Express", "SoundHelix", "Cosmos", 429),
        t(14, "Deep Focus", "SoundHelix", "Flow State", 402),
        t(15, "Echo Chamber", "SoundHelix", "Reverb", 336),
        t(16, "Final Countdown", "SoundHelix", "Last Lap", 364),
    )

    val PLAYLISTS: List<Playlist> = listOf(
        Playlist(
            id = "top-hits",
            title = "Top Hits",
            description = "The biggest tracks right now.",
            trackIds = listOf("sh-1", "sh-3", "sh-5", "sh-7", "sh-9"),
            gradient = "linear-gradient(135deg,#FA2D48,#FC3C44)",
        ),
        Playlist(
            id = "chill-vibes",
            title = "Chill Vibes",
            description = "Mellow tunes for slow evenings.",
            trackIds = listOf("sh-2", "sh-4", "sh-6", "sh-8"),
            gradient = "linear-gradient(135deg,#5E5CE6,#BF5AF2)",
        ),
        Playlist(
            id = "workout-energy",
            title = "Workout Energy",
            description = "High-octane fuel for your session.",
            trackIds = listOf("sh-10", "sh-11", "sh-12", "sh-13"),
            gradient = "linear-gradient(135deg,#FF9F0A,#FF375F)",
        ),
        Playlist(
            id = "focus-flow",
            title = "Focus Flow",
            description = "Deep concentration, zero distractions.",
            trackIds = listOf("sh-14", "sh-15", "sh-16"),
            gradient = "linear-gradient(135deg,#64D2FF,#30D158)",
        ),
    )
}
