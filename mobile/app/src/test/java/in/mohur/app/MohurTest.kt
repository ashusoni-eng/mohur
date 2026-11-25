package `in`.mohur.app

import android.Manifest
import android.app.Application
import android.app.job.JobScheduler
import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.database.MatrixCursor
import android.net.Uri
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import java.net.InetAddress
import java.net.ServerSocket
import kotlin.concurrent.thread

@RunWith(RobolectricTestRunner::class)
class MohurTest {
    private val ctx: Context get() = RuntimeEnvironment.getApplication()
    private val allowed = setOf("HDFCBK")
    private val credit = "Credit Alert! Rs.500.07 credited to HDFC Bank A/c XX4321 on 25-11-26 from VPA ravi@okaxis (UPI 633012345678)"
    private val KEY = "k".repeat(43)
    private var srv: ServerSocket? = null
    private val got = mutableListOf<Triple<String, JSONObject, Boolean>>()
    private var skew = 0L
    private var fail: Pair<Int, String>? = null

    @Before fun up() {
        Store.reset()
        ctx.deleteDatabase("mohur.db")
        KeyBox.instance = object : KeyBox { override fun seal(plain: String) = plain.reversed(); override fun open(sealed: String) = sealed.reversed() }
    }
    @After fun down() { srv?.close() }

    private fun server(): String {
        val s = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
        srv = s
        thread(isDaemon = true) {
            while (!s.isClosed) runCatching {
                s.accept().use { c ->
                    val inp = c.getInputStream().buffered()
                    fun line(): String { val b = StringBuilder(); while (true) { val ch = inp.read(); if (ch < 0 || ch == 10) break; if (ch != 13) b.append(ch.toChar()) }; return b.toString() }
                    val path = line().split(" ")[1]
                    val h = HashMap<String, String>()
                    while (true) { val l = line(); if (l.isEmpty()) break; h[l.substringBefore(":").lowercase()] = l.substringAfter(":").trim() }
                    val raw = String(ByteArray(h["content-length"]!!.toInt()).also { b -> var n = 0; while (n < b.size) n += inp.read(b, n, b.size - n) })
                    val time = h["mohur-time"]!!
                    val ok = h["mohur-signature"] == Api.hmac(KEY, "POST\n$path\n$time\n${Filter.sha256(raw)}")
                    val now = System.currentTimeMillis() + skew
                    val (code, out) = fail ?: when {
                        Math.abs(now - time.toLong()) > 300_000 -> 409 to """{"code":"clock","now":$now}"""
                        path.endsWith("hello") -> 200 to """{"now":$now,"business":"Terra Studio","headers":["HDFCBK"]}"""
                        else -> {
                            val items = JSONObject(raw).getJSONArray("items")
                            200 to """{"now":$now,"results":[${(0 until items.length()).joinToString { n -> """{"id":"${items.getJSONObject(n).getString("id")}","outcome":"matched","amount":50007,"payment_id":"7F3A9C21B0"}""" }}]}"""
                        }
                    }
                    got.add(Triple(path, JSONObject(raw), ok))
                    c.getOutputStream().write("HTTP/1.1 $code X\r\nContent-Type: application/json\r\nContent-Length: ${out.length}\r\nConnection: close\r\n\r\n$out".toByteArray())
                }
            }
        }
        return "http://127.0.0.1:${s.localPort}"
    }
    private fun pair(url: String = server()) = Sync.hello(ctx, Pairing(url, "dev_abcdefgh1234", KEY, System.currentTimeMillis()))

