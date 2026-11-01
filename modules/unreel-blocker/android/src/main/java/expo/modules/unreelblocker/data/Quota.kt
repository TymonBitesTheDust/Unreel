package expo.modules.unreelblocker.data

import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/*
 * Time limits, for people who find quitting Shorts and Reels all at once too hard: the feeds play
 * until today's or this hour's allowance is used up, then Unreel blocks them exactly as it does
 * without limits. YouTube and Instagram share one allowance.
 *
 * This file is plain Kotlin (no Android), so the arithmetic is unit-tested on the JVM.
 * [QuotaStore] persists a [QuotaLedger]; the accessibility service feeds it while the feed is on
 * screen.
 *
 * "Hour" means a clock hour in the device's time zone (14:00–15:00) and "day" a local calendar
 * day, so "10 minutes an hour" resets on the hour, where the user expects it to, and the day
 * matches the block counts in [StatsStore].
 */

data class QuotaLimits(val dailyMinutes: Int, val hourlyMinutes: Int) {
  val dailyMs: Long get() = dailyMinutes * MINUTE_MS
  val hourlyMs: Long get() = hourlyMinutes * MINUTE_MS

  companion object {
    const val MINUTE_MS = 60_000L
    const val DEFAULT_DAILY_MINUTES = 60
    const val DEFAULT_HOURLY_MINUTES = 10
    const val MAX_DAILY_MINUTES = 24 * 60
    const val MAX_HOURLY_MINUTES = 60

    /** "10 minutes", "1 hour", "90 minutes", "2 hours". English, like the rest of the app. */
    fun label(minutes: Int): String = when {
      minutes == 60 -> "1 hour"
      minutes > 0 && minutes % 60 == 0 -> "${minutes / 60} hours"
      minutes == 1 -> "1 minute"
      else -> "$minutes minutes"
    }
  }
}

/** Which allowance ran out. */
enum class QuotaExhausted(val wireName: String) { DAY("day"), HOUR("hour") }

data class QuotaStatus(
  val limits: QuotaLimits,
  val usedTodayMs: Long,
  val usedThisHourMs: Long,
  /** Start of the next clock hour, when the hourly allowance refills. */
  val hourEndsAt: Long,
  /** Next local midnight, when both refill. */
  val dayEndsAt: Long,
) {
  val leftTodayMs: Long get() = (limits.dailyMs - usedTodayMs).coerceAtLeast(0L)
  val leftThisHourMs: Long get() = (limits.hourlyMs - usedThisHourMs).coerceAtLeast(0L)

  /** How long the feed may play right now before Unreel steps in. */
  val leftMs: Long get() = minOf(leftTodayMs, leftThisHourMs)

  /** The day wins when both have run out: waiting for the next hour wouldn't help. */
  val exhausted: QuotaExhausted?
    get() = when {
      leftTodayMs <= 0L -> QuotaExhausted.DAY
      leftThisHourMs <= 0L -> QuotaExhausted.HOUR
      else -> null
    }

  /** When the feed can play again, or null while there's time left. */
  val availableAt: Long?
    get() = when (exhausted) {
      QuotaExhausted.DAY -> dayEndsAt
      QuotaExhausted.HOUR -> hourEndsAt
      null -> null
    }

  fun toMap(): Map<String, Any?> = mapOf(
    "dailyLimitMinutes" to limits.dailyMinutes,
    "hourlyLimitMinutes" to limits.hourlyMinutes,
    "usedTodayMs" to usedTodayMs.toDouble(),
    "usedThisHourMs" to usedThisHourMs.toDouble(),
    "leftTodayMs" to leftTodayMs.toDouble(),
    "leftThisHourMs" to leftThisHourMs.toDouble(),
    "leftMs" to leftMs.toDouble(),
    "exhausted" to exhausted?.wireName,
    "availableAt" to availableAt?.toDouble(),
    "hourEndsAt" to hourEndsAt.toDouble(),
    "dayEndsAt" to dayEndsAt.toDouble(),
  )
}

/**
 * Time watched in the current day and the current hour. Nothing older is kept: it can never
 * matter again.
 */
