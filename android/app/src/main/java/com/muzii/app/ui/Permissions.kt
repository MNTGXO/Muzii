package com.muzii.app.ui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat

/**
 * Ask for POST_NOTIFICATIONS, once, at startup.
 *
 * The manifest declared this permission but nothing ever requested it. Since
 * targetSdk is 34, Android 13+ treats it as a runtime permission that is
 * DENIED BY DEFAULT — so the media notification never appeared, which meant no
 * lock-screen controls and no headset play/pause, and made background playback
 * far likelier to be killed. Nothing in the UI explained the silence.
 *
 * Requesting on launch (rather than on first play) is deliberate: the prompt
 * arrives on an empty screen instead of interrupting the moment music starts.
 * Denial is harmless — playback still works, just without the notification —
 * so there is nothing to nag about afterwards.
 */
@Composable
fun RequestNotificationPermission() {
    val context = LocalContext.current
    // The launcher is registered unconditionally: `remember*` calls must run on
    // every composition, so the SDK check lives inside the effect rather than
    // in an early return above this line.
    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { /* Granted or not — playback is unaffected either way. */ }

    LaunchedEffect(Unit) {
        // Pre-Android 13 notifications need no runtime grant.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return@LaunchedEffect
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
        // Only prompt once per install; asking every launch is hostile, and
        // Android itself stops showing the dialog after two denials.
        if (!granted && !askedBefore(context)) {
            markAsked(context)
            launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}

private const val PREFS = "muzii-permissions"
private const val KEY_NOTIF_ASKED = "notification_asked"

private fun askedBefore(context: Context): Boolean =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .getBoolean(KEY_NOTIF_ASKED, false)

private fun markAsked(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().putBoolean(KEY_NOTIF_ASKED, true).apply()
}
