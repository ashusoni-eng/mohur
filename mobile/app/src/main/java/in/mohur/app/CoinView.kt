package `in`.mohur.app

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.Shader
import android.graphics.drawable.Drawable
import android.view.View
import android.view.animation.LinearInterpolator
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/** Engraved banknote line: a circle whose radius is modulated by two waves. */
internal fun rosette(out: Path, r: Float, a: Float, k: Int, b: Float, j: Int, phase: Float) {
    val steps = maxOf(240, k * 14)
    for (i in 0..steps) {
        val t = i * 2 * PI / steps
        val rr = r + a * sin(k * t + phase) + b * cos(j * t)
        val x = (rr * cos(t)).toFloat()
        val y = (rr * sin(t)).toFloat()
        if (i == 0) out.moveTo(x, y) else out.lineTo(x, y)
    }
    out.close()
}

private fun bands(vararg spec: FloatArray) = Path().apply {
    for (s in spec) {
        val n = s[5].toInt()
        repeat(n) { rosette(this, s[0], s[1], s[2].toInt(), s[3], s[4].toInt(), (it * 2 * PI / n).toFloat()) }
    }
}

/** The guilloche that sits behind every Mohur screen. Drawn in a 600-unit square. */
class Guilloche(color: Int, private val cx: Float, private val cy: Float, private val scale: Float) : Drawable() {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; this.color = color }
    private val path = bands(floatArrayOf(262f, 22f, 24f, 0f, 1f, 6f), floatArrayOf(190f, 34f, 16f, 6f, 8f, 6f), floatArrayOf(116f, 26f, 12f, 5f, 24f, 6f))

    override fun draw(canvas: Canvas) {
        val k = bounds.width() * scale / 600f
        paint.strokeWidth = 1.1f / k * (bounds.width() / 1080f).coerceAtLeast(0.6f)
        canvas.save()
        canvas.clipRect(bounds)
        canvas.drawColor(Ui.DEEP)
        canvas.translate(bounds.left + bounds.width() * cx, bounds.top + bounds.width() * cy)
        canvas.scale(k, k)
        canvas.drawPath(path, paint)
        canvas.restore()
    }

    override fun setAlpha(a: Int) { paint.alpha = a }
    override fun setColorFilter(f: ColorFilter?) { paint.colorFilter = f }
    @Deprecated("Deprecated in Java") override fun getOpacity() = PixelFormat.OPAQUE
}

/** The coin. Struck in gold with a slow glint round its edge while listening; a bare blank when not. */
class CoinView(ctx: Context) : View(ctx) {
    var live = true
        set(v) { if (field != v) { field = v; run(); invalidate() } }
    private var glint = -1f
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeJoin = Paint.Join.ROUND; strokeCap = Paint.Cap.ROUND }
    private val engraving = bands(floatArrayOf(128f, 11f, 24f, 0f, 1f, 4f), floatArrayOf(98f, 15f, 16f, 3f, 8f, 4f))
    private val anim = ValueAnimator.ofFloat(0f, 60f).apply {
        duration = 4200
        repeatCount = ValueAnimator.INFINITE
        interpolator = LinearInterpolator()
        addUpdateListener { glint = it.animatedValue as Float; invalidate() }
    }

    private fun run() {
        if (live && isAttachedToWindow && ValueAnimator.areAnimatorsEnabled()) anim.start() else { anim.cancel(); glint = -1f }
    }

    override fun onAttachedToWindow() { super.onAttachedToWindow(); run() }
    override fun onDetachedFromWindow() { anim.cancel(); super.onDetachedFromWindow() }

    override fun onDraw(c: Canvas) {
        val k = min(width, height) / 360f
        c.save()
        c.translate(width / 2f, height / 2f)
        c.scale(k, k)
        // Sixty reeds, as on the web checkout.
        line.strokeWidth = 4.2f
        for (i in 0 until 60) {
            val behind = if (glint < 0) 60f else (glint - i + 60f) % 60f
            val glow = if (live && behind < 12f) 1f - behind / 12f else 0f
            line.color = if (!live) 0x33FFFFFF else blend(0xFFA07C38.toInt(), 0xFFFFF0C4.toInt(), glow)
            c.save()
            c.rotate(i * 6f)
            c.drawLine(0f, -176f, 0f, -163f, line)
            c.restore()
        }
        if (live) {
            fill.shader = LinearGradient(-140f, -140f, 140f, 140f, Ui.GOLD, floatArrayOf(0f, .42f, .58f, 1f), Shader.TileMode.CLAMP)
            c.drawCircle(0f, 0f, 146f, fill)
            fill.shader = null
            line.color = 0x40FFFFFF
            line.strokeWidth = 7f
            c.drawCircle(0f, 0f, 142f, line)
            line.color = 0x667A5A1C
            line.strokeWidth = 0.9f
            c.drawPath(engraving, line)
            line.color = 0xFF5F4512.toInt()
        } else {
            line.color = 0x40FFFFFF
            line.strokeWidth = 2f
            c.drawCircle(0f, 0f, 146f, line)
            line.color = 0x99FFFFFF.toInt()
        }
        star(c)
        c.restore()
    }

    private fun star(c: Canvas) {
        val ink = line.color
        line.strokeWidth = 5f
        for (i in 0 until 48) {
            c.save(); c.rotate(i * 7.5f); c.drawLine(0f, -70f, 0f, -62f, line); c.restore()
        }
        line.strokeWidth = 2.4f
        c.drawCircle(0f, 0f, 55f, line)
        line.strokeWidth = 4.6f
        repeat(2) { c.save(); c.rotate(it * 45f); c.drawRect(-27f, -27f, 27f, 27f, line); c.restore() }
        fill.color = ink
        c.drawCircle(0f, 0f, 8f, fill)
    }

    private fun blend(a: Int, b: Int, t: Float) = android.animation.ArgbEvaluator().evaluate(t, a, b) as Int
}
