package expo.modules.unreelblocker.data

import android.content.Context
import android.content.SharedPreferences
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * Per-day block counters, kept on-device only.
 *
 * Layout: `d:<yyyy-MM-dd>:<app>` → Int, plus `all` → Long lifetime total. Days older than
 * [RETENTION_DAYS] are pruned at most once a day. Dates use the device's local time zone, so
 * "today" matches what the user sees on their clock.
 */
class StatsStore(context: Context) {
  private val sp: SharedPreferences =
    context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  data class DayStats(val date: String, val perApp: Map<String, Int>) {
    val total: Int get() = perApp.values.sum()

    fun toMap(): Map<String, Any?> = mapOf(
      "date" to date,
      "total" to total,
      "youtube" to (perApp["youtube"] ?: 0),
      "instagram" to (perApp["instagram"] ?: 0),
    )
  }

  /** Records one block for [app] and returns today's total across all apps. */
  @Synchronized
  fun increment(app: String, nowMs: Long = System.currentTimeMillis()): Int {
    val day = dayKey(nowMs)
    val key = "d:$day:$app"
    sp.edit()
      .putInt(key, sp.getInt(key, 0) + 1)
      .putLong(K_ALL_TIME, sp.getLong(K_ALL_TIME, 0L) + 1)
      .apply()
    pruneIfNeeded(day, nowMs)
    return day(day).total
  }

  @Synchronized
  fun day(date: String): DayStats {
    val prefix = "d:$date:"
    val perApp = sp.all
      .filterKeys { it.startsWith(prefix) }
      .mapNotNull { (k, v) -> (v as? Int)?.let { k.removePrefix(prefix) to it } }
      .toMap()
    return DayStats(date, perApp)
  }

  /** The last [days] days, oldest first, including empty days so charts have no gaps. */
  @Synchronized
  fun lastDays(days: Int, nowMs: Long = System.currentTimeMillis()): List<DayStats> {
    val cal = Calendar.getInstance().apply { timeInMillis = nowMs }
    cal.add(Calendar.DAY_OF_YEAR, -(days - 1))
    return (0 until days).map {
      val stats = day(format(cal.time))
      cal.add(Calendar.DAY_OF_YEAR, 1)
      stats
    }
  }

  fun allTime(): Long = sp.getLong(K_ALL_TIME, 0L)

  @Synchronized
  fun reset() {
    sp.edit().clear().apply()
  }

  private fun pruneIfNeeded(today: String, nowMs: Long) {
    if (sp.getString(K_LAST_PRUNE, null) == today) return
    val cal = Calendar.getInstance().apply { timeInMillis = nowMs }
    cal.add(Calendar.DAY_OF_YEAR, -RETENTION_DAYS)
    val cutoff = format(cal.time)
    val editor = sp.edit()
    sp.all.keys
      .filter { it.startsWith("d:") }
      .filter { it.substring(2, 12) < cutoff } // yyyy-MM-dd sorts lexicographically
      .forEach { editor.remove(it) }
    editor.putString(K_LAST_PRUNE, today).apply()
  }

  companion object {
    private const val FILE = "unreel_stats"
    private const val K_ALL_TIME = "all"
    private const val K_LAST_PRUNE = "lastPrune"
    const val RETENTION_DAYS = 60

    fun dayKey(nowMs: Long): String = format(Date(nowMs))

    // SimpleDateFormat isn't thread-safe; a fresh instance per call is cheap at this volume.
    private fun format(date: Date): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(date)
  }
}
