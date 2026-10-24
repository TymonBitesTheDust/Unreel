package expo.modules.unreelblocker

import android.content.Context
import android.os.Build
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.unreelblocker.data.BlockEventBus
import expo.modules.unreelblocker.data.BlockerConfig
import expo.modules.unreelblocker.data.BlockerPrefs
import expo.modules.unreelblocker.data.StatsStore
import expo.modules.unreelblocker.detection.RulesRepository
import expo.modules.unreelblocker.service.ServiceStatus
import expo.modules.unreelblocker.service.ShortFormBlockerService

/** Partial update from JS. Absent fields keep their current value. */
class ConfigPatch : Record {
  @Field val enabled: Boolean? = null
  @Field val youtubeShorts: Boolean? = null
  @Field val instagramReels: Boolean? = null
  @Field val allowSharedReels: Boolean? = null
  @Field val interstitial: Boolean? = null
  @Field val pausedUntil: Double? = null
}

class InvalidRulesException(message: String) : CodedException("ERR_INVALID_RULES", message, null)

/**
 * Bridge between the React Native dashboard and the accessibility service.
 *
 * The module never talks to the service directly: config goes through SharedPreferences (which
 * the service observes) and live events come back through [BlockEventBus]. That way the
 * dashboard works whether or not the service is currently bound, and vice versa.
 */
class UnreelBlockerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val prefs by lazy { BlockerPrefs(context) }
  private val stats by lazy { StatsStore(context) }
  private val rules by lazy { RulesRepository(context) }

  private var stopBlocked: (() -> Unit)? = null
  private var stopState: (() -> Unit)? = null

  override fun definition() = ModuleDefinition {
    Name("UnreelBlocker")

    Events("onBlocked", "onServiceStateChanged")

    OnStartObserving("onBlocked") {
      stopBlocked?.invoke()
      stopBlocked = BlockEventBus.onBlocked { event -> sendEvent("onBlocked", event.toMap()) }
    }
    OnStopObserving("onBlocked") {
      stopBlocked?.invoke()
      stopBlocked = null
    }
    OnStartObserving("onServiceStateChanged") {
      stopState?.invoke()
      stopState = BlockEventBus.onServiceState { running ->
        sendEvent("onServiceStateChanged", mapOf("running" to running))
      }
    }
    OnStopObserving("onServiceStateChanged") {
      stopState?.invoke()
      stopState = null
    }
    OnDestroy {
      stopBlocked?.invoke()
      stopState?.invoke()
    }

    Function("getStatus") {
      val active = rules.active()
      mapOf(
        "platform" to "android",
        "sdkInt" to Build.VERSION.SDK_INT,
        "serviceEnabled" to ServiceStatus.isEnabledInSettings(context),
        "serviceRunning" to ShortFormBlockerService.running,
        "lastEventAt" to prefs.lastEventAt.toDouble(),
        "installed" to mapOf(
          "youtube" to ServiceStatus.isInstalled(context, "com.google.android.youtube"),
          "instagram" to ServiceStatus.isInstalled(context, "com.instagram.android"),
        ),
        "rulesVersion" to active.rules.version.toDouble(),
        "rulesSource" to active.source.name.lowercase(),
      )
    }

    Function("openServiceSettings") { ServiceStatus.openSettings(context) }

    Function("openAppInfo") { ServiceStatus.openAppInfo(context) }

    Function("getConfig") { prefs.read().toMap() }

    // Async on both platforms (iOS has to talk to the Screen Time daemon), so JS has one signature.
    AsyncFunction("setConfig") { patch: ConfigPatch ->
      val current = prefs.read()
      val next = BlockerConfig(
        enabled = patch.enabled ?: current.enabled,
        youtubeShorts = patch.youtubeShorts ?: current.youtubeShorts,
        instagramReels = patch.instagramReels ?: current.instagramReels,
        allowSharedReels = patch.allowSharedReels ?: current.allowSharedReels,
        interstitial = patch.interstitial ?: current.interstitial,
        pausedUntil = patch.pausedUntil?.toLong() ?: current.pausedUntil,
      )
      prefs.write(next)
      next.toMap()
    }

    Function("getStats") { days: Int ->
      val window = stats.lastDays(days.coerceIn(1, StatsStore.RETENTION_DAYS))
      mapOf(
        "days" to window.map { it.toMap() },
        "today" to window.last().toMap(),
        "allTime" to stats.allTime().toDouble(),
      )
    }

    Function("resetStats") { stats.reset() }

    /** Installs a newer rules document (e.g. fetched from your server). Throws if invalid. */
    Function("updateRules") { json: String ->
      val active = try {
        rules.applyOverride(json)
      } catch (e: IllegalArgumentException) {
        throw InvalidRulesException(e.message ?: "Invalid rules")
      }
      prefs.bumpRulesEpoch()
      mapOf("version" to active.rules.version.toDouble(), "source" to active.source.name.lowercase())
    }

    Function("resetRules") {
      val active = rules.clearOverride()
      prefs.bumpRulesEpoch()
      mapOf("version" to active.rules.version.toDouble(), "source" to active.source.name.lowercase())
    }
  }
}
