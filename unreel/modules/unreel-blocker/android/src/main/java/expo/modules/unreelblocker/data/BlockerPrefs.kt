package expo.modules.unreelblocker.data

import android.content.Context
import android.content.SharedPreferences

/**
 * What the user wants blocked. Written by the JS dashboard through the module, read by the
 * accessibility service. Both live in the app process, so SharedPreferences is enough; the
 * service listens for changes instead of polling.
 */
data class BlockerConfig(
  val enabled: Boolean = true,
  val youtubeShorts: Boolean = true,
  val instagramReels: Boolean = true,
  /** Let one reel/short that was opened from a DM or link play, but block swiping to the next. */
  val allowSharedReels: Boolean = true,
  /** Show the full-screen "pause" card after redirecting; otherwise a short toast. */
  val interstitial: Boolean = true,
  /** Epoch ms. Blocking is suspended until then. Enforced natively so it survives app kills. */
  val pausedUntil: Long = 0L,
) {
  fun isActiveNow(nowMs: Long = System.currentTimeMillis()): Boolean = enabled && nowMs >= pausedUntil

  /** Unknown keys (a target added by a remote rules push) stay off until the user opts in. */
  fun isTargetEnabled(configKey: String): Boolean = when (configKey) {
    KEY_YOUTUBE_SHORTS -> youtubeShorts
    KEY_INSTAGRAM_REELS -> instagramReels
    else -> false
  }

  fun toMap(): Map<String, Any?> = mapOf(
    "enabled" to enabled,
    KEY_YOUTUBE_SHORTS to youtubeShorts,
    KEY_INSTAGRAM_REELS to instagramReels,
    "allowSharedReels" to allowSharedReels,
    "interstitial" to interstitial,
    "pausedUntil" to pausedUntil.toDouble(),
  )

  companion object {
    const val KEY_YOUTUBE_SHORTS = "youtubeShorts"
    const val KEY_INSTAGRAM_REELS = "instagramReels"
  }
}

class BlockerPrefs(context: Context) {
  private val sp: SharedPreferences =
    context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  fun read(): BlockerConfig = BlockerConfig(
    enabled = sp.getBoolean(K_ENABLED, true),
    youtubeShorts = sp.getBoolean(BlockerConfig.KEY_YOUTUBE_SHORTS, true),
    instagramReels = sp.getBoolean(BlockerConfig.KEY_INSTAGRAM_REELS, true),
    allowSharedReels = sp.getBoolean(K_ALLOW_SHARED, true),
    interstitial = sp.getBoolean(K_INTERSTITIAL, true),
    pausedUntil = sp.getLong(K_PAUSED_UNTIL, 0L),
  )

  fun write(config: BlockerConfig) {
    sp.edit()
      .putBoolean(K_ENABLED, config.enabled)
      .putBoolean(BlockerConfig.KEY_YOUTUBE_SHORTS, config.youtubeShorts)
      .putBoolean(BlockerConfig.KEY_INSTAGRAM_REELS, config.instagramReels)
      .putBoolean(K_ALLOW_SHARED, config.allowSharedReels)
      .putBoolean(K_INTERSTITIAL, config.interstitial)
      .putLong(K_PAUSED_UNTIL, config.pausedUntil)
      .apply()
  }

  /** Bumped when detection rules change so the running service reloads them. */
  fun bumpRulesEpoch() {
    sp.edit().putLong(K_RULES_EPOCH, System.currentTimeMillis()).apply()
  }

  /** Last time the service saw an event from a watched app; shown as a health signal. */
  var lastEventAt: Long
    get() = sp.getLong(K_LAST_EVENT, 0L)
    set(value) {
      sp.edit().putLong(K_LAST_EVENT, value).apply()
    }

  fun registerListener(listener: SharedPreferences.OnSharedPreferenceChangeListener) =
    sp.registerOnSharedPreferenceChangeListener(listener)

  fun unregisterListener(listener: SharedPreferences.OnSharedPreferenceChangeListener) =
    sp.unregisterOnSharedPreferenceChangeListener(listener)

  companion object {
    private const val FILE = "unreel_blocker"
    private const val K_ENABLED = "enabled"
    private const val K_ALLOW_SHARED = "allowSharedReels"
    private const val K_INTERSTITIAL = "interstitial"
    private const val K_PAUSED_UNTIL = "pausedUntil"
    private const val K_LAST_EVENT = "lastEventAt"
    const val K_RULES_EPOCH = "rulesEpoch"

    /** Keys whose change should make the service re-read its config. */
    val CONFIG_KEYS = setOf(
      K_ENABLED, BlockerConfig.KEY_YOUTUBE_SHORTS, BlockerConfig.KEY_INSTAGRAM_REELS,
      K_ALLOW_SHARED, K_INTERSTITIAL, K_PAUSED_UNTIL,
    )
  }
}
