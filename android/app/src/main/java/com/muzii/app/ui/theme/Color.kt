package com.muzii.app.ui.theme

import androidx.compose.ui.graphics.Color

val AppleRed = Color(0xFFFA2D48)
val AppleRedLight = Color(0xFFFC3C44)
val ApplePink = Color(0xFFFF375F)
val BackgroundBlack = Color(0xFF000000)
val SurfaceDark = Color(0xFF1C1C1E)
val SurfaceElevated = Color(0xFF2C2C2E)
val TextPrimary = Color(0xFFFFFFFF)
val TextSecondary = Color(0xFF98989D)
val GradientStart = Color(0xFFFA2D48)
val GradientEnd = Color(0xFFBF5AF2)

/** Cool accents, matching what the web player already uses. */
val AccentBlue = Color(0xFF64D2FF)
val AccentGreen = Color(0xFF30D158)
/** Hairline separators. Pure grey reads as a seam; this reads as a shadow. */
val OutlineSoft = Color(0xFF3A3A3C)

/**
 * Deterministic gradient for a track, from its `gradientSeed`.
 *
 * Centralised because the same pair was recomputed inline in several
 * composables with slightly different parameters, so one song could have two
 * different colours depending on which screen you saw it on.
 */
fun gradientFor(seed: Int, soft: Boolean = false): List<Color> {
    val hue = ((seed % 360) + 360) % 360
    return if (soft) {
        listOf(
            Color.hsv(hue.toFloat(), 0.55f, 0.38f),
            Color.hsv(((hue + 48) % 360).toFloat(), 0.6f, 0.22f),
        )
    } else {
        listOf(
            Color.hsv(hue.toFloat(), 0.8f, 0.95f),
            Color.hsv(((hue + 60) % 360).toFloat(), 0.8f, 0.7f),
        )
    }
}