    /** A real GSM delivery PDU, as the modem hands it over. */
    private fun pdu(sender: String, text: String): ByteArray {
        val alnum = sender.any { !it.isDigit() && it != '+' }
        fun pack(s: String): ByteArray {
            val out = ByteArray((s.length * 7 + 7) / 8)
            s.forEachIndexed { i, ch -> val v = ch.code and 0x7f; val bit = i * 7; val b = bit / 8; val o = bit % 8; out[b] = (out[b].toInt() or (v shl o)).toByte(); if (o > 1) out[b + 1] = (out[b + 1].toInt() or (v shr (8 - o))).toByte() }
            return out
        }
        val addr = if (alnum) pack(sender).let { byteArrayOf((it.size * 2 - if ((sender.length * 7) % 8 in 1..4) 1 else 0).toByte(), 0xD0.toByte()) + it }
        else sender.trimStart('+').let { dgt -> val p = if (dgt.length % 2 == 1) dgt + "F" else dgt; byteArrayOf(dgt.length.toByte(), 0x91.toByte()) + p.chunked(2).map { "${it[1]}${it[0]}".toInt(16).toByte() }.toByteArray() }
        val body = text.toByteArray(Charsets.UTF_16BE)
        return byteArrayOf(0, 4) + addr + byteArrayOf(0, 8, 0x62, 0x11, 0x52, 0x01, 0x01, 0x01, 0x22) + byteArrayOf(body.size.toByte()) + body
    }
    private fun deliver(sender: String, vararg parts: String) {
        SmsReceiver().onReceive(ctx, Intent("android.provider.Telephony.SMS_RECEIVED").putExtra("format", "3gpp").putExtra("pdus", parts.map { pdu(sender, it) as Any }.toTypedArray()))
        val end = System.currentTimeMillis() + 4000
        while (System.currentTimeMillis() < end && Thread.getAllStackTraces().keys.any { it.name == "mohur-sms" && it.isAlive }) Thread.sleep(20)
    }

    @Test fun filterKeepsPrivateThingsOnThePhone() {
        assertTrue(Filter.shouldForward("VM-HDFCBK-S", credit, allowed))
        assertTrue(Filter.shouldForward("AD-HDFCBK", "$credit. Never share OTP/PIN with anyone.", allowed))
        assertFalse(Filter.shouldForward("VM-HDFCBK-P", credit, allowed))
        assertFalse(Filter.shouldForward("VM-ICICIT-S", credit, allowed))
        assertFalse(Filter.shouldForward("+919812345678", credit, allowed))
        assertFalse(Filter.shouldForward("VM-HDFCBK-S", "123456 is your OTP to receive Rs.500 credited", allowed))
        assertFalse(Filter.shouldForward("VM-HDFCBK-S", "Sent Rs.500 to shop", allowed))
        // Even a hostile server cannot widen the filter to people.
        assertFalse(Filter.shouldForward("+919812345678", credit, setOf("+919812345678", "919812345678")))
    }

    @Test fun pairingLinks() {
        fun p(s: String) = PairLink.parse("mohur://pair?s=${Uri.encode(s)}&d=dev_abcdefgh1234&k=$KEY", 1)
        assertEquals("https://pay.terra.in", p("https://pay.terra.in/")?.server)
        assertNotNull(p("http://192.168.1.5:4100"))
        for (bad in listOf("http://evil.com", "http://8.8.8.8", "ftp://x.in", "https://a@b.in", "http://192.168.1.5.evil.com", "http://10.0.0.1@evil.com", "javascript:x")) assertNull(bad, p(bad))
        for (bad in listOf("", "https://x.in", "mohur://pair", "mohur://other?s=https://x.in&d=dev_abcdefgh1234&k=$KEY", "mohur://pair?s=https://x.in&d=dev_abcdefgh1234&k=short")) assertNull(bad, PairLink.parse(bad, 1))
    }

    @Test fun sendsABankSmsSignedAndForgetsItsText() {
        pair()
        deliver("VM-HDFCBK-S", credit)
        val (path, json, ok) = got.last()
        assertEquals("/api/device/sms", path)
        assertTrue("signature", ok)
        assertEquals("VM-HDFCBK-S", json.getJSONArray("items").getJSONObject(0).getString("sender"))
        assertEquals(credit, json.getJSONArray("items").getJSONObject(0).getString("body"))
        assertEquals(Row("VM-HDFCBK-S", Store.get(ctx).recent()[0].receivedAt, "matched", 50007, "7F3A9C21B0"), Store.get(ctx).recent()[0])
        assertTrue(Store.get(ctx).queued().isEmpty())
        assertEquals(1 to 50007L, Store.get(ctx).confirmedSince(0))
    }

