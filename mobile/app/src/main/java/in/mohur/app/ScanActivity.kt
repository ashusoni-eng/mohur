@file:Suppress("DEPRECATION")

package `in`.mohur.app

import android.app.Activity
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.SurfaceTexture
import android.hardware.Camera
import android.os.Bundle
import android.view.Gravity
import android.view.Surface
import android.view.TextureView
import android.view.View
import android.widget.FrameLayout
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Reads one QR code. Frames stay in memory and are never saved. */
class ScanActivity : Activity(), TextureView.SurfaceTextureListener {
    private var cam: Camera? = null
    private val work = Executors.newSingleThreadExecutor()
    private val decoding = AtomicBoolean()
    private val found = AtomicBoolean()
    private lateinit var view: TextureView

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        view = TextureView(this).apply { surfaceTextureListener = this@ScanActivity }
        val root = FrameLayout(this)
        root.addView(view)
        root.addView(Finder())
        root.addView(Ui.text(this, "Scan the pairing code", 27f, -1, face = Ui.display(this)).apply { gravity = Gravity.CENTER }, FrameLayout.LayoutParams(-1, -2, Gravity.TOP).apply { topMargin = Ui.dp(this@ScanActivity, 92) })
        root.addView(Ui.text(this, "In Mohur on your computer, open Configuration, then Phone (SMS).", 16f, Ui.WHITE80).apply { gravity = Gravity.CENTER }, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM).apply { val m = Ui.dp(this@ScanActivity, 36); setMargins(m, 0, m, Ui.dp(this@ScanActivity, 132)) })
        root.addView(Ui.button(this, "Cancel", false) { finish() }, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM).apply { val m = Ui.dp(this@ScanActivity, 26); setMargins(m, 0, m, Ui.dp(this@ScanActivity, 56)) })
        setContentView(root)
    }

    override fun onSurfaceTextureAvailable(st: SurfaceTexture, w: Int, h: Int) = open(st)
    override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, w: Int, h: Int) = fit()
    override fun onSurfaceTextureUpdated(st: SurfaceTexture) = Unit
    override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean { release(); return true }

    override fun onResume() { super.onResume(); if (cam == null && view.isAvailable) open(view.surfaceTexture!!) }
    override fun onPause() { release(); super.onPause() }
    override fun onDestroy() { work.shutdown(); super.onDestroy() }

    private fun open(st: SurfaceTexture) {
        try {
            val id = (0 until Camera.getNumberOfCameras()).firstOrNull { Camera.CameraInfo().also { i -> Camera.getCameraInfo(it, i) }.facing == Camera.CameraInfo.CAMERA_FACING_BACK } ?: 0
            val info = Camera.CameraInfo().also { Camera.getCameraInfo(id, it) }
            val c = Camera.open(id)
            cam = c
            val p = c.parameters
            // Large enough to resolve a dense code, small enough to decode several times a second.
            p.supportedPreviewSizes.filter { it.width <= 1920 && it.height <= 1080 }.maxByOrNull { if (it.width * 9 == it.height * 16) it.width * it.height + 1 else it.width * it.height }?.let { p.setPreviewSize(it.width, it.height) }
            if (Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE in p.supportedFocusModes.orEmpty()) p.focusMode = Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE
            c.parameters = p
            val rot = when (windowManager.defaultDisplay.rotation) { Surface.ROTATION_90 -> 90; Surface.ROTATION_180 -> 180; Surface.ROTATION_270 -> 270; else -> 0 }
            c.setDisplayOrientation((info.orientation - rot + 360) % 360)
            c.setPreviewTexture(st)
            c.setPreviewCallback { data, camera -> decode(data, camera.parameters.previewSize.width, camera.parameters.previewSize.height) }
            c.startPreview()
            fit()
        } catch (e: Exception) {
            release()
            finish()
        }
    }

    /** Fill the screen without stretching: the preview is landscape, the screen portrait. */
    private fun fit() {
        val s = runCatching { cam?.parameters?.previewSize }.getOrNull() ?: return
        val want = s.height.toFloat() / s.width
        val have = view.width.toFloat() / view.height
        view.scaleX = if (want > have) want / have else 1f
        view.scaleY = if (want > have) 1f else have / want
    }

    private fun decode(data: ByteArray?, w: Int, h: Int) {
        if (data == null || found.get() || !decoding.compareAndSet(false, true)) return
        work.execute {
            try {
                val src = PlanarYUVLuminanceSource(data, w, h, 0, 0, w, h, false)
                val text = QRCodeReader().decode(BinaryBitmap(HybridBinarizer(src)), mapOf(DecodeHintType.TRY_HARDER to true)).text
                if (found.compareAndSet(false, true)) runOnUiThread { setResult(RESULT_OK, Intent().putExtra("text", text)); finish() }
            } catch (e: Exception) {
                // No code in this frame.
            } finally {
                decoding.set(false)
            }
        }
    }

    private fun release() {
        cam?.run { setPreviewCallback(null); runCatching { stopPreview() }; release() }
        cam = null
    }

    private inner class Finder : View(this) {
        private val shade = Paint().apply { color = 0xB806241C.toInt() }
        private val reed = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Ui.BRASS_LT; strokeCap = Paint.Cap.ROUND }
        override fun onDraw(c: Canvas) {
            val r = width * 0.39f
            val x = width / 2f
            val y = height / 2f
            c.save()
            val hole = android.graphics.Path().apply { addCircle(x, y, r, android.graphics.Path.Direction.CW) }
            if (android.os.Build.VERSION.SDK_INT >= 26) c.clipOutPath(hole)
            c.drawRect(0f, 0f, width.toFloat(), height.toFloat(), shade)
            c.restore()
            reed.strokeWidth = r * 0.024f
            repeat(60) { c.save(); c.rotate(it * 6f, x, y); c.drawLine(x, y - r * 1.02f, x, y - r * 1.1f, reed); c.restore() }
        }
    }
}
