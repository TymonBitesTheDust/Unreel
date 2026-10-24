package expo.modules.unreelblocker.service

import android.accessibilityservice.AccessibilityService
import android.content.SharedPreferences
import android.content.pm.ApplicationInfo
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import android.widget.Toast
import expo.modules.unreelblocker.R
import expo.modules.unreelblocker.data.BlockEvent
import expo.modules.unreelblocker.data.BlockEventBus
import expo.modules.unreelblocker.data.BlockerConfig
import expo.modules.unreelblocker.data.BlockerPrefs
import expo.modules.unreelblocker.data.StatsStore
import expo.modules.unreelblocker.detection.AccessibilityUiTree
import expo.modules.unreelblocker.detection.Detection
import expo.modules.unreelblocker.detection.DetectionRules
import expo.modules.unreelblocker.detection.EntryPoint
import expo.modules.unreelblocker.detection.RulesRepository
import expo.modules.unreelblocker.detection.ShortFormDetector
import expo.modules.unreelblocker.detection.UiTree
import expo.modules.unreelblocker.intervention.BlockOverlay
import expo.modules.unreelblocker.intervention.FeedExitNavigator

/**
 * Watches YouTube and Instagram and steps in when their short-form feed appears.
 *
 * Threading: [onAccessibilityEvent] runs on the main thread and only copies primitives off the
 * event (events are recycled when it returns), then hands off to a single worker thread. All
 * detection state lives on that worker, so it needs no locks. UI (overlay, toast) goes back to
 * the main thread.
 *
 * Event volume: content-changed events arrive hundreds of times a minute while a video plays.
 * They're coalesced into at most one scan per [SCAN_DEBOUNCE_MS]; window-state changes (opening a
 * new screen) scan immediately because that's when the user is most likely entering the feed.
 */
class ShortFormBlockerService : AccessibilityService(), SharedPreferences.OnSharedPreferenceChangeListener {

  private lateinit var prefs: BlockerPrefs
  private lateinit var stats: StatsStore
  private lateinit var rulesRepository: RulesRepository
  private lateinit var navigator: FeedExitNavigator
  private lateinit var overlay: BlockOverlay
  private lateinit var workerThread: HandlerThread
  private lateinit var worker: Handler

  private val detector = ShortFormDetector()
  private val mainHandler = Handler(Looper.getMainLooper())

  @Volatile private var config = BlockerConfig()
  @Volatile private var rules: DetectionRules? = null
  private var debuggable = false

  // ---- Worker-thread state -------------------------------------------------------------------
  private var pendingPackage: String? = null
  private var scanQueued = false
  private var lastInterventionAt = 0L
  private var lastHeartbeatAt = 0L
  private var sharedSession: SharedSession? = null
  private val diagnostics = ViewIdDiagnostics()

  /** A single reel/short the user opened from a DM or link, which we're letting them watch. */
  private class SharedSession(val ruleId: String, val openedAt: Long) {
    var swiped = false
  }

  // ---- Lifecycle -----------------------------------------------------------------------------

  override fun onServiceConnected() {
    super.onServiceConnected()
    debuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    prefs = BlockerPrefs(this)
    stats = StatsStore(this)
    rulesRepository = RulesRepository(this)
    navigator = FeedExitNavigator(this, detector)
    overlay = BlockOverlay(this)
    workerThread = HandlerThread("unreel-detector").apply { start() }
    worker = Handler(workerThread.looper)

    config = prefs.read()
    reloadRules()
    prefs.registerListener(this)

    running = true
    BlockEventBus.emitServiceState(true)
    Log.i(TAG, "Connected; watching ${rules?.packageNames}")
  }

  override fun onInterrupt() {
    // Required override. We produce no spoken/haptic feedback, so there's nothing to interrupt.
  }

  override fun onUnbind(intent: android.content.Intent?): Boolean {
    shutdown()
    return super.onUnbind(intent)
  }

  override fun onDestroy() {
    shutdown()
    super.onDestroy()
  }

  private fun shutdown() {
    if (!running) return
    running = false
    if (::prefs.isInitialized) prefs.unregisterListener(this)
    if (::overlay.isInitialized) overlay.hide()
    if (::workerThread.isInitialized) workerThread.quitSafely()
    BlockEventBus.emitServiceState(false)
    Log.i(TAG, "Disconnected")
  }

