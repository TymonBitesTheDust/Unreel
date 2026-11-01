package expo.modules.unreelblocker.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/** Time-limit arithmetic. Run with: ./gradlew :unreel-blocker:testDebugUnitTest */
class QuotaTest {

  private val london = TimeZone.getTimeZone("Europe/London")
  private val limits = QuotaLimits(QuotaLimits.DEFAULT_DAILY_MINUTES, QuotaLimits.DEFAULT_HOURLY_MINUTES)
  private val min = QuotaLimits.MINUTE_MS

  @Test fun `defaults are an hour a day and ten minutes an hour`() {
    assertEquals(60, limits.dailyMinutes)
    assertEquals(10, limits.hourlyMinutes)
  }

  @Test fun `nothing watched leaves the whole allowance`() {
    val s = QuotaLedger().status(limits, at("2026-11-02 09:15"), london)
    assertEquals(10 * min, s.leftMs)
    assertEquals(60 * min, s.leftTodayMs)
    assertNull(s.exhausted)
    assertNull(s.availableAt)
  }

  @Test fun `watching counts against both the hour and the day`() {
    val ledger = watch(QuotaLedger(), "2026-11-02 09:00", "2026-11-02 09:04")
    val s = ledger.status(limits, at("2026-11-02 09:04"), london)
    assertEquals(4 * min, s.usedThisHourMs)
    assertEquals(4 * min, s.usedTodayMs)
    assertEquals(6 * min, s.leftMs)
  }

  @Test fun `ten minutes in one hour runs out the hour until the next one`() {
    val ledger = watch(QuotaLedger(), "2026-11-02 14:20", "2026-11-02 14:30")
    val s = ledger.status(limits, at("2026-11-02 14:30"), london)
    assertEquals(QuotaExhausted.HOUR, s.exhausted)
    assertEquals(at("2026-11-02 15:00"), s.availableAt)
    assertEquals(50 * min, s.leftTodayMs)
  }

  @Test fun `the next hour refills the hourly allowance but not the daily one`() {
    val ledger = watch(QuotaLedger(), "2026-11-02 14:20", "2026-11-02 14:30")
    val s = ledger.status(limits, at("2026-11-02 15:00"), london)
    assertNull(s.exhausted)
    assertEquals(0L, s.usedThisHourMs)
    assertEquals(10 * min, s.usedTodayMs)
    assertEquals(10 * min, s.leftMs)
  }

  @Test fun `an hour a day runs out the day until midnight, even with time left this hour`() {
    var ledger = QuotaLedger()
    for (hour in 8..13) ledger = watch(ledger, "2026-11-02 %02d:00".format(hour), "2026-11-02 %02d:10".format(hour))
    val s = ledger.status(limits, at("2026-11-02 15:30"), london)
    assertEquals(60 * min, s.usedTodayMs)
    assertEquals(0L, s.usedThisHourMs)
    assertEquals(QuotaExhausted.DAY, s.exhausted)
    assertEquals(at("2026-11-03 00:00"), s.availableAt)
  }

  @Test fun `a session across the hour is split between both hours`() {
    val ledger = watch(QuotaLedger(), "2026-11-02 14:58", "2026-11-02 15:03")
    val s = ledger.status(limits, at("2026-11-02 15:03"), london)
    assertEquals(3 * min, s.usedThisHourMs)
    assertEquals(5 * min, s.usedTodayMs)
  }

  @Test fun `a session across midnight starts the new day with only its own part`() {
    val ledger = watch(QuotaLedger(), "2026-11-02 23:55", "2026-11-03 00:04")
    val s = ledger.status(limits, at("2026-11-03 00:04"), london)
    assertEquals(4 * min, s.usedTodayMs)
    assertEquals(4 * min, s.usedThisHourMs)
  }

  @Test fun `time not yet saved counts too`() {
    val ledger = watch(QuotaLedger(), "2026-11-02 10:00", "2026-11-02 10:05")
    val s = ledger.status(limits, at("2026-11-02 10:06"), london, unsavedMs = 5 * min)
    assertEquals(QuotaExhausted.HOUR, s.exhausted)
  }