data class QuotaLedger(
  /** Local day, yyyy-MM-dd. */
  val day: String = "",
  val dayMs: Long = 0L,
  /** Epoch ms of the start of the clock hour [hourMs] belongs to. */
  val hourStart: Long = 0L,
  val hourMs: Long = 0L,
) {
  /**
   * Adds watching from [fromMs] to [toMs] (wall clock), split at hour boundaries so a session
   * across 14:59–15:01 counts one minute against each hour.
   *
   * The ledger always moves to the newest segment's day and hour, even backwards. If the phone's
   * clock is set back, that costs one fresh allowance instead of letting watching go uncounted
   * against a "today" that's now in the future.
   */
  fun plus(fromMs: Long, toMs: Long, zone: TimeZone = TimeZone.getDefault()): QuotaLedger {
    var next = this
    for (segment in QuotaClock.splitByHour(fromMs, toMs, zone)) {
      next = QuotaLedger(
        day = segment.day,
        dayMs = if (segment.day == next.day) next.dayMs + segment.ms else segment.ms,
        hourStart = segment.hourStart,
        hourMs = if (segment.hourStart == next.hourStart) next.hourMs + segment.ms else segment.ms,
      )
    }
    return next
  }

  /** [unsavedMs]: time already counted but not yet written to storage; it belongs to now. */
  fun status(
    limits: QuotaLimits,
    nowMs: Long,
    zone: TimeZone = TimeZone.getDefault(),
    unsavedMs: Long = 0L,
  ): QuotaStatus {
    val usedDay = if (day == QuotaClock.dayKey(nowMs, zone)) dayMs else 0L
    val usedHour = if (hourStart == QuotaClock.hourStart(nowMs, zone)) hourMs else 0L
    return QuotaStatus(
      limits = limits,
      usedTodayMs = usedDay + unsavedMs,
      usedThisHourMs = usedHour + unsavedMs,
      hourEndsAt = QuotaClock.nextHour(nowMs, zone),
      dayEndsAt = QuotaClock.nextMidnight(nowMs, zone),
    )
  }
}

object QuotaClock {
  const val HOUR_MS = 3_600_000L

  /** Longest range [splitByHour] will split; anything longer is a clock jump, not watching. */
  private const val MAX_SPAN_MS = 24 * HOUR_MS

  data class Segment(val day: String, val hourStart: Long, val ms: Long)

  /**
   * Start of the local clock hour containing [ms]. Computed from the offset in force at that
   * instant rather than through Calendar fields, so the repeated hour when clocks go back still
   * gives two distinct hours.
   */
  fun hourStart(ms: Long, zone: TimeZone): Long = ms - Math.floorMod(ms + zone.getOffset(ms), HOUR_MS)

  fun nextHour(ms: Long, zone: TimeZone): Long = hourStart(ms, zone) + HOUR_MS

  fun nextMidnight(ms: Long, zone: TimeZone): Long = Calendar.getInstance(zone).apply {
    timeInMillis = ms
    add(Calendar.DAY_OF_YEAR, 1)
    set(Calendar.HOUR_OF_DAY, 0)
    set(Calendar.MINUTE, 0)
    set(Calendar.SECOND, 0)
    set(Calendar.MILLISECOND, 0)
  }.timeInMillis

  // SimpleDateFormat isn't thread-safe; a fresh instance per call is cheap at this volume.
  fun dayKey(ms: Long, zone: TimeZone): String =
    SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = zone }.format(Date(ms))

  /** Splits [fromMs, toMs) at local clock-hour boundaries, oldest first. */
  fun splitByHour(fromMs: Long, toMs: Long, zone: TimeZone): List<Segment> {
    val out = ArrayList<Segment>(2)
    var t = maxOf(fromMs, toMs - MAX_SPAN_MS)
    while (t < toMs) {
      val start = hourStart(t, zone)
      val end = minOf(start + HOUR_MS, toMs)
      out += Segment(dayKey(t, zone), start, end - t)
      t = end
    }
    return out
  }
}
