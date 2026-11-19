package com.muzii.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.muzii.app.playback.PlayerManager
import com.muzii.app.ui.MuziiNav
import com.muzii.app.ui.theme.MuziiTheme
import com.muzii.app.ui.viewmodel.MuziiViewModel

class MainActivity : ComponentActivity() {

    private val viewModel: MuziiViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Connect to the background playback service (Media3 foreground service).
        PlayerManager.init(applicationContext)
        setContent {
            MuziiTheme {
                val tracks by viewModel.tracks.collectAsState()
                val playlists by viewModel.playlists.collectAsState()
                val searchQuery by viewModel.searchQuery.collectAsState()
                val searchResults by viewModel.searchResults.collectAsState()
                MuziiNav(
                    tracks = tracks,
                    playlists = playlists,
                    searchQuery = searchQuery,
                    searchResults = searchResults,
                    onQueryChange = viewModel::onQueryChange,
                )
            }
        }
    }
}
