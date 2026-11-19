package com.muzii.app.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.graphicsLayer

/**
 * Shared, deliberately restrained motion.
 *
 * Everything here is 1–2% scale or a short cross-fade. Apple Music's motion is
 * almost subliminal: you notice the app feels responsive, not that things are
 * flying around. No bounces, no long durations, nothing that delays input.
 */

/**
 * Press feedback: a slight scale-down while a finger is held.
 *
 * 0.97 on cards, 0.985 on full-width rows (a list row shrinking as much as a
 * card looks wrong). Returns a Modifier so call sites stay one-liners.
 *
 * Note: pair this with `clickable(indication = null)` at the call site,
 * otherwise the ripple fights the scale and both read as lag.
 */
fun Modifier.pressScale(
    interactionSource: MutableInteractionSource,
    pressed: Float = 0.97f,
): Modifier = composed {
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isPressed) pressed else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioNoBouncy,
            stiffness = Spring.StiffnessMediumLow,
        ),
        label = "pressScale",
    )
    graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}

/**
 * Fade-and-settle entrance for a screen's content, so data arriving after a
 * network call doesn't snap into place.
 *
 * 180ms fade with a 2% rise — short enough that it never feels like waiting.
 */
@Composable
fun appearAlpha(): Float = animateFloatAsState(
    targetValue = 1f,
    animationSpec = tween(180, easing = FastOutSlowInEasing),
    label = "appear",
).value

/** Convenience: fade + slight rise, applied as a single modifier. */
@Composable
fun Modifier.appear(): Modifier {
    val progress = appearAlpha()
    return this
        .alpha(progress)
        .graphicsLayer {
            translationY = (1f - progress) * 12f
        }
}
