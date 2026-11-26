package com.muzii.app.ui

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.printToString
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.muzii.app.data.model.Track
import com.muzii.app.playback.PlayerManager
import com.muzii.app.ui.theme.MuziiTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PlayerNavigationTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    private fun song(id: String, title: String) = Track(
        id = id, title = title, artist = "Test singer", album = "Test album",
        durationSec = 200, streamUrl = "https://example.com/audio", artworkUrl = "",
        gradientSeed = 10,
    )

    @Test fun queueAndPlayerReplaceSearchAndCloseInOrder() {
        val first = song("first", "First test song")
        val second = song("second", "Second test song")
        compose.runOnUiThread { PlayerManager.playQueue(listOf(first, second)) }
        compose.setContent {
            MuziiTheme {
                MuziiNav(
                    tracks = emptyList(), playlists = emptyList(), searchQuery = "",
                    searchResults = emptyList(), onQueryChange = {}, onboarded = true,
                )
            }
        }

        compose.onNodeWithText("Search").performClick()
        compose.onNodeWithText("Find something to play").assertIsDisplayed()
        compose.onNodeWithText(first.title).performClick() // mini player
        try {
            compose.onNodeWithContentDescription("Up next").assertIsDisplayed()
        } catch (error: AssertionError) {
            throw AssertionError("Player not visible: ${compose.onRoot().printToString()}", error)
        }
        compose.onNodeWithText("Find something to play").assertDoesNotExist()
        compose.onNodeWithText("Search").assertDoesNotExist()

        compose.onNodeWithContentDescription("Up next").performClick()
        compose.onNodeWithText("Up Next").assertIsDisplayed()
        compose.onNodeWithText("Find something to play").assertDoesNotExist()
        compose.onNodeWithContentDescription("Sleep timer").assertDoesNotExist()
        compose.onNodeWithText(second.title).performClick()
        compose.onNodeWithContentDescription("Close queue").performClick()
        compose.onNodeWithContentDescription("Up next").assertIsDisplayed()
        compose.onNodeWithText(second.title).assertIsDisplayed()
        compose.onNodeWithContentDescription("Close").performClick()
        compose.onNodeWithText("Find something to play").assertIsDisplayed()
    }
}
