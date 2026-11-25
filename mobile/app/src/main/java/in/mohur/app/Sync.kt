package `in`.mohur.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import android.provider.Telephony
import org.json.JSONArray
import org.json.JSONObject

object Sync {
    private val lock = Any()

    fun smsAllowed(ctx: Context) = listOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS).all { ctx.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }
    fun batteryFree(ctx: Context) = ctx.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(ctx.packageName)

    /** Tells the server this phone is alive, and learns which senders to watch. */
    fun hello(ctx: Context, p: Pairing? = null) {
        val store = Store.get(ctx)
        val r = Api(store, p ?: store.pairing ?: return).post("/api/device/hello") {
            JSONObject().put("model", "${Build.MANUFACTURER} ${Build.MODEL}".trim().replaceFirstChar(Char::uppercase).take(80))
                .put("version", BuildConfig.VERSION_NAME).put("sms_ok", smsAllowed(ctx)).put("battery_ok", batteryFree(ctx))
        }
        // The first hello proves the code before anything is saved.
        if (p != null) store.pairing = p
        store.business = r.optString("business")
        store.offset = r.getLong("now") - System.currentTimeMillis()
        val h = r.getJSONArray("headers")
        store.headers = (0 until h.length()).map { h.getString(it).uppercase() }.toSet()
        if (p != null) store.lastOk = System.currentTimeMillis()
    }

    /** Sends everything queued. Safe to call from anywhere, any number of times. */
    fun flush(ctx: Context) = synchronized(lock) {
        val store = Store.get(ctx)
        while (true) {
            val p = store.pairing ?: return
            val batch = store.queued()
            if (batch.isEmpty()) return
            val r = Api(store, p).post("/api/device/sms") { now ->
                JSONObject().put("items", JSONArray(batch.map { a ->
                    JSONObject().put("id", a.id).put("sender", a.sender).put("body", a.body.take(2000)).put("age_ms", (now - a.receivedAt).coerceIn(0, 7L * 86_400_000))
                }))
            }
            val res = r.getJSONArray("results")
            for (i in 0 until res.length()) res.getJSONObject(i).run {
                store.done(getString("id"), getString("outcome"), if (isNull("amount")) null else getLong("amount"), if (isNull("payment_id")) null else getString("payment_id"))
            }
            if (res.length() == 0) return
        }
    }

    /** Picks up bank SMS that arrived while the app could not listen. */
    fun catchUp(ctx: Context) {
        val store = Store.get(ctx)
        val p = store.pairing ?: return
        if (ctx.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) return
        val now = System.currentTimeMillis()
        val from = maxOf(p.since, store.scannedTo - 10 * 60_000)
        runCatching {
            ctx.contentResolver.query(
                Telephony.Sms.Inbox.CONTENT_URI, arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE, Telephony.Sms.DATE_SENT),
                "${Telephony.Sms.DATE}>=?", arrayOf(from.toString()), "${Telephony.Sms.DATE} ASC",
            )?.use { c ->
                while (c.moveToNext()) {
                    val at = c.getLong(2)
                    store.offer(c.getString(0) ?: continue, c.getString(1) ?: continue, c.getLong(3).takeIf { it > 0 } ?: at, at)
                }
                store.scannedTo = now
            }
        }
        store.prune(now)
    }

    /** One full round. Returns false when it should be tried again later. */
    fun round(ctx: Context): Boolean {
        val store = Store.get(ctx)
        if (store.pairing == null) return true
        return try {
            hello(ctx)
            catchUp(ctx)
            flush(ctx)
            true
        } catch (e: Unpaired) {
            forget(ctx)
            true
        } catch (e: Exception) {
            store.lastError = explain(e)
            false
        }
    }

    fun forget(ctx: Context) {
        Store.get(ctx).pairing = null
        Store.get(ctx).lastError = "This phone was removed from Mohur. Pair it again to keep listening."
        SyncJob.cancel(ctx)
    }

    fun explain(e: Exception): String = when (e) {
        is Refused, is Unpaired -> e.message!!
        is javax.net.ssl.SSLException -> "The server's security certificate is not valid"
        is java.io.IOException -> "Cannot reach your Mohur server"
        else -> "Something went wrong"
    }
}