  override fun onSharedPreferenceChanged(sp: SharedPreferences?, key: String?) {
    when {
      key == null || key in BlockerPrefs.CONFIG_KEYS -> {
        config = prefs.read()
        if (!config.isActiveNow()) mainHandler.post { overlay.hide() }
      }
      key == BlockerPrefs.K_RULES_EPOCH -> reloadRules()
    }
  }

  private fun reloadRules() {
    rulesRepository.invalidate()
    val active = try {
      rulesRepository.active()
    } catch (e: Exception) {
      // Bundled asset missing or unreadable: keep the previous rules (or none) rather than crash.
      Log.e(TAG, "Could not load detection rules", e)
      null
    }
    if (active != null) {
      rules = active.rules
      applyServiceInfo(active.rules.packageNames)
      Log.i(TAG, "Rules v${active.rules.version} from ${active.source}")
    }
  }

  /** Narrows event delivery to exactly the packages the current rules cover. */
  private fun applyServiceInfo(packages: Set<String>) {
    if (packages.isEmpty()) return
    val info = serviceInfo ?: return
    info.packageNames = packages.toTypedArray()
    serviceInfo = info
  }

  // ---- Events (main thread) ------------------------------------------------------------------

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null || !running) return
    val pkg = event.packageName?.toString() ?: return
    val currentRules = rules ?: return
    if (pkg !in currentRules.packageNames) return
    if (!config.isActiveNow()) return

    val type = event.eventType
    // Needed to tell "swiped to the next reel" apart from "scrolled the comments".
    val scrollSourceId = if (type == AccessibilityEvent.TYPE_VIEW_SCROLLED) {
      try {
        event.source?.viewIdResourceName
      } catch (_: RuntimeException) {
        null
      }
    } else {
      null
    }
    worker.post { onEventOnWorker(pkg, type, scrollSourceId) }
  }

  // ---- Detection (worker thread) -------------------------------------------------------------

  private fun onEventOnWorker(pkg: String, type: Int, scrollSourceId: String?) {
    heartbeat()
    if (type == AccessibilityEvent.TYPE_VIEW_SCROLLED) noteScroll(pkg, scrollSourceId)

    pendingPackage = pkg
    if (type == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
      worker.removeCallbacks(scanRunnable)
      scanQueued = true
      worker.post(scanRunnable)
    } else if (!scanQueued) {
      scanQueued = true
      worker.postDelayed(scanRunnable, SCAN_DEBOUNCE_MS)
    }
  }

  private val scanRunnable = Runnable {
    scanQueued = false
    pendingPackage?.let(::scan)
  }

  private fun scan(pkg: String) {
    val cfg = config
    val currentRules = rules ?: return
    if (!cfg.isActiveNow()) {
      sharedSession = null
      return
    }
    val root = findRootFor(pkg) ?: return
    val tree = AccessibilityUiTree(root)
    val detection = detector.detect(pkg, tree, currentRules) { cfg.isTargetEnabled(it.configKey) }

    if (detection == null) {
      sharedSession = null
      if (debuggable) diagnostics.maybeLog(pkg, root)
      return
    }

    val trigger = decideTrigger(detection, cfg) ?: return // null: allowed (shared reel)
    val now = SystemClock.elapsedRealtime()
    if (now - lastInterventionAt < COOLDOWN_MS) return
    lastInterventionAt = now
    intervene(pkg, tree, detection, trigger)
  }

  /**
   * Returns why to block, or null to let it play.
   *  - Feed tab: always block.
   *  - Player opened from elsewhere (DM, link) with the allowance on: let that one item play;
   *    block once the user swipes to the next one or stays past [SHARED_ALLOWANCE_MS].
   */
  private fun decideTrigger(detection: Detection, cfg: BlockerConfig): String? {
    if (detection.entry == EntryPoint.FEED_TAB) {
      sharedSession = null
      return TRIGGER_TAB
    }
    if (!cfg.allowSharedReels) return TRIGGER_PLAYER

    val now = SystemClock.elapsedRealtime()
    val session = sharedSession
    if (session == null || session.ruleId != detection.rule.id) {
      sharedSession = SharedSession(detection.rule.id, now)
      return null
    }
    if (session.swiped) {
      sharedSession = null
      return TRIGGER_SWIPE
    }
    if (now - session.openedAt > SHARED_ALLOWANCE_MS) {
      sharedSession = null
      return TRIGGER_LIMIT
    }
    return null
  }

  private fun noteScroll(pkg: String, sourceId: String?) {
    val session = sharedSession ?: return
    val rule = rules?.targetById(session.ruleId) ?: return
    if (pkg in rule.packageNames && sourceId != null && sourceId in rule.swipeViewIds) {
      session.swiped = true
    }
  }

  private fun intervene(pkg: String, tree: UiTree, detection: Detection, trigger: String) {
    val method = navigator.exit(tree, detection)
    val todayTotal = stats.increment(detection.rule.app)
    BlockEventBus.emitBlocked(
      BlockEvent(
        app = detection.rule.app,
        feature = detection.rule.feature,
        trigger = trigger,
        method = method.wireName,
        at = System.currentTimeMillis(),
        todayTotal = todayTotal,
      ),
    )
    val label = detection.rule.label
    val app = detection.rule.app
    mainHandler.post {
      if (config.interstitial) {
        overlay.show(app, todayTotal)
      } else {
        Toast.makeText(this, getString(R.string.unreel_toast_blocked, label), Toast.LENGTH_SHORT).show()
      }
    }
    worker.postDelayed({ verifyExit(pkg, detection.rule.id, attempt = 1) }, VERIFY_DELAY_MS)
  }

  /**
   * Clicking Home or pressing Back usually works, but some screens swallow BACK (e.g. a bottom
   * sheet open over the player). If the feed is still there, try BACK once more, then HOME.
   */
  private fun verifyExit(pkg: String, ruleId: String, attempt: Int) {
    val cfg = config
    val currentRules = rules ?: return
    if (!cfg.isActiveNow()) return
    val root = findRootFor(pkg) ?: return // App left the foreground: done.
    val stillThere = detector.detect(pkg, AccessibilityUiTree(root), currentRules) {
      it.id == ruleId && cfg.isTargetEnabled(it.configKey)
    }
    if (stillThere == null) return

    val method = navigator.escalate(attempt)
    lastInterventionAt = SystemClock.elapsedRealtime()
    Log.i(TAG, "Escalated exit for $ruleId with ${method.wireName} (attempt $attempt)")
    if (attempt < MAX_ESCALATIONS) {
      worker.postDelayed({ verifyExit(pkg, ruleId, attempt + 1) }, VERIFY_DELAY_MS)
    }
  }

  /**
   * The active window isn't always the app: the keyboard, a permission dialog or our own overlay
   * can be in front. Fall back to scanning application windows for the package.
   */
  private fun findRootFor(pkg: String): AccessibilityNodeInfo? {
    try {
      rootInActiveWindow?.let { if (it.packageName?.toString() == pkg) return it }
      for (window in windows) {
        if (window.type != AccessibilityWindowInfo.TYPE_APPLICATION) continue
        val root = window.root ?: continue
        if (root.packageName?.toString() == pkg) return root
      }
    } catch (_: RuntimeException) {
      // Window list can change mid-iteration; next event will retry.
    }
    return null
  }

  private fun heartbeat() {
    val now = System.currentTimeMillis()
    if (now - lastHeartbeatAt < HEARTBEAT_INTERVAL_MS) return
    lastHeartbeatAt = now
    prefs.lastEventAt = now
  }

  companion object {
    private const val TAG = "UnreelService"

    private const val SCAN_DEBOUNCE_MS = 150L
    private const val COOLDOWN_MS = 900L
    private const val VERIFY_DELAY_MS = 700L
    private const val MAX_ESCALATIONS = 2
    private const val SHARED_ALLOWANCE_MS = 3 * 60_000L
    private const val HEARTBEAT_INTERVAL_MS = 60_000L

    const val TRIGGER_TAB = "tab"
    const val TRIGGER_PLAYER = "player"
    const val TRIGGER_SWIPE = "swipe"
    const val TRIGGER_LIMIT = "limit"

    /** True while the system has this service bound in our process. Read by the module for health. */
    @Volatile
    var running: Boolean = false
      private set
  }
}
