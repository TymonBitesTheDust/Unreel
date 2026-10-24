package expo.modules.unreelblocker.intervention

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import expo.modules.unreelblocker.R

/**
 * Full-screen "you were about to doomscroll" card.
 *
 * Uses TYPE_ACCESSIBILITY_OVERLAY, which an enabled accessibility service may add without the
 * SYSTEM_ALERT_WINDOW ("Display over other apps") permission — one less scary permission to ask
 * for. It is shown *after* the service has already navigated away, so nothing keeps playing
 * underneath it; it exists to create a moment of friction, not to hide content.
 *
 * Main thread only.
 */
class BlockOverlay(private val service: AccessibilityService) {
  private val windowManager = service.getSystemService(Context.WINDOW_SERVICE) as WindowManager
  private val handler = Handler(Looper.getMainLooper())
  private var view: View? = null
  private val autoDismiss = Runnable { hide() }

  fun show(app: String, todayTotal: Int) {
    hide()
    val root = buildView(app, todayTotal)
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
      // NOT_FOCUSABLE: key events (BACK) must still reach the app underneath, otherwise the
      // service's escalation can't navigate while the card is up. Touches are still ours because
      // the window is full-screen and touchable.
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT,
    )
    try {
      windowManager.addView(root, params)
      view = root
      handler.postDelayed(autoDismiss, AUTO_DISMISS_MS)
    } catch (_: RuntimeException) {
      // The service can be torn down between the decision and the draw; nothing to clean up.
    }
  }

  fun hide() {
    handler.removeCallbacks(autoDismiss)
    val v = view ?: return
    view = null
    try {
      windowManager.removeView(v)
    } catch (_: RuntimeException) {
      // Already detached.
    }
  }

  private fun buildView(app: String, todayTotal: Int): View {
    val ctx = service
    val titleRes = if (app == "youtube") R.string.unreel_overlay_title_youtube else R.string.unreel_overlay_title_instagram

    val title = TextView(ctx).apply {
      text = ctx.getString(titleRes)
      setTextColor(ON_BRAND)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 30f)
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      gravity = Gravity.CENTER
    }
    val body = TextView(ctx).apply {
      text = ctx.getString(R.string.unreel_overlay_body)
      setTextColor(ON_BRAND_MUTED)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
      gravity = Gravity.CENTER
      setPadding(0, dp(12), 0, 0)
    }
    val count = TextView(ctx).apply {
      text = ctx.getString(R.string.unreel_overlay_count, todayTotal)
      setTextColor(SIGNAL)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      gravity = Gravity.CENTER
      setPadding(0, dp(28), 0, dp(28))
    }
    val button = Button(ctx).apply {
      text = ctx.getString(R.string.unreel_overlay_button)
      setAllCaps(false)
      setTextColor(BRAND)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
      background = GradientDrawable().apply {
        cornerRadius = dp(28).toFloat()
        setColor(ON_BRAND)
      }
      setPadding(dp(24), dp(14), dp(24), dp(14))
      setOnClickListener { hide() }
    }

    return LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(BRAND)
      setPadding(dp(32), dp(32), dp(32), dp(32))
      addView(title)
      addView(body)
      addView(count)
      addView(button, LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.WRAP_CONTENT,
        LinearLayout.LayoutParams.WRAP_CONTENT,
      ))
      // Swallow touches so taps don't fall through to the app underneath.
      isClickable = true
    }
  }

  private fun dp(value: Int): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), service.resources.displayMetrics).toInt()

  companion object {
    private const val AUTO_DISMISS_MS = 6_000L
    // Mirrors src/theme.ts (the dashboard's status block), so the card feels like part of the app.
    private val BRAND = Color.parseColor("#2B3BD6")
    private val ON_BRAND = Color.WHITE
    private val ON_BRAND_MUTED = Color.parseColor("#C9CEF7")
    private val SIGNAL = Color.parseColor("#FFB020")
  }
}
