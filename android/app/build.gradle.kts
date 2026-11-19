plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.muzii.app"
    compileSdk = 34

    /**
     * A committed, stable release keystore.
     *
     * Why this matters more than it looks: AGP's default debug signing writes
     * `~/.android/debug.keystore` on first use, and a fresh keystore is
     * generated on any machine that lacks it. GitHub Actions starts from a new
     * runner every run and `gradle/actions/setup-gradle` caches `~/.gradle`,
     * NOT `~/.android` — so every release was signed with a *different* key.
     *
     * Android refuses to install an APK whose signature differs from the
     * installed one ("App not installed" / INSTALL_FAILED_UPDATE_INCOMPATIBLE),
     * so users could not update in place: they had to uninstall first, and
     * anyone who didn't was left running an old, broken build forever.
     *
     * This keystore is deliberately reproducible and non-secret in intent —
     * it ships in the repo so that local and CI builds sign identically and
     * updates apply cleanly. For a Play Store listing, replace it with a
     * private keystore supplied via env vars.
     */
    signingConfigs {
        create("release") {
            storeFile = rootProject.file("keystore/muzii-release.p12")
            // takeIf{isNotBlank} matters: an unset GitHub secret arrives as an
            // EMPTY string, not as absent, so `?: default` alone would hand
            // the signer a blank password and fail.
            storePassword = System.getenv("MUZII_STORE_PASSWORD")?.takeIf { it.isNotBlank() }
                ?: "muzii-release"
            keyAlias = "muzii"
            keyPassword = System.getenv("MUZII_KEY_PASSWORD")?.takeIf { it.isNotBlank() }
                ?: "muzii-release"
            storeType = "PKCS12"
        }
    }

    defaultConfig {
        applicationId = "com.muzii.app"
        minSdk = 26
        targetSdk = 34
        // CI passes the run number so each release outranks the last one.
        // Hardcoded 1/1.0.0 meant Android considered every release identical,
        // which is the other half of why updates misbehaved. The fallback of 1
        // keeps a plain local `gradle assembleRelease` working.
        versionCode = System.getenv("MUZII_VERSION_CODE")?.toIntOrNull() ?: 1
        versionName = System.getenv("MUZII_VERSION_NAME") ?: "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // API base URL. Resolution order:
        //   1. -Pmuzii.apiBaseUrl=https://your-worker.workers.dev/  (explicit)
        //   2. MUZII_API_BASE_URL env var (set by CI; defaults to the Worker)
        //   3. the deployed Worker itself.
        //
        // This points at the Worker DIRECTLY rather than at the Pages site.
        // Going through Pages added a dependency on a generated `_redirects`
        // proxy that is not committed, so a build could silently ship an APK
        // whose every /api/* call 404'd — the app then showed its bundled demo
        // tracks forever. The Worker has CORS open and needs no proxy.
        val apiBaseUrl = (
            project.findProperty("muzii.apiBaseUrl") as String?
                ?: System.getenv("MUZII_API_BASE_URL")
                ?: "https://muzii.mn-bots.workers.dev/"
            ).let { if (it.endsWith("/")) it else "$it/" }
        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
    }

    buildTypes {
        release {
            // R8 was disabled, and the APK shipped every unused class, all of
            // media3-ui and the entire extended material icon set — 14 MB for
            // an app that needs a fraction of it. Minifying plus resource
            // shrinking roughly halves the download and trims startup work.
            isMinifyEnabled = true
            isShrinkResources = true
            // One stable key for every release, so an APK installs OVER the
            // previous one instead of failing the signature check.
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.09.00")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.8.6")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.6")
    implementation("androidx.activity:activity-compose:1.9.3")
    // by viewModels() delegate lives here (not in activity-compose)
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.foundation:foundation")

    // Background playback — Media3 (ExoPlayer) foreground service
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-session:1.4.1")
    implementation("androidx.media3:media3-ui:1.4.1")
    implementation("androidx.media3:media3-common:1.4.1")

    // Networking + ad-blocking interceptor
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.google.code.gson:gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
