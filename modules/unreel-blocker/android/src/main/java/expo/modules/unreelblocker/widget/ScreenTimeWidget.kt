package expo.modules.unreelblocker.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.util.Log
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import expo.modules.unreelblocker.R
import expo.modules.unreelblocker.data.QuotaClock
import expo.modules.unreelblocker.data.ScreenTimeStore
import expo.modules.unreelblocker.data.StatsStore
import expo.modules.unreelblocker.service.ServiceStatus
import java.util.TimeZone

/**
 * Home-screen widget: today's time in YouTube and Instagram, split into parts, and how many
 * Shorts and Reels Unreel stopped. A standard app widget, so it works in any launcher, including
 * Samsung's One UI. Tapping it opens Unreel.
 *
 * The widget can't host custom views, so the bars are bitmaps and the legend dots are coloured
 * text. Those colours are baked in when the widget is drawn, so they're one set that reads on
 * both the light and the dark background (the dataviz palette's dark steps, checked against
 * both); everything else uses night-aware colour resources and follows the system theme.
 *
 * Kept fresh by: the accessibility service when YouTube or Instagram leaves the screen, the
 * dashboard when it closes, a refresh just after midnight, and the system every 30 minutes.
 */
class ScreenTimeWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ScreenTimeWidget.update(context, manager, ids)
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    ScreenTimeWidget.update(context, manager, intArrayOf(id)) // Resized: redraw the bars at the new width.
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == ScreenTimeWidget.ACTION_REFRESH) ScreenTimeWidget.updateAll(context)
  }
}

object ScreenTimeWidget {
  const val ACTION_REFRESH = "expo.modules.unreelblocker.widget.REFRESH"
  private const val TAG = "UnreelWidget"

  /** Redraws every Unreel widget on the home screen. Cheap when there are none. Any thread. */
  fun updateAll(context: Context) {
    try {
      val manager = AppWidgetManager.getInstance(context) ?: return
      val ids = manager.getAppWidgetIds(ComponentName(context, ScreenTimeWidgetProvider::class.java))
      if (ids.isNotEmpty()) update(context, manager, ids)
    } catch (e: RuntimeException) {
      Log.w(TAG, "Couldn't update widgets", e) // Launcher or system server busy; the next update retries.
    }
  }

  fun update(context: Context, manager: AppWidgetManager, ids: IntArray) {
    val data = Data.load(context)
    for (id in ids) {
      try {
        manager.updateAppWidget(id, views(context, manager.getAppWidgetOptions(id), data))
      } catch (e: RuntimeException) {
        Log.w(TAG, "Couldn't update widget $id", e)
      }
    }
    scheduleMidnightRefresh(context)
  }

  private class Data(val today: ScreenTimeStore.DayUsage, val stopped: Int, val ready: Boolean) {
    companion object {
      fun load(context: Context): Data {
        val today = StatsStore.dayKey(System.currentTimeMillis())
        return Data(
          ScreenTimeStore(context).day(today),
          StatsStore(context).day(today).total,
          ServiceStatus.isEnabledInSettings(context),
        )
      }
    }
  }

