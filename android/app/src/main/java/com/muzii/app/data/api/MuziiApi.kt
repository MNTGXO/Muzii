package com.muzii.app.data.api

import com.muzii.app.BuildConfig
import com.muzii.app.data.model.Playlist
import com.muzii.app.data.model.Track
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query
import java.util.concurrent.TimeUnit

interface MuziiApi {
    /**
     * Home feed. `languages` scopes it to the languages chosen at
     * onboarding; an empty value returns the full catalog.
     */
    @GET("api/catalog")
    suspend fun getCatalog(@Query("languages") languages: String = ""): List<Track>

    @GET("api/playlists") suspend fun getPlaylists(): List<Playlist>

    @GET("api/search") suspend fun search(@Query("q") q: String): List<Track>

    @GET("api/track/{id}") suspend fun getTrack(@Path("id") id: String): Track

    /**
     * Song radio: what to play after [seedId]. `exclude` is the comma
     * separated list of tracks already played this session, so the backend
     * never sends one of them back.
     */
    @GET("api/radio")
    suspend fun radio(
        @Query("seedId") seedId: String,
        @Query("title") title: String,
        @Query("artist") artist: String,
        @Query("exclude") exclude: String,
        @Query("limit") limit: Int = 10,
        // Seed metadata: what keeps the station in its language and era.
        @Query("lang") language: String? = null,
        @Query("composer") composer: String? = null,
        @Query("year") year: Int? = null,
        // Taste profile: disliked ids are never returned, liked ids are boosted.
        @Query("avoid") avoid: String? = null,
        @Query("loved") loved: String? = null,
        @Query("language") prefLanguages: String? = null,
    ): List<Track>
}

object MuziiApiFactory {
    fun create(): MuziiApi {
        val client = OkHttpClient.Builder()
            .addInterceptor(AdBlockInterceptor())
            .addInterceptor(
                HttpLoggingInterceptor().apply {
                    level = HttpLoggingInterceptor.Level.BASIC
                },
            )
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
        return Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(MuziiApi::class.java)
    }
}
