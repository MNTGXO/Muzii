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
    @GET("api/catalog") suspend fun getCatalog(): List<Track>

    @GET("api/playlists") suspend fun getPlaylists(): List<Playlist>

    @GET("api/search") suspend fun search(@Query("q") q: String): List<Track>

    @GET("api/track/{id}") suspend fun getTrack(@Path("id") id: String): Track
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
