package `in`.mohur.app

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.content.res.ColorStateList
import android.graphics.fonts.Font
import android.graphics.fonts.FontFamily
import android.os.Build
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import java.text.NumberFormat
import java.util.Locale

/** The Mohur palette and type, shared with the web app. */
object Ui {
    const val DEEP = 0xFF06241C.toInt()
    const val EMERALD = 0xFF0C3B2E.toInt()
    const val PAPER = 0xFFFCFDFB.toInt()
    const val MARBLE = 0xFFF1F4F1.toInt()
    const val LINE = 0xFFD9E0DA.toInt()
    const val INK = 0xFF0F231D.toInt()
    const val INK2 = 0xFF43564E.toInt()
    const val INK3 = 0xFF63736B.toInt()
    const val JADE = 0xFF1B7A58.toInt()
    const val JADE_WASH = 0xFFE0F0E8.toInt()
    const val BRASS = 0xFFB8934A.toInt()
    const val BRASS_LT = 0xFFE3CB93.toInt()
    const val AMBER = 0xFF8F560A.toInt()
    const val AMBER_WASH = 0xFFFAEED7.toInt()
    const val CARNELIAN = 0xFFAB3423.toInt()
    const val CARNELIAN_WASH = 0xFFF8E5E1.toInt()
    val GOLD = intArrayOf(0xFFC79F52.toInt(), 0xFFEFDCA9.toInt(), 0xFFD3B068.toInt(), 0xFFB48C3F.toInt())
    val WHITE80 = Color.argb(205, 255, 255, 255)

    private val cache = HashMap<String, Typeface>()
    fun display(c: Context) = cache.getOrPut("d") { c.resources.getFont(R.font.marcellus) }
    fun mono(c: Context) = cache.getOrPut("m") { c.resources.getFont(R.font.jetbrains_mono) }
    fun sans(c: Context, bold: Boolean = false) = cache.getOrPut("s$bold") {
        val latin = if (bold) R.font.hanken_600 else R.font.hanken_400
        val ext = if (bold) R.font.hanken_ext_600 else R.font.hanken_ext_400
        // The rupee sign lives in the extended file, so chain the two where Android allows it.
        if (Build.VERSION.SDK_INT >= 29) runCatching {
            fun fam(id: Int) = FontFamily.Builder(Font.Builder(c.resources, id).build()).build()
            Typeface.CustomFallbackBuilder(fam(latin)).addCustomFallback(fam(ext)).setSystemFallback("sans-serif").build()
        }.getOrElse { c.resources.getFont(latin) } else c.resources.getFont(latin)
    }

    fun dp(c: Context, v: Number) = (v.toFloat() * c.resources.displayMetrics.density + 0.5f).toInt()

    fun rupees(paise: Long): String = "₹" + NumberFormat.getNumberInstance(Locale("en", "IN")).apply {
        minimumFractionDigits = if (paise % 100 == 0L) 0 else 2
        maximumFractionDigits = minimumFractionDigits
    }.format(paise / 100.0)

    fun ago(t: Long, now: Long = System.currentTimeMillis()): String {
        val s = ((now - t) / 1000).coerceAtLeast(0)
        return when {
            s < 10 -> "just now"
            s < 60 -> "$s s ago"
            s < 3600 -> "${s / 60} min ago"
            s < 86_400 -> "${s / 3600} h ago"
            else -> java.text.SimpleDateFormat("d MMM", Locale("en", "IN")).format(t)
        }
    }

    fun text(c: Context, s: CharSequence, sp: Float, color: Int, bold: Boolean = false, face: Typeface = sans(c, bold)) = TextView(c).apply {
        text = s
        textSize = sp
        setTextColor(color)
        typeface = face
        setLineSpacing(0f, 1.12f)
        fontFeatureSettings = "tnum"
    }

    fun rounded(c: Context, color: Int, r: Number, stroke: Int? = null) = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(c, r).toFloat()
        if (stroke != null) setStroke(dp(c, 1).coerceAtLeast(1), stroke)
    }

    fun ripple(c: Context, base: Drawable?, r: Number, tint: Int = 0x22000000) = RippleDrawable(ColorStateList.valueOf(tint), base, rounded(c, Color.WHITE, r))

    fun button(c: Context, label: String, gold: Boolean, onClick: () -> Unit) = text(c, label, 16f, if (gold) DEEP else BRASS_LT, true).apply {
        gravity = Gravity.CENTER
        minimumHeight = dp(c, 54)
        setPadding(dp(c, 20), dp(c, 12), dp(c, 20), dp(c, 12))
        background = if (gold) ripple(c, GradientDrawable(GradientDrawable.Orientation.TL_BR, GOLD).apply { cornerRadius = dp(c, 11).toFloat() }, 11) else ripple(c, null, 11, 0x33FFFFFF)
        isClickable = true
        isFocusable = true
        accessibilityDelegate = asButton
        setOnClickListener { onClick() }
    }

    val asButton = object : View.AccessibilityDelegate() {
        override fun onInitializeAccessibilityNodeInfo(host: View, info: android.view.accessibility.AccessibilityNodeInfo) {
            super.onInitializeAccessibilityNodeInfo(host, info)
            info.className = "android.widget.Button"
        }
    }

    fun column(c: Context, build: LinearLayout.() -> Unit) = LinearLayout(c).apply { orientation = LinearLayout.VERTICAL; build() }
    fun row(c: Context, build: LinearLayout.() -> Unit) = LinearLayout(c).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; build() }
    fun lp(w: Int = ViewGroup.LayoutParams.MATCH_PARENT, h: Int = ViewGroup.LayoutParams.WRAP_CONTENT, weight: Float = 0f, top: Int = 0) =
        LinearLayout.LayoutParams(w, h, weight).apply { topMargin = top }
}
