package `in`.mohur.app

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URI
import java.net.URL
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

class Unpaired : Exception("This phone is no longer paired")
class Refused(message: String) : Exception(message)

/** Signed calls to the merchant's own Mohur server. */
class Api(private val store: Store, private val p: Pairing) {
    fun post(path: String, build: (now: Long) -> JSONObject): JSONObject = send(path, build) ?: send(path, build) ?: throw Refused("The clocks on this phone and the server do not agree")

    /** Null means our clock was off; the offset has been corrected and the call can be repeated. */
    private fun send(path: String, build: (Long) -> JSONObject): JSONObject? {
        val now = System.currentTimeMillis()
        val body = build(now).toString()
        val time = (now + store.offset).toString()
        val con = URL(p.server + path).openConnection() as HttpURLConnection
        try {
            con.requestMethod = "POST"
            con.connectTimeout = 8_000
            con.readTimeout = 12_000
            con.instanceFollowRedirects = false
            con.doOutput = true
            con.setRequestProperty("content-type", "application/json")
            con.setRequestProperty("mohur-device", p.device)
            con.setRequestProperty("mohur-time", time)
            con.setRequestProperty("mohur-signature", hmac(p.key, "POST\n$path\n$time\n${Filter.sha256(body)}"))
            con.outputStream.use { it.write(body.toByteArray()) }
            val code = con.responseCode
            val text = (if (code < 400) con.inputStream else con.errorStream)?.use { it.readBytes().decodeToString() }.orEmpty()
            val json = runCatching { JSONObject(text) }.getOrNull()
            if (code == 200 && json != null) {
                store.lastOk = System.currentTimeMillis()
                store.lastError = null
                return json
            }
            if (code == 409 && json?.optString("code") == "clock") {
                store.offset = json.getLong("now") - System.currentTimeMillis()
                return null
            }
            if (code == 401 && json?.optString("code") == "unpaired") throw Unpaired()
            throw Refused(json?.optString("error")?.ifEmpty { null } ?: "The server answered $code")
        } finally {
            con.disconnect()
        }
    }

    companion object {
        fun hmac(key: String, s: String): String = Mac.getInstance("HmacSHA256").run {
            init(SecretKeySpec(key.toByteArray(), "HmacSHA256"))
            doFinal(s.toByteArray()).joinToString("") { "%02x".format(it) }
        }

        /** https anywhere; plain http only to a literal private address, for use on your own Wi-Fi. */
        fun allowed(server: String): Boolean {
            val u = runCatching { URI(server) }.getOrNull() ?: return false
            val host = u.host ?: return false
            if (u.userInfo != null || !u.rawQuery.isNullOrEmpty() || u.rawFragment != null) return false
            if (u.scheme == "https") return true
            if (u.scheme != "http") return false
            if (!Regex("[0-9.]+").matches(host)) return host == "localhost"
            val a = runCatching { InetAddress.getByName(host) }.getOrNull() ?: return false
            return a.isSiteLocalAddress || a.isLoopbackAddress
        }
    }
}