    @Test fun joinsLongMessagesAndSkipsTheRest() {
        pair()
        deliver("VM-HDFCBK-S", credit.substring(0, 60), credit.substring(60))
        assertEquals(credit, got.last().second.getJSONArray("items").getJSONObject(0).getString("body"))
        val n = got.size
        deliver("+919812345678", credit)
        deliver("VM-HDFCBK-S", "123456 is your OTP. Rs.500 received")
        deliver("VM-HDFCBK-S", credit)
        assertEquals(n, got.size)
    }

    @Test fun keepsMessagesWhileOfflineAndSendsThemLater() {
        pair()
        fail = 503 to "{}"
        deliver("VM-HDFCBK-S", credit)
        assertEquals(1, Store.get(ctx).queued().size)
        assertNotNull(Store.get(ctx).lastError)
        assertTrue(ctx.getSystemService(JobScheduler::class.java).allPendingJobs.any { it.id == 2 })
        fail = null
        assertTrue(Sync.round(ctx))
        assertTrue(Store.get(ctx).queued().isEmpty())
        assertNull(Store.get(ctx).lastError)
        assertTrue(got.last { it.first.endsWith("sms") }.second.getJSONArray("items").getJSONObject(0).getLong("age_ms") >= 0)
    }

    @Test fun correctsAWrongPhoneClock() {
        skew = 3 * 3600_000L
        pair()
        assertTrue(Math.abs(Store.get(ctx).offset - skew) < 5000)
        deliver("VM-HDFCBK-S", credit)
        assertTrue(Store.get(ctx).queued().isEmpty())
    }

    @Test fun forgetsEverythingWhenRemovedOnTheServer() {
        pair()
        fail = 401 to """{"code":"unpaired"}"""
        deliver("VM-HDFCBK-S", credit)
        assertNull(Store.get(ctx).pairing)
        assertTrue(Store.get(ctx).recent().isEmpty())
    }

    @Test fun savesNothingWhenPairingFails() {
        val url = server()
        fail = 401 to """{"code":"unpaired"}"""
        try { pair(url); fail("should refuse") } catch (_: Unpaired) { }
        assertNull(Store.get(ctx).pairing)
    }

    @Test fun catchesUpFromTheInboxWithoutRepeating() {
        pair()
        shadowOf(ctx as Application).grantPermissions(Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS)
        val now = System.currentTimeMillis()
        Inbox.rows = listOf(arrayOf("VM-HDFCBK-S", credit, now + 50, now), arrayOf("VM-HDFCBK-S", credit.replace("500.07", "12.00"), now - 86_400_000, 0L), arrayOf("+919812345678", "hello, received your gift", now + 60, now))
        Robolectric.setupContentProvider(Inbox::class.java, "sms")
        Sync.round(ctx)
        val sent = got.filter { it.first.endsWith("sms") }
        assertEquals(1, sent.size)
        assertEquals(1, sent[0].second.getJSONArray("items").length())
        Sync.round(ctx)
        deliver("VM-HDFCBK-S", credit)
        assertEquals(1, got.count { it.first.endsWith("sms") })
    }

    /** Against a real Mohur server: MOHUR_LIVE holds a pairing link, MOHUR_SMS the text to deliver. */
    @Test fun live() {
        val link = System.getenv("MOHUR_LIVE")
        assumeTrue(link != null)
        Sync.hello(ctx, PairLink.parse(link!!, System.currentTimeMillis())!!)
        shadowOf(ctx as Application).grantPermissions(Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS)
        deliver("VM-HDFCBK-S", System.getenv("MOHUR_SMS")!!)
        assertEquals("matched", Store.get(ctx).recent()[0].outcome)
        assertTrue(Sync.round(ctx))
    }
}

class Inbox : ContentProvider() {
    override fun onCreate() = true
    override fun query(u: Uri, p: Array<String>?, s: String?, a: Array<String>?, o: String?) = MatrixCursor(p).apply { rows.filter { (it[2] as Long) >= a!![0].toLong() }.forEach { addRow(it) } }
    override fun getType(u: Uri) = null
    override fun insert(u: Uri, v: ContentValues?) = null
    override fun delete(u: Uri, s: String?, a: Array<String>?) = 0
    override fun update(u: Uri, v: ContentValues?, s: String?, a: Array<String>?) = 0
    companion object { var rows: List<Array<Any>> = emptyList() }
}
