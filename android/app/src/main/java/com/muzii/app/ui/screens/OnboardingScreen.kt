package com.muzii.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.muzii.app.ui.theme.AppleRed
import com.muzii.app.ui.theme.SurfaceElevated
import com.muzii.app.ui.theme.TextSecondary

/**
 * First-run language picker, matching the web onboarding.
 *
 * The home feed and every song radio are restricted to these languages, so
 * the app stops recommending Telugu songs to someone listening to Malayalam.
 * Search stays global — if you look something up you always get it.
 */
private data class LanguageOption(val id: String, val label: String, val native: String, val emoji: String)

private val LANGUAGES = listOf(
    LanguageOption("malayalam", "Malayalam", "മലയാളം", "🌴"),
    LanguageOption("tamil", "Tamil", "தமிழ்", "🎬"),
    LanguageOption("telugu", "Telugu", "తెలుగు", "🎥"),
    LanguageOption("hindi", "Hindi", "हिन्दी", "🪔"),
    LanguageOption("kannada", "Kannada", "ಕನ್ನಡ", "🎵"),
    LanguageOption("punjabi", "Punjabi", "ਪੰਜਾਬੀ", "🥁"),
    LanguageOption("english", "English", "English", "🌍"),
    LanguageOption("marathi", "Marathi", "मराठी", "🎭"),
    LanguageOption("bengali", "Bengali", "বাংলা", "🌊"),
)

@Composable
fun OnboardingScreen(onDone: (List<String>) -> Unit) {
    var selected by remember { mutableStateOf(listOf<String>()) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFF2A0810), Color.Black, Color.Black),
                ),
            ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(20.dp))
            Text(
                "Welcome to Muzii",
                color = AppleRed,
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                "What do you listen to?",
                color = Color.White,
                style = MaterialTheme.typography.headlineLarge,
                fontWeight = FontWeight.Bold,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            Spacer(Modifier.height(10.dp))
            Text(
                "Pick your languages and Muzii builds a feed around them. " +
                    "Every song radio stays in that lane — same language, same mood.",
                color = TextSecondary,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.widthIn(max = 520.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            Spacer(Modifier.height(24.dp))

            LANGUAGES.forEach { lang ->
                val active = selected.contains(lang.id)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 520.dp)
                        .padding(vertical = 4.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(if (active) Color(0x26FA2D48) else SurfaceElevated)
                        .border(
                            width = 1.dp,
                            color = if (active) AppleRed else Color(0x1AFFFFFF),
                            shape = RoundedCornerShape(14.dp),
                        )
                        .clickable {
                            selected = if (active) selected - lang.id else selected + lang.id
                        }
                        .padding(horizontal = 14.dp, vertical = 13.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(lang.emoji, style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(lang.native, color = Color.White, fontWeight = FontWeight.SemiBold)
                        Text(
                            lang.label,
                            color = TextSecondary,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    if (active) {
                        Icon(Icons.Filled.Check, contentDescription = null, tint = AppleRed)
                    }
                }
            }

            Spacer(Modifier.height(24.dp))
            Button(
                onClick = { onDone(selected) },
                enabled = selected.isNotEmpty(),
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 520.dp)
                    .height(50.dp),
                shape = RoundedCornerShape(25.dp),
            ) {
                Text("Continue", fontWeight = FontWeight.SemiBold)
            }
            TextButton(onClick = { onDone(emptyList()) }) {
                Text("Skip for now — I'll just search", color = TextSecondary)
            }
            Spacer(Modifier.height(12.dp))
            Text(
                "You can change this any time in Library → Taste.",
                color = Color(0xFF6E6E73),
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(Modifier.height(24.dp))
        }
    }
}
