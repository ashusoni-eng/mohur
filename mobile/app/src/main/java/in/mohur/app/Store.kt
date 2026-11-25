package `in`.mohur.app

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

data class Pairing(val server: String, val device: String, val key: String, val since: Long)
data class Alert(val id: String, val sender: String, val body: String, val receivedAt: Long)
data class Row(val sender: String, val receivedAt: Long, val outcome: String?, val amount: Long?, val paymentId: String?)

/** Everything the app remembers. Message text is erased as soon as the server has it. */
class Store private constructor(ctx: Context) : SQLiteOpenHelper(ctx, "mohur.db", null, 1) {
    private val prefs = ctx.getSharedPreferences("mohur", Context.MODE_PRIVATE)

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE alerts (id TEXT PRIMARY KEY, sender TEXT NOT NULL, body TEXT, body_hash TEXT NOT NULL, received_at INTEGER NOT NULL, outcome TEXT, amount INTEGER, payment_id TEXT)")
        db.execSQL("CREATE INDEX a_t ON alerts(received_at)")
    }

    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) = Unit

    var pairing: Pairing?
        get() {
            val sealed = prefs.getString("key", null) ?: return null
            // A key that can no longer be opened (restored phone, wiped keystore) is the same as not paired.
            val key = runCatching { KeyBox.instance.open(sealed) }.getOrNull() ?: return null
            return Pairing(prefs.getString("server", "")!!, prefs.getString("device", "")!!, key, prefs.getLong("since", 0))
        }
        set(p) {
            prefs.edit().clear().apply {
                if (p != null) putString("key", KeyBox.instance.seal(p.key)).putString("server", p.server).putString("device", p.device).putLong("since", p.since).putLong("scanned", p.since)
            }.commit()
            if (p == null) writableDatabase.delete("alerts", null, null)
        }

    var headers: Set<String>
        get() = prefs.getStringSet("headers", emptySet())!!.toSet()
        set(v) = prefs.edit().putStringSet("headers", v).apply()
    var business: String
        get() = prefs.getString("business", "")!!
        set(v) = prefs.edit().putString("business", v).apply()
    /** Server clock minus phone clock. */
    var offset: Long
        get() = prefs.getLong("offset", 0)
        set(v) = prefs.edit().putLong("offset", v).apply()
    var lastOk: Long
        get() = prefs.getLong("lastOk", 0)
        set(v) = prefs.edit().putLong("lastOk", v).apply()
    var lastError: String?
        get() = prefs.getString("lastError", null)
        set(v) = prefs.edit().putString("lastError", v).apply()
    var scannedTo: Long
        get() = prefs.getLong("scanned", 0)
        set(v) = prefs.edit().putLong("scanned", v).apply()
    var askedSms: Boolean
        get() = prefs.getBoolean("askedSms", false)
        set(v) = prefs.edit().putBoolean("askedSms", v).apply()

    /** Queues a message if it may leave the phone and has not been seen. Returns true when queued. */
    @Synchronized
    fun offer(sender: String, body: String, sentAt: Long, receivedAt: Long): Boolean {
        val p = pairing ?: return false
        if (receivedAt < p.since || !Filter.shouldForward(sender, body, headers)) return false
        val hash = Filter.sha256(body)
        // The live broadcast and the inbox can report slightly different timestamps for one message.
        readableDatabase.rawQuery(
            "SELECT 1 FROM alerts WHERE sender=? AND body_hash=? AND ABS(received_at-?)<600000", arrayOf(sender, hash, receivedAt.toString()),
        ).use { if (it.moveToFirst()) return false }
        val v = ContentValues().apply {
            put("id", Filter.id(sender, body, sentAt)); put("sender", sender); put("body", body); put("body_hash", hash); put("received_at", receivedAt)
        }
        return writableDatabase.insertWithOnConflict("alerts", null, v, SQLiteDatabase.CONFLICT_IGNORE) != -1L
    }

    fun queued(limit: Int = 20): List<Alert> =
        readableDatabase.rawQuery("SELECT id, sender, body, received_at FROM alerts WHERE body IS NOT NULL ORDER BY received_at LIMIT $limit", null).use { c ->
            buildList { while (c.moveToNext()) add(Alert(c.getString(0), c.getString(1), c.getString(2), c.getLong(3))) }
        }

    fun done(id: String, outcome: String, amount: Long?, paymentId: String?) {
        val v = ContentValues().apply { putNull("body"); put("outcome", outcome); put("amount", amount); put("payment_id", paymentId) }
        writableDatabase.update("alerts", v, "id=?", arrayOf(id))
    }

    fun prune(now: Long) {
        writableDatabase.delete("alerts", "received_at<?", arrayOf((now - 30L * 86_400_000).toString()))
    }

    fun recent(limit: Int = 25): List<Row> =
        readableDatabase.rawQuery("SELECT sender, received_at, outcome, amount, payment_id FROM alerts WHERE outcome IS NULL OR outcome<>'skipped' ORDER BY received_at DESC LIMIT $limit", null).use { c ->
            buildList { while (c.moveToNext()) add(Row(c.getString(0), c.getLong(1), c.getString(2), if (c.isNull(3)) null else c.getLong(3), c.getString(4))) }
        }

    /** Payments confirmed by this phone since a moment: how many, and how much. */
    fun confirmedSince(t: Long): Pair<Int, Long> =
        readableDatabase.rawQuery("SELECT COUNT(*), COALESCE(SUM(amount),0) FROM alerts WHERE outcome='matched' AND received_at>=?", arrayOf(t.toString())).use { it.moveToFirst(); it.getInt(0) to it.getLong(1) }

    companion object {
        @Volatile private var it: Store? = null
        fun get(ctx: Context): Store = it ?: synchronized(this) { it ?: Store(ctx.applicationContext).also { s -> it = s } }
        fun reset() { it?.close(); it = null }
    }
}