  @Test fun `the repeated hour when clocks go back is a separate hour`() {
    // US clocks go back at 02:00 EDT on 2026-11-01: 01:00–02:00 happens twice.
    val ny = TimeZone.getTimeZone("America/New_York")
    val firstOneThirty = at("2026-11-01 01:30 -0400")
    val secondOneThirty = firstOneThirty + QuotaClock.HOUR_MS
    assertNotEquals(QuotaClock.hourStart(firstOneThirty, ny), QuotaClock.hourStart(secondOneThirty, ny))
    assertEquals(QuotaClock.HOUR_MS, QuotaClock.hourStart(secondOneThirty, ny) - QuotaClock.hourStart(firstOneThirty, ny))

    val ledger = QuotaLedger().plus(firstOneThirty, firstOneThirty + 10 * min, ny)
    val s = ledger.status(limits, secondOneThirty, ny)
    assertEquals(0L, s.usedThisHourMs)
    assertEquals(10 * min, s.usedTodayMs)
  }

  @Test fun `hours follow the local clock in half-hour time zones`() {
    val kolkata = TimeZone.getTimeZone("Asia/Kolkata") // UTC+05:30
    val t = at("2026-11-02 10:20 +0530")
    assertEquals(at("2026-11-02 10:00 +0530"), QuotaClock.hourStart(t, kolkata))
    assertEquals(at("2026-11-02 11:00 +0530"), QuotaClock.nextHour(t, kolkata))
  }

  @Test fun `setting the clock back gives one fresh day rather than uncounted time`() {
    val tomorrow = watch(QuotaLedger(), "2026-11-03 09:00", "2026-11-03 09:10")
    val back = watch(tomorrow, "2026-11-02 09:00", "2026-11-02 09:03")
    assertEquals("2026-11-02", back.day)
    assertEquals(3 * min, back.dayMs)
    assertEquals(3 * min, back.status(limits, at("2026-11-02 09:03"), london).usedThisHourMs)
  }

  @Test fun `a huge range from a clock jump counts at most a day`() {
    val ledger = QuotaLedger().plus(0L, at("2026-11-02 10:00"), london)
    assertEquals(10 * 60 * min, ledger.dayMs) // Midnight to 10:00 of the last day only.
  }

  @Test fun `empty and backwards ranges add nothing`() {
    val t = at("2026-11-02 10:00")
    assertEquals(QuotaLedger(), QuotaLedger().plus(t, t, london))
    assertEquals(QuotaLedger(), QuotaLedger().plus(t, t - min, london))
  }

  @Test fun `labels read naturally`() {
    assertEquals("10 minutes", QuotaLimits.label(10))
    assertEquals("1 hour", QuotaLimits.label(60))
    assertEquals("90 minutes", QuotaLimits.label(90))
    assertEquals("2 hours", QuotaLimits.label(120))
    assertEquals("1 minute", QuotaLimits.label(1))
  }

  @Test fun `status reaches the dashboard with the numbers it needs`() {
    val map = watch(QuotaLedger(), "2026-11-02 14:20", "2026-11-02 14:30").status(limits, at("2026-11-02 14:30"), london).toMap()
    assertEquals("hour", map["exhausted"])
    assertEquals(at("2026-11-02 15:00").toDouble(), map["availableAt"])
    assertEquals(10, map["hourlyLimitMinutes"])
  }

  // ---- Helpers -------------------------------------------------------------------------------

  private fun watch(ledger: QuotaLedger, from: String, to: String) = ledger.plus(at(from), at(to), london)

  /** "yyyy-MM-dd HH:mm" in London, or with an explicit offset: "yyyy-MM-dd HH:mm Z". */
  private fun at(text: String): Long {
    val withOffset = text.length > 16
    val format = SimpleDateFormat(if (withOffset) "yyyy-MM-dd HH:mm Z" else "yyyy-MM-dd HH:mm", Locale.US)
    if (!withOffset) format.timeZone = london
    return format.parse(text)!!.time
  }
}
