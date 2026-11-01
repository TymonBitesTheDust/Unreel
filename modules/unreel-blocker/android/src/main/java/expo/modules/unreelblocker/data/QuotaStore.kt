package expo.modules.unreelblocker.data

import android.content.Context
import android.content.SharedPreferences

/**
 * How much of today's and this hour's time limit is used, kept on-device only.
 *
 * Only the accessibility service writes; the dashboards read. Deliberately separate from
 * [StatsStore], so "Reset numbers" can't hand out a fresh allowance.
 */
class QuotaStore(context: Context) {
  private val sp: SharedPreferences =
    context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  @Synchronized
  fun ledger(): QuotaLedger = QuotaLedger(
    day = sp.getString(K_DAY, null) ?: "",
    dayMs = sp.getLong(K_DAY_MS, 0L),
    hourStart = sp.getLong(K_HOUR_START, 0L),
    hourMs = sp.getLong(K_HOUR_MS, 0L),
  )

  /** Records watching the feed from [fromMs] to [toMs], wall-clock epoch ms. */
  @Synchronized
  fun add(fromMs: Long, toMs: Long) {
    if (toMs <= fromMs) return
    val next = ledger().plus(fromMs, toMs)
    sp.edit()
      .putString(K_DAY, next.day)
      .putLong(K_DAY_MS, next.dayMs)
      .putLong(K_HOUR_START, next.hourStart)
      .putLong(K_HOUR_MS, next.hourMs)
      .apply()
  }

  fun status(limits: QuotaLimits, nowMs: Long = System.currentTimeMillis(), unsavedMs: Long = 0L): QuotaStatus =
    ledger().status(limits, nowMs, unsavedMs = unsavedMs)

  companion object {
    private const val FILE = "unreel_quota"
    private const val K_DAY = "day"
    private const val K_DAY_MS = "dayMs"
    private const val K_HOUR_START = "hourStart"
    private const val K_HOUR_MS = "hourMs"
  }
}
