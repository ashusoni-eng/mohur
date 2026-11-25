package `in`.mohur.app

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ClipboardManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.view.WindowInsets
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.ScrollView
import java.util.Calendar
import kotlin.concurrent.thread

class MainActivity : Activity() {
    private val ui = Handler(Looper.getMainLooper())
    private val store by lazy { Store.get(this) }
    private var busy = false
    private var drawn = ""
    private val tick = object : Runnable {
        override fun run() { render(); ui.postDelayed(this, 3000) }
    }
    private fun d(v: Number) = Ui.dp(this, v)

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        window.setDecorFitsSystemWindowsCompat()
        if (b == null) handle(intent)
    }

    @Suppress("DEPRECATION")
    private fun android.view.Window.setDecorFitsSystemWindowsCompat() {
        decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
    }

    override fun onNewIntent(i: Intent) { super.onNewIntent(i); handle(i) }

    private fun handle(i: Intent?) {
        val link = i?.takeIf { it.action == Intent.ACTION_VIEW }?.dataString ?: return
        setIntent(Intent())
        offerPairing(link)
    }

    override fun onResume() {
        super.onResume()
        drawn = ""
        ui.post(tick)
        refresh()
    }

    override fun onPause() { ui.removeCallbacks(tick); super.onPause() }

    private fun refresh() {
        if (store.pairing == null || busy) return
        busy = true
        thread { Sync.round(applicationContext); ui.post { busy = false; render() } }
    }

    // --- Pairing -----------------------------------------------------------

    private fun scan() {
        if (checkSelfPermission(Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED) startActivityForResult(Intent(this, ScanActivity::class.java), SCAN)
        else requestPermissions(arrayOf(Manifest.permission.CAMERA), CAMERA)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(code: Int, result: Int, data: Intent?) {
        @Suppress("DEPRECATION") super.onActivityResult(code, result, data)
        if (code == SCAN && result == RESULT_OK) offerPairing(data?.getStringExtra("text").orEmpty())
    }

    private fun paste() {
        val t = getSystemService(ClipboardManager::class.java).primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(this)?.toString().orEmpty()
        offerPairing(t)
    }

    /** Links can come from anywhere, so nothing is paired until the person agrees to this exact server. */
    private fun offerPairing(text: String) {
        val p = PairLink.parse(text, System.currentTimeMillis())
        if (p == null) return notice("Not a pairing code", "In Mohur on your computer, open Configuration, then Phone (SMS), and show the pairing code.")
        val plain = if (p.server.startsWith("http:")) "\n\nThis address is not encrypted. Use it only on your own Wi-Fi." else ""
        val replace = if (store.pairing != null) "\n\nThis replaces the server this phone is paired with now." else ""
        dialog("Pair with this server?", "Bank credit SMS from this phone will be sent to\n\n${p.server}\n\nContinue only if this is your own Mohur server and you opened the pairing code yourself.$plain$replace")
            .setPositiveButton("Pair") { _, _ -> pair(p) }.setNegativeButton("Cancel", null).show()
    }

    private fun pair(p: Pairing) {
        busy = true
        render()
        thread {
            val err = try {
                Sync.hello(applicationContext, p)
                SyncJob.schedulePeriodic(applicationContext)
                null
            } catch (e: Unpaired) {
                "This pairing code has expired or was already replaced. Show a new one and scan again."
            } catch (e: Exception) {
                Sync.explain(e) + (if (p.server.startsWith("http:")) ". Check that this phone is on the same Wi-Fi." else ".")
            }
            ui.post {
                busy = false
                drawn = ""
                render()
                if (isFinishing) return@post
                if (err != null) notice("Could not pair", err) else if (!Sync.smsAllowed(this)) askSms()
            }
        }
    }

    // --- Permissions -------------------------------------------------------

    private fun askSms() {
        val perms = arrayOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS)
        // Once refused for good, Android stops showing the prompt and only Settings can grant it.
        if (store.askedSms && perms.none { shouldShowRequestPermissionRationale(it) }) return openSettings()
        store.askedSms = true
        requestPermissions(perms, SMS)
    }

    private fun openSettings() {
        dialog("Allow SMS in Settings", "Open Permissions, then SMS, and choose Allow.\n\nIf SMS is greyed out, go back one screen, tap the ⋮ menu and choose Allow restricted settings. Android asks for this with apps installed outside the Play Store.")
            .setPositiveButton("Open Settings") { _, _ -> startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null))) }
            .setNegativeButton("Not now", null).show()
    }

    override fun onRequestPermissionsResult(code: Int, p: Array<String>, r: IntArray) {
        super.onRequestPermissionsResult(code, p, r)
        drawn = ""
        render()
        if (code == CAMERA) { if (r.firstOrNull() == android.content.pm.PackageManager.PERMISSION_GRANTED) scan() else notice("Camera is off", "Allow the camera to scan, or copy the pairing code and tap Paste pairing code.") }
        if (code == SMS) refresh()
    }

    private fun askBattery() {
        runCatching { startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName"))) }
            .onFailure { runCatching { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) } }
    }

    private fun unpair() {
        dialog("Unpair this phone?", "It will stop sending bank SMS to Mohur.").setPositiveButton("Unpair") { _, _ ->
            val p = store.pairing
            Sync.forget(this)
            store.lastError = null
            drawn = ""
            render()
            if (p != null) thread { runCatching { Api(store, p).post("/api/device/unpair") { org.json.JSONObject() } }; store.lastError = null }
        }.setNegativeButton("Cancel", null).show()
    }

    private fun dialog(title: String, body: String) = AlertDialog.Builder(this, R.style.MohurDialog).setTitle(title).setMessage(body)
    private fun notice(title: String, body: String) { dialog(title, body).setPositiveButton("OK", null).show() }

    // --- Screen ------------------------------------------------------------

    private fun render() {
        val paired = store.pairing != null
        val rows = if (paired) store.recent() else emptyList()
        val sms = Sync.smsAllowed(this)
        val battery = Sync.batteryFree(this)
        // Rebuild only when something visible changed, so scrolling and touch are never interrupted.
        val key = listOf(paired, rows, sms, battery, busy, store.lastError, store.business, (System.currentTimeMillis() - store.lastOk) / 10_000).toString()
        if (key == drawn) return
        drawn = key
        val old = (findViewById<View>(SCROLL) as? ScrollView)?.scrollY ?: 0
        setContentView(if (paired) home(rows, sms, battery) else welcome())
        (findViewById<View>(SCROLL) as? ScrollView)?.let { s -> s.post { s.scrollTo(0, old) } }
    }

    private fun page(build: LinearLayout.() -> Unit) = ScrollView(this).apply {
        id = SCROLL
        isFillViewport = true
        isVerticalScrollBarEnabled = false
        background = Guilloche(0x42B8934A, 0.5f, 0.62f, 1.75f)
        addView(Ui.column(context, build).apply {
            setOnApplyWindowInsetsListener { v, i ->
                val (t, b) = if (Build.VERSION.SDK_INT >= 30) i.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()).let { it.top to it.bottom } else @Suppress("DEPRECATION") (i.systemWindowInsetTop to i.systemWindowInsetBottom)
                v.setPadding(0, t, 0, if (v.tag == "sheet") 0 else b)
                v.findViewWithTag<View>("foot")?.setPadding(0, 0, 0, b)
                i
            }
        })
    }

    private fun header(more: Boolean) = Ui.row(this) {
        setPadding(d(22), d(16), d(10), 0)
        addView(View(context).apply { background = context.getDrawable(R.drawable.ic_mark); importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO }, LinearLayout.LayoutParams(d(58), d(58)).apply { marginStart = -d(12) })
        addView(Ui.text(context, "Mohur", 25f, Ui.BRASS_LT, face = Ui.display(context)).apply { letterSpacing = 0.03f }, Ui.lp(0, WRAP_CONTENT, 1f))
        if (more) addView(Ui.text(context, "⋮", 26f, Ui.BRASS_LT, true).apply {
            gravity = Gravity.CENTER
            contentDescription = "More options"
            background = Ui.ripple(context, null, 24, 0x33FFFFFF)
            accessibilityDelegate = Ui.asButton
            isClickable = true; isFocusable = true
            setOnClickListener { v ->
                PopupMenu(context, v).apply {
                    this.menu.add("Check now").setOnMenuItemClickListener { refresh(); render(); true }
                    this.menu.add("Unpair phone").setOnMenuItemClickListener { unpair(); true }
                }.show()
            }
        }, LinearLayout.LayoutParams(d(48), d(48)))
    }

    private fun coin(on: Boolean, size: Int) = CoinView(this).apply { live = on; importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO }.also { it.layoutParams = (if (resources.configuration.screenHeightDp < 640) size * 2 / 3 else size).let { LinearLayout.LayoutParams(d(it), d(it)) }.apply { gravity = Gravity.CENTER_HORIZONTAL; topMargin = d(14) } }

    private fun welcome() = page {
        addView(header(false))
        addView(View(context), Ui.lp(h = 0, weight = 1f))
        addView(coin(true, 232))
        addView(View(context), Ui.lp(h = 0, weight = 1f))
        addView(Ui.column(context) {
            setPadding(d(26), d(20), d(26), d(22))
            addView(Ui.text(context, "Your bank texts you.\nMohur listens.", 33f, 0xFFFFFFFF.toInt(), face = Ui.display(context)))
            addView(Ui.text(context, "Bank credit SMS on this phone will confirm payments in your Mohur dashboard. OTPs and personal messages never leave it.", 16f, Ui.WHITE80), Ui.lp(top = d(12)))
            store.lastError?.let { addView(Ui.text(context, it, 15f, 0xFFF5B5A6.toInt()), Ui.lp(top = d(14))) }
            addView(Ui.button(context, if (busy) "Pairing…" else "Scan pairing code", true) { if (!busy) scan() }, Ui.lp(top = d(26)))
            addView(Ui.button(context, "Paste pairing code", false) { if (!busy) paste() }, Ui.lp(top = d(6)))
        })
    }

    private fun home(rows: List<Row>, sms: Boolean, battery: Boolean): View {
        val stale = System.currentTimeMillis() - store.lastOk > 40 * 60_000
        val listening = sms && !stale && store.lastError == null
        return page {
            tag = "sheet"
            addView(header(true))
            addView(coin(listening, 188))
            addView(Ui.column(context) {
                setPadding(d(24), d(20), d(24), d(26))
                gravity = Gravity.CENTER_HORIZONTAL
                addView(Ui.text(context, if (!sms) "SMS is off" else if (listening) "Listening" else "Not connected", 32f, 0xFFFFFFFF.toInt(), face = Ui.display(context)).apply { gravity = Gravity.CENTER; accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE })
                val seen = if (store.lastOk == 0L) "" else "server seen ${Ui.ago(store.lastOk)}"
                addView(Ui.text(context, if (busy) "Checking…" else listOf(store.business, seen).filter { it.isNotEmpty() }.joinToString(" · "), 15f, Ui.WHITE80).apply { gravity = Gravity.CENTER }, Ui.lp(top = d(4)))
            })
            addView(sheet(rows, sms, battery), Ui.lp(weight = 1f))
        }
    }

    private fun sheet(rows: List<Row>, sms: Boolean, battery: Boolean) = Ui.column(this) {
        val r = d(24).toFloat()
        background = android.graphics.drawable.GradientDrawable().apply { setColor(Ui.MARBLE); cornerRadii = floatArrayOf(r, r, r, r, 0f, 0f, 0f, 0f) }
        setPadding(d(18), d(20), d(18), 0)

        if (!sms) addView(task("Allow SMS", "Mohur cannot hear your bank until you do.", "Allow", Ui.CARNELIAN, Ui.CARNELIAN_WASH) { askSms() })
        else if (store.lastError != null) addView(task("Cannot sync", store.lastError!!.trimEnd('.') + ". Messages are kept and sent when it is back.", "Retry", Ui.AMBER, Ui.AMBER_WASH) { refresh(); render() })
        if (sms && !battery) addView(task("Let Mohur run in the background", "Battery saving can delay confirmations.", "Fix", Ui.AMBER, Ui.AMBER_WASH) { askBattery() })

        val today = Calendar.getInstance().apply { set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }.timeInMillis
        val (n, sum) = store.confirmedSince(today)
        addView(Ui.row(context) {
            background = Ui.rounded(context, Ui.PAPER, 14, Ui.LINE)
            setPadding(d(18), d(16), d(18), d(16))
            addView(Ui.column(context) {
                addView(Ui.text(context, "Confirmed by this phone today", 14f, Ui.INK3))
                addView(Ui.text(context, Ui.rupees(sum), 32f, Ui.INK, true).apply { letterSpacing = -0.02f })
            }, Ui.lp(0, WRAP_CONTENT, 1f))
            addView(Ui.column(context) {
                gravity = Gravity.END
                addView(Ui.text(context, if (n == 1) "payment" else "payments", 14f, Ui.INK3).apply { gravity = Gravity.END })
                addView(Ui.text(context, "$n", 32f, Ui.INK, true).apply { gravity = Gravity.END })
            }, Ui.lp(WRAP_CONTENT))
        })

        addView(Ui.text(context, "Bank SMS", 21f, Ui.INK, face = Ui.display(context)), Ui.lp(top = d(24)))
        if (rows.isEmpty()) addView(Ui.text(context, "Nothing yet. When your bank texts you about a credit, it will appear here.", 15f, Ui.INK3), Ui.lp(top = d(8)))
        else addView(Ui.column(context) {
            background = Ui.rounded(context, Ui.PAPER, 14, Ui.LINE)
            rows.forEachIndexed { i, a ->
                if (i > 0) addView(View(context).apply { setBackgroundColor(Ui.LINE) }, Ui.lp(h = 1.coerceAtLeast(d(1))))
                addView(alert(a))
            }
        }, Ui.lp(top = d(12)))
        addView(View(context), Ui.lp(h = d(28)))
        addView(View(context).apply { tag = "foot" }, Ui.lp(h = WRAP_CONTENT))
    }

    private fun task(title: String, body: String, action: String, ink: Int, wash: Int, onClick: () -> Unit) = Ui.row(this) {
        background = Ui.rounded(context, wash, 14)
        setPadding(d(16), d(14), d(12), d(14))
        addView(Ui.column(context) {
            addView(Ui.text(context, title, 16f, ink, true))
            addView(Ui.text(context, body, 14f, Ui.INK2), Ui.lp(top = d(2)))
        }, Ui.lp(0, WRAP_CONTENT, 1f))
        addView(Ui.text(context, action, 15f, 0xFFFFFFFF.toInt(), true).apply {
            background = Ui.ripple(context, Ui.rounded(context, Ui.EMERALD, 9), 9, 0x44FFFFFF)
            gravity = Gravity.CENTER
            minHeight = d(48)
            minWidth = d(72)
            setPadding(d(16), 0, d(16), 0)
            isClickable = true; isFocusable = true
            accessibilityDelegate = Ui.asButton
            setOnClickListener { onClick() }
        }, Ui.lp(WRAP_CONTENT).apply { marginStart = d(12) })
    }.also { it.layoutParams = Ui.lp().apply { bottomMargin = d(12) } }

    private fun alert(a: Row) = Ui.row(this) {
        setPadding(d(16), d(13), d(16), d(13))
        val (label, ink) = when (a.outcome) {
            null -> "Waiting to send" to Ui.AMBER
            "matched" -> "Payment confirmed" to Ui.JADE
            "duplicate" -> "Already confirmed" to Ui.INK3
            "unmatched", "ambiguous" -> "Needs your review" to Ui.AMBER
            "suspicious" -> "Suspicious" to Ui.CARNELIAN
            else -> "Not a payment" to Ui.INK3
        }
        addView(Ui.column(context) {
            addView(Ui.text(context, label, 16f, ink, true))
            addView(Ui.text(context, listOfNotNull(Filter.header(a.sender) ?: a.sender, Ui.ago(a.receivedAt)).joinToString(" · "), 14f, Ui.INK3))
            a.paymentId?.let { addView(Ui.text(context, it, 13f, Ui.INK3, face = Ui.mono(context))) }
        }, Ui.lp(0, WRAP_CONTENT, 1f))
        a.amount?.let { addView(Ui.text(context, Ui.rupees(it), 19f, Ui.INK, true), Ui.lp(WRAP_CONTENT)) }
    }

    private companion object {
        const val SCAN = 1
        const val CAMERA = 2
        const val SMS = 3
        val SCROLL = View.generateViewId()
    }
}
