package com.muzii.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val MuziiColorScheme = darkColorScheme(
    primary = AppleRed,
    onPrimary = TextPrimary,
    background = BackgroundBlack,
    surface = SurfaceDark,
    onBackground = TextPrimary,
    onSurface = TextPrimary,
)

@Composable
fun MuziiTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = MuziiColorScheme, content = content)
}
