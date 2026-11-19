package com.muzii.app.data.api

import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody

/**
 * Network-level ad blocker (Android).
 * Blocks ad/tracker hosts before the request leaves the device.
 * Keep AD_HOSTS in sync with worker/src/adblock.ts and web/src/adblock/blocker.ts.
 */
class AdBlockInterceptor : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val url = chain.request().url
        val host = url.host.lowercase()
        val path = url.pathSegments.joinToString("/").lowercase()
        if (AD_HOSTS.any { host == it || host.endsWith(".$it") } ||
            AD_PATH_PATTERNS.any { path.contains(it) }
        ) {
            return Response.Builder()
                .request(chain.request())
                .protocol(Protocol.HTTP_1_1)
                .code(403)
                .message("Blocked by Muzii AdBlock")
                .body(
                    "{\"blocked\":true,\"reason\":\"ad-blocked\"}"
                        .toResponseBody("application/json".toMediaType()),
                )
                .build()
        }
        return chain.proceed(chain.request())
    }

    companion object {
        val AD_HOSTS = setOf(
            "doubleclick.net", "googlesyndication.com", "googleadservices.com",
            "googletagmanager.com", "googletagservices.com", "facebook.net",
            "amazon-adsystem.com", "adsrvr.org", "adnxs.com", "criteo.com",
            "pubmatic.com", "rubiconproject.com", "openx.net", "taboola.com",
            "outbrain.com", "smartadserver.com", "hotjar.com", "mixpanel.com",
            "segment.io", "amplitude.com", "fullstory.com", "adsafeprotected.com",
            "moatads.com", "scorecardresearch.com", "quantserve.com",
        )
        private val AD_PATH_PATTERNS =
            listOf("/ads/", "/adserver", "/ad-insertion", "/preroll", "/midroll", "/sponsor")
    }
}
