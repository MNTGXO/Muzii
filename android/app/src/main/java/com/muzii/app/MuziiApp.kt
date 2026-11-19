package com.muzii.app

import android.app.Application
import com.muzii.app.data.taste.PlayLog
import com.muzii.app.data.taste.TasteStore

/**
 * Application entry point.
 *
 * The taste store must be initialised before any ViewModel reads it (the
 * catalog is language-scoped, so it needs the chosen languages on the very
 * first request), and before the player connects to its media session.
 */
class MuziiApp : Application() {
    override fun onCreate() {
        super.onCreate()
        TasteStore.init(this)
        PlayLog.init(this)
    }
}