  private fun views(context: Context, options: Bundle?, data: Data): RemoteViews {
    // Portrait: width is the minimum, height the maximum the launcher reports.
    val widthDp = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)?.takeIf { it > 0 } ?: DEFAULT_WIDTH_DP
    if (Build.VERSION.SDK_INT >= 31) {
      // The launcher picks the largest layout that fits, and re-picks on resize without asking us.
      return RemoteViews(
        mapOf(
          SizeF(110f, 40f) to build(context, data, WidgetSize.COMPACT, widthDp),
          SizeF(180f, WidgetSize.MEDIUM_MIN_HEIGHT_DP.toFloat()) to build(context, data, WidgetSize.MEDIUM, widthDp),
          SizeF(180f, WidgetSize.FULL_MIN_HEIGHT_DP.toFloat()) to build(context, data, WidgetSize.FULL, widthDp),
        ),
      )
    }
    val heightDp = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT) ?: 0
    return build(context, data, WidgetSize.forHeight(heightDp), widthDp)
  }

  private fun build(context: Context, data: Data, size: WidgetSize, widthDp: Int): RemoteViews {
    val v = RemoteViews(context.packageName, R.layout.unreel_widget)
    openApp(context)?.let { v.setOnClickPendingIntent(android.R.id.background, it) }

    if (!data.ready) {
      v.setViewVisibility(R.id.unreel_widget_setup, View.VISIBLE)
      v.setViewVisibility(R.id.unreel_widget_compact, View.GONE)
      v.setViewVisibility(R.id.unreel_widget_full, View.GONE)
      return v
    }
    val youtube = data.today.total("youtube")
    val instagram = data.today.total("instagram")

    v.setViewVisibility(R.id.unreel_widget_compact, if (size == WidgetSize.COMPACT) View.VISIBLE else View.GONE)
    v.setViewVisibility(R.id.unreel_widget_full, if (size == WidgetSize.COMPACT) View.GONE else View.VISIBLE)
    v.setTextViewText(R.id.unreel_widget_youtube_total_compact, ScreenTimeFormat.duration(youtube))
    v.setTextViewText(R.id.unreel_widget_instagram_total_compact, ScreenTimeFormat.duration(instagram))
    if (size == WidgetSize.COMPACT) return v

    v.setTextViewText(R.id.unreel_widget_stopped, context.getString(R.string.unreel_widget_stopped, data.stopped))
    val density = context.resources.displayMetrics.density
    // The bar spans the widget minus its 14dp side padding.
    val barWidthPx = ((widthDp - 28) * density).toInt().coerceAtLeast((40 * density).toInt())
    val barHeightPx = (8 * density).toInt()
    val legend = size == WidgetSize.FULL
    for ((app, total, totalId, barId, legendId) in listOf(
      Row("youtube", youtube, R.id.unreel_widget_youtube_total, R.id.unreel_widget_youtube_bar, R.id.unreel_widget_youtube_legend),
      Row("instagram", instagram, R.id.unreel_widget_instagram_total, R.id.unreel_widget_instagram_bar, R.id.unreel_widget_instagram_legend),
    )) {
      val usage = data.today.ms[app] ?: emptyMap()
      v.setTextViewText(totalId, ScreenTimeFormat.duration(total))
      val parts = WidgetText.legend(app, usage).map { (category, _) -> (usage[category] ?: 0L) to color(category) }
      v.setImageViewBitmap(barId, BarPainter.bitmap(parts, barWidthPx, barHeightPx, 2 * density, 2 * density, EMPTY_TRACK))
      v.setViewVisibility(legendId, if (legend) View.VISIBLE else View.GONE)
      if (legend) v.setTextViewText(legendId, legendText(app, usage))
    }
    return v
  }

  private data class Row(val app: String, val total: Long, val totalId: Int, val barId: Int, val legendId: Int)

  /** "● Shorts 1m  ● Videos 52m  ● Not watching 17m": coloured dots, text in the view's colour. */
  private fun legendText(app: String, usage: Map<String, Long>): CharSequence {
    val text = SpannableStringBuilder()
    for ((category, label) in WidgetText.legend(app, usage)) {
      if (text.isNotEmpty()) text.append("   ")
      val start = text.length
      text.append("●")
      text.setSpan(ForegroundColorSpan(color(category)), start, start + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
      text.append(' ').append(label)
    }
    return text
  }

  /** Same kind of part, same colour, as on the dashboard; one set that reads on light and dark. */
  private fun color(category: String): Int = when (category) {
    "shorts", "scrolling" -> ORANGE
    "video", "normal" -> BLUE
    "chat" -> AQUA
    else -> GRAY
  }

  private fun openApp(context: Context): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    return PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  /** "Today" rolls over at midnight; a non-waking alarm redraws when the phone next wakes after it. */
  private fun scheduleMidnightRefresh(context: Context) {
    val alarms = context.getSystemService(AlarmManager::class.java) ?: return
    val intent = Intent(context, ScreenTimeWidgetProvider::class.java).setAction(ACTION_REFRESH)
    val pending = PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val at = QuotaClock.nextMidnight(System.currentTimeMillis(), TimeZone.getDefault()) + 60_000L
    try {
      alarms.set(AlarmManager.RTC, at, pending)
    } catch (e: RuntimeException) {
      Log.w(TAG, "Couldn't schedule the midnight refresh", e) // The 30-minute system update still runs.
    }
  }

  private const val DEFAULT_WIDTH_DP = 250
  private val ORANGE = Color.parseColor("#D95926")
  private val BLUE = Color.parseColor("#3987E5")
  private val AQUA = Color.parseColor("#199E70")
  private val GRAY = Color.parseColor("#8A90A6")
  private val EMPTY_TRACK = Color.argb(0x59, 0x8A, 0x90, 0xA6)
}
