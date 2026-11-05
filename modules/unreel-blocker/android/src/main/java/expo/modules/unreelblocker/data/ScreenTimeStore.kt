package expo.modules.unreelblocker.data

import android.content.Context
import android.content.SharedPreferences
import java.util.Calendar

/**
 * Time spent in each part of YouTube and Instagram, per day, kept on-device only.
 *
 * Layout: `d:<yyyy-MM-dd>:<app>:<category>` → Long ms. Days older than
 * [StatsStore.RETENTION_DAYS] are pruned at most once a day. Only the accessibility service
 * writes; the dashboards read.
 */
class ScreenTimeStore(context: Context) {
  private val sp: SharedPreferences =
    context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  /** One day: app → category → ms. */
  data class DayUsage(val date: String, val ms: Map<String, Map<String, Long>>) {
    fun total(app: String): Long = ms[app]?.values?.sum() ?: 0L

    fun of(app: String, category: String): Long = ms[app]?.get(category) ?: 0L

    fun toMap(): Map<String, Any?> = mapOf(
      "date" to date,
      "apps" to SCREEN_CATEGORIES.mapValues { (app, categories) ->
        categories.associateWith { of(app, it).toDouble() }
      },
    )
  }

  @Synchronized
  fun add(slice: UsageMeter.Slice) {
    val editor = sp.edit()
    var latestDay: String? = null
    for ((day, ms) in slice.byDay()) {
      val key = "d:$day:${slice.app}:${slice.category}"
      editor.putLong(key, sp.getLong(key, 0L) + ms)
      latestDay = day
    }
    editor.apply()
    latestDay?.let(::pruneIfNeeded)
  }

  @Synchronized
  fun day(date: String): DayUsage {
    val prefix = "d:$date:"
    val ms = HashMap<String, HashMap<String, Long>>()
    for ((key, value) in sp.all) {
      if (!key.startsWith(prefix) || value !is Long) continue
      val parts = key.removePrefix(prefix).split(':')
      if (parts.size != 2) continue
      ms.getOrPut(parts[0]) { HashMap() }[parts[1]] = value
    }
    return DayUsage(date, ms)
  }

  /** The last [days] days, oldest first, including empty days. */
  @Synchronized
  fun lastDays(days: Int, nowMs: Long = System.currentTimeMillis()): List<DayUsage> {
    val cal = Calendar.getInstance().apply { timeInMillis = nowMs }
    cal.add(Calendar.DAY_OF_YEAR, -(days - 1))
    return (0 until days).map {
      val usage = day(StatsStore.dayKey(cal.timeInMillis))
      cal.add(Calendar.DAY_OF_YEAR, 1)
      usage
    }
  }

  @Synchronized
  fun reset() {
    sp.edit().clear().apply()
  }

  private fun pruneIfNeeded(today: String) {
    if (sp.getString(K_LAST_PRUNE, null) == today) return
    val cal = Calendar.getInstance()
    cal.add(Calendar.DAY_OF_YEAR, -StatsStore.RETENTION_DAYS)
    val cutoff = StatsStore.dayKey(cal.timeInMillis)
    val editor = sp.edit()
    sp.all.keys
      .filter { it.startsWith("d:") && it.substring(2, 12) < cutoff } // yyyy-MM-dd sorts lexicographically
      .forEach { editor.remove(it) }
    editor.putString(K_LAST_PRUNE, today).apply()
  }

  companion object {
    private const val FILE = "unreel_screentime"
    private const val K_LAST_PRUNE = "lastPrune"
  }
}

/** The parts each app's time is shown in, in display order. Rules may only use these ids. */
val SCREEN_CATEGORIES: Map<String, List<String>> = linkedMapOf(
  "youtube" to listOf("shorts", "video", "other"),
  "instagram" to listOf("scrolling", "normal", "chat", "other"),
)
