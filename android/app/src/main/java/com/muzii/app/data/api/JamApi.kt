package com.muzii.app.data.api

import com.muzii.app.BuildConfig
import com.muzii.app.data.model.JamState
import com.muzii.app.data.model.JamTrack
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import java.util.concurrent.TimeUnit

/** Response of POST /api/jam/:code/join */
data class JoinResponse(val token: String, val state: JamState)

/**
 * Muzii Jam rooms (shared listening). Mirrors worker/src/jam.ts.
 *
 * The room lives in a Durable Object on the Worker; this client polls it and
 * posts actions. Every action takes the guest `token` in the body.
 */
/** Result of hosting: the caller becomes the speaker for this room. */
data class HostResponse(
    val hostToken: String,
    val code: String,
    val state: JamState,
)

interface JamApi {
    /**
     * Create a room, seeded from the caller's live queue.
     *
     * The APK could only *join*. Hosting stays on the speaker's own device —
     * which is the whole point, since the host is the one playing audio — so
     * a phone that is already playing is a perfectly good speaker.
     */
    @POST("api/jam")
    suspend fun host(@Body body: Map<String, Any>): HostResponse

    /**
     * Poll the room. The token is a query param (not a body) because this is
     * a GET — without it the room cannot tell which member is asking.
     */
    @GET("api/jam/{code}")
    suspend fun getJam(
        @Path("code") code: String,
        @Query("token") token: String,
    ): JamState

    @POST("api/jam/{code}/join")
    suspend fun join(
        @Path("code") code: String,
        @Body body: Map<String, String>,
    ): JoinResponse

    @POST("api/jam/{code}/queue")
    suspend fun queue(
        @Path("code") code: String,
        @Body body: Map<String, Any>,
    ): JamState

    @POST("api/jam/{code}/skip")
    suspend fun skip(
        @Path("code") code: String,
        @Body body: Map<String, String>,
    ): JamState

    /**
     * Host heartbeat: publish what this device is playing so guests converge.
     * Only the host token may call it; the room ignores anyone else.
     */
    @POST("api/jam/{code}/sync")
    suspend fun sync(
        @Path("code") code: String,
        @Body body: Map<String, Any>,
    ): JamState

    @POST("api/jam/{code}/message")
    suspend fun message(
        @Path("code") code: String,
        @Body body: Map<String, String>,
    ): JamState
}

object JamApiFactory {
    fun create(): JamApi {
        val client = OkHttpClient.Builder()
            .addInterceptor(AdBlockInterceptor())
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()
        return Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(JamApi::class.java)
    }
}
