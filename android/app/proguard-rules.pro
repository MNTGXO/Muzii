# Muzii R8 / ProGuard rules.
#
# Release builds are minified. Every rule below exists because minification
# broke something specific — none are speculative.

# ---- Retrofit -------------------------------------------------------------
# Retrofit reads the generic signatures of the service interface (MuziiApi,
# JamApi) at runtime. Without these it throws "not an interface" or returns
# null bodies.
-keepattributes Signature, InnerClasses, EnclosingMethod
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations
-keep,allowobfuscation,allowshrinking interface retrofit2.Call
-keep,allowobfuscation,allowshrinking class retrofit2.Response
-keep,allowobfuscation,allowshrinking class kotlin.coroutines.Continuation
-keepclasseswithmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}

# ---- Gson ----------------------------------------------------------------
# Models are (de)serialised reflectively by field name matching the JSON keys
# (`streamUrl`, `gradientSeed`, `trackIds`…). R8 renaming those fields silently
# produced null streams and empty playlists — the APK appeared to load a
# catalog where every song was unplayable.
-keep class com.muzii.app.data.model.** { *; }
-keep class com.muzii.app.data.taste.PlayLog$Entry { *; }
-keepclassmembers,allowobfuscation class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
# Gson's own internals.
-keep class com.google.gson.reflect.TypeToken { *; }
-keepclassmembers class * {
    <init>(...);
}
-dontwarn sun.misc.**
-keep class com.google.gson.** { *; }

# ---- OkHttp / Okio -------------------------------------------------------
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
# OkHttp references optional Conscrypt/BouncyCastle providers that are absent.

# ---- Media3 / ExoPlayer --------------------------------------------------
# Media3 uses reflection to instantiate decoders and to discover the session
# service. Stripping these keeps the media notification from binding.
-keep class androidx.media3.** { *; }
-dontwarn androidx.media3.**

# ---- Coroutines ----------------------------------------------------------
# The debug service loader is not shipped; this only silences the warning.
-dontwarn kotlinx.coroutines.**

# ---- App entry points ----------------------------------------------------
-keep class com.muzii.app.MuziiApp { *; }
-keep class com.muzii.app.MainActivity { *; }
-keep class com.muzii.app.playback.PlaybackService { *; }

# Keep line numbers so a release crash report is readable.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
