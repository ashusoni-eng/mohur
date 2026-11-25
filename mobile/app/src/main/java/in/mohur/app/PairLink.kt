package `in`.mohur.app

import android.net.Uri

object PairLink {
    /** Reads mohur://pair?s=server&d=device&k=key, or null if it is anything else. */
    fun parse(text: String, now: Long): Pairing? {
        val u = runCatching { Uri.parse(text.trim()) }.getOrNull() ?: return null
        if (u.scheme != "mohur" || u.host != "pair") return null
        val s = u.getQueryParameter("s")?.trimEnd('/') ?: return null
        val d = u.getQueryParameter("d") ?: return null
        val k = u.getQueryParameter("k") ?: return null
        if (!Api.allowed(s) || !Regex("dev_[a-z0-9]{8,40}").matches(d) || k.length < 32) return null
        return Pairing(s, d, k, now)
    }
}
