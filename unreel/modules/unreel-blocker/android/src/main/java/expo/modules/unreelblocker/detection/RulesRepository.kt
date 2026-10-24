package expo.modules.unreelblocker.detection

import android.content.Context
import android.util.Log
import java.io.File

/**
 * Supplies the active [DetectionRules].
 *
 * Source of truth, in order:
 *  1. An override pushed at runtime (`UnreelBlocker.updateRules(json)`), persisted in app storage,
 *     used only if it parses AND its version is >= the bundled one.
 *  2. The bundled `assets/unreel_rules.json`.
 *
 * A corrupt or older override is ignored rather than trusted, so a bad remote push can at worst
 * be a no-op — it can never switch blocking off.
 */
class RulesRepository(context: Context) {
  private val appContext = context.applicationContext
  private val overrideFile = File(appContext.filesDir, OVERRIDE_FILE)

  enum class Source { BUNDLED, OVERRIDE }

  data class Active(val rules: DetectionRules, val source: Source)

  @Volatile
  private var cached: Active? = null

  fun active(): Active = cached ?: synchronized(this) { cached ?: load().also { cached = it } }

  /**
   * Validates and installs [json]. Returns the rules now in force.
   * Throws [IllegalArgumentException] if the document is invalid or older than what's bundled.
   */
  @Synchronized
  fun applyOverride(json: String): Active {
    val candidate = DetectionRules.parse(json)
    val bundled = bundled()
    require(candidate.version >= bundled.version) {
      "Rules version ${candidate.version} is older than the bundled ${bundled.version}"
    }
    overrideFile.writeText(json)
    return Active(candidate, Source.OVERRIDE).also { cached = it }
  }

  @Synchronized
  fun clearOverride(): Active {
    overrideFile.delete()
    return Active(bundled(), Source.BUNDLED).also { cached = it }
  }

  /** Drops the in-memory copy so the next [active] call re-reads disk (after another process wrote). */
  fun invalidate() {
    cached = null
  }

  private fun load(): Active {
    val bundled = bundled()
    if (overrideFile.exists()) {
      try {
        val override = DetectionRules.parse(overrideFile.readText())
        if (override.version >= bundled.version) return Active(override, Source.OVERRIDE)
        // The app update shipped newer rules than the last remote push: the push is stale.
        overrideFile.delete()
      } catch (e: IllegalArgumentException) {
        Log.w(TAG, "Ignoring invalid rules override: ${e.message}")
        overrideFile.delete()
      }
    }
    return Active(bundled, Source.BUNDLED)
  }

  private fun bundled(): DetectionRules =
    appContext.assets.open(BUNDLED_ASSET).bufferedReader().use { DetectionRules.parse(it.readText()) }

  companion object {
    private const val TAG = "UnreelRules"
    const val BUNDLED_ASSET = "unreel_rules.json"
    private const val OVERRIDE_FILE = "unreel_rules_override.json"
  }
}
