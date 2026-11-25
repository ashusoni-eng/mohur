package `in`.mohur.app

import android.Manifest
import android.app.Application
import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.io.File

/** Draws each screen to a PNG when MOHUR_SHOTS names a folder. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w400dp-h880dp-xxhdpi")
class ScreensTest {
    private val app get() = RuntimeEnvironment.getApplication() as Application
    @Before fun up() {
        Store.reset()
        app.deleteDatabase("mohur.db")
        KeyBox.instance = object : KeyBox { override fun seal(plain: String) = plain; override fun open(sealed: String) = sealed }
    }
    private fun shot(name: String) {
        val dir = System.getenv("MOHUR_SHOTS")
        val a = Robolectric.buildActivity(MainActivity::class.java).setup().get()
        shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(100))
        val v: View = a.window.decorView
        val d = app.resources.displayMetrics
        v.measure(View.MeasureSpec.makeMeasureSpec(d.widthPixels, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(d.heightPixels, View.MeasureSpec.EXACTLY))
        v.layout(0, 0, d.widthPixels, d.heightPixels)
        val bmp = Bitmap.createBitmap(d.widthPixels, d.heightPixels, Bitmap.Config.ARGB_8888)
        v.draw(Canvas(bmp))
        if (dir != null) File(dir, "$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
    private fun pair() {
        val s = Store.get(app)
        s.pairing = Pairing("http://127.0.0.1:9", "dev_abcdefgh1234", "k".repeat(43), 0)
        s.business = "Terra Studio"; s.headers = setOf("HDFCBK"); s.lastOk = System.currentTimeMillis() - 4000
        val now = System.currentTimeMillis()
        listOf(Triple("499.00", "matched", 49900L), Triple("1,499.01", "duplicate", 149901L), Triple("77.00", "unmatched", 7700L), Triple("12,250.50", "matched", 1225050L), Triple("20.00", null, null)).forEachIndexed { i, (amt, out, p) ->
            val body = "Rs.$amt credited to A/c XX4321"
            s.offer("VM-HDFCBK-S", body, now - i, now - i * 900_000L)
            if (out != null) s.done(Filter.id("VM-HDFCBK-S", body, now - i), out, p, if (out == "matched") "7F3A9C21B${i}" else null)
        }
    }
    @Test fun welcome() = shot("welcome")
    @Test fun needsSms() { pair(); shot("needs-sms") }
    @Test fun listening() {
        pair()
        shadowOf(app).grantPermissions(Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS)
        shadowOf(app.getSystemService(android.os.PowerManager::class.java)).setIgnoringBatteryOptimizations(app.packageName, true)
        shot("listening")
    }
    @Test @Config(qualifiers = "w320dp-h568dp-xhdpi") fun smallPhone() { pair(); shot("small") }
    @Test @Config(qualifiers = "w320dp-h568dp-xhdpi", fontScale = 1.3f) fun smallWelcome() = shot("small-welcome")
}
