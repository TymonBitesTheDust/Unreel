package expo.modules.unreelblocker.widget

import expo.modules.unreelblocker.data.SCREEN_CATEGORIES

/** How much of the widget fits, from its height on the home screen. */
enum class WidgetSize {
  /** One row: each app's total side by side. */
  COMPACT,
  /** Title, and each app's total over a bar. */
  MEDIUM,
  /** As MEDIUM, plus a line under each bar naming the parts. */
  FULL;

  companion object {
    const val MEDIUM_MIN_HEIGHT_DP = 120
    const val FULL_MIN_HEIGHT_DP = 160

    /** [heightDp] 0 means the launcher didn't say: assume the default 4×2 size. */
    fun forHeight(heightDp: Int): WidgetSize = when {
      heightDp <= 0 -> MEDIUM
      heightDp < MEDIUM_MIN_HEIGHT_DP -> COMPACT
      heightDp < FULL_MIN_HEIGHT_DP -> MEDIUM
      else -> FULL
    }
  }
}

/** The widget's words, kept out of the Android code so they're unit-tested. */
object WidgetText {
  private val SHORT_LABELS = mapOf(
    "youtube.shorts" to "Shorts",
    "youtube.video" to "Videos",
    "youtube.other" to "Not watching",
    "instagram.scrolling" to "Scrolling",
    "instagram.normal" to "Posts & Stories",
    "instagram.chat" to "Chat",
    "instagram.other" to "Other",
  )

  /** Short form for the legend line: "0m", "<1m", "52m", "2h", "1h 10m". */
  fun compactDuration(ms: Long): String {
    if (ms <= 0L) return "0m"
    val minutes = ms / 60_000L
    if (minutes == 0L) return "<1m"
    val h = minutes / 60
    val m = minutes % 60
    return when {
      h == 0L -> "${m}m"
      m == 0L -> "${h}h"
      else -> "${h}h ${m}m"
    }
  }

  /** One entry per part, in display order: (category, "Videos 52m"). */
  fun legend(app: String, usage: Map<String, Long>): List<Pair<String, String>> =
    (SCREEN_CATEGORIES[app] ?: emptyList()).map { category ->
      category to "${SHORT_LABELS["$app.$category"] ?: category} ${compactDuration(usage[category] ?: 0L)}"
    }
}

/** "0 min", "under 1 min", "45 min", "2 h", "1 h 12 min": the dashboards' format. */
object ScreenTimeFormat {
  fun duration(ms: Long): String {
    if (ms <= 0L) return "0 min"
    val minutes = ms / 60_000L
    if (minutes == 0L) return "under 1 min"
    val h = minutes / 60
    val m = minutes % 60
    return when {
      h == 0L -> "$m min"
      m == 0L -> "$h h"
      else -> "$h h $m min"
    }
  }
}
