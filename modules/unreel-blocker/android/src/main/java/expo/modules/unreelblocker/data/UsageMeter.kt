package expo.modules.unreelblocker.data

import java.util.TimeZone

/**
 * Turns "the screen showed this part of this app at time t" observations into slices of time to
 * record. Pure (no Android), so it's unit-tested on the JVM; the accessibility service feeds it
 * from its scans and from a re-check every few seconds while an app is on screen.
 *
 * Time between two observations goes to the earlier one's category: that's what was on screen
 * until we saw otherwise. A gap longer than [maxGapMs] means the phone slept, so it's capped.
 * When the app goes away ([stop]) the time since the last observation isn't counted, because we
 * don't know when in that gap the user left.
 */
class UsageMeter(
  private val maxGapMs: Long = 10_000L,
  private val saveEveryMs: Long = 10_000L,
) {
  /** Watched time, wall-clock epoch ms. */
  data class Slice(val app: String, val category: String, val fromMs: Long, val toMs: Long) {
    /** Milliseconds per local day (yyyy-MM-dd), split at midnight. */
    fun byDay(zone: TimeZone = TimeZone.getDefault()): Map<String, Long> =
      QuotaClock.splitByHour(fromMs, toMs, zone).groupBy { it.day }.mapValues { (_, s) -> s.sumOf { it.ms } }
  }

  private class Current(val pkg: String, val app: String, val category: String, now: Long) {
    /** elapsedRealtime the count has reached. */
    var countedTo = now
    var savedAt = now
    /** Counted but not yet handed out as a [Slice]; it ends at [countedTo]. */
    var unsavedMs = 0L
  }

  private var current: Current? = null

  /** The package being timed, or null when no watched app is on screen. */
  val pkg: String? get() = current?.pkg

  /** [now]: elapsedRealtime; [wallNow]: System.currentTimeMillis at the same moment. */
  fun observe(pkg: String, app: String, category: String, now: Long, wallNow: Long): List<Slice> {
    val c = current
    if (c == null) {
      current = Current(pkg, app, category, now)
      return emptyList()
    }
    c.unsavedMs += (now - c.countedTo).coerceIn(0L, maxGapMs)
    c.countedTo = now
    if (c.pkg == pkg && c.app == app && c.category == category) {
      return if (now - c.savedAt >= saveEveryMs) listOfNotNull(flush(c, now, wallNow)) else emptyList()
    }
    val out = listOfNotNull(flush(c, now, wallNow))
    current = Current(pkg, app, category, now)
    return out
  }

  /** The app left the screen (or the screen went off): hand out what's counted and stop. */
  fun stop(now: Long, wallNow: Long): List<Slice> {
    val c = current ?: return emptyList()
    current = null
    return listOfNotNull(flush(c, now, wallNow))
  }

  private fun flush(c: Current, now: Long, wallNow: Long): Slice? {
    c.savedAt = now
    if (c.unsavedMs <= 0L) return null
    val end = wallNow - (now - c.countedTo)
    val slice = Slice(c.app, c.category, end - c.unsavedMs, end)
    c.unsavedMs = 0L
    return slice
  }
}
