package expo.modules.unreelblocker.service

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.SharedPreferences
import android.content.pm.ApplicationInfo
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.text.format.DateFormat
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
import expo.modules.unreelblocker.data.QuotaExhausted
import expo.modules.unreelblocker.data.QuotaLimits
import expo.modules.unreelblocker.data.QuotaStatus
import expo.modules.unreelblocker.data.QuotaStore
import expo.modules.unreelblocker.data.ScreenTimeStore
import expo.modules.unreelblocker.data.StatsStore
import expo.modules.unreelblocker.data.UsageMeter
import expo.modules.unreelblocker.detection.AccessibilityUiTree
import expo.modules.unreelblocker.detection.Detection
import expo.modules.unreelblocker.detection.DetectionRules
import expo.modules.unreelblocker.detection.EntryPoint
import expo.modules.unreelblocker.detection.RulesRepository
import expo.modules.unreelblocker.detection.ScreenClassifier
import expo.modules.unreelblocker.detection.ShortFormDetector
import expo.modules.unreelblocker.detection.UiTree
import expo.modules.unreelblocker.intervention.BlockOverlay
import expo.modules.unreelblocker.intervention.FeedExitNavigator
import expo.modules.unreelblocker.widget.ScreenTimeWidget
import java.util.Date

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
 *
 * Time limits: with [BlockerConfig.quotaEnabled], the feed is allowed while today's and this
 * hour's allowance last. A [Watch] counts the time it's on screen, re-checked every
 * [QUOTA_TICK_MS] so leaving the app or switching the screen off stops the count even though
 * those produce no events from the watched packages. Once the time is used up, blocking works
 * exactly as it does without limits.
 *
 * Screen time: whether or not blocking is on, every scan sorts the screen into a part of the app
 * ([ScreenClassifier], at most once a second) and a [UsageMeter] turns that into time per part,
 * saved in [ScreenTimeStore]. A re-check every [USAGE_TICK_MS] notices the app leaving the screen.
 */
class ShortFormBlockerService : AccessibilityService(), SharedPreferences.OnSharedPreferenceChangeListener {

  private lateinit var prefs: BlockerPrefs
  private lateinit var stats: StatsStore
  private lateinit var quota: QuotaStore
  private lateinit var screenTime: ScreenTimeStore
  private lateinit var power: PowerManager
  private lateinit var rulesRepository: RulesRepository
  private lateinit var navigator: FeedExitNavigator
  private lateinit var overlay: BlockOverlay
  private lateinit var workerThread: HandlerThread
  private lateinit var worker: Handler

  private val detector = ShortFormDetector()
  private val classifier = ScreenClassifier(detector)
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
  private var watch: Watch? = null
  /** The day or hour (its end time) we last showed the "about a minute left" toast for. */
  private var warnedFor = 0L
  private val usageMeter = UsageMeter()
  private var lastClassifiedAt = 0L
  /** A new screen opened since the last scan: classify it now rather than within the second. */
  private var windowChanged = false
  /** Screen time: a short-form player is on screen, and whether the user has swiped in it. */
  private var playerOpen = false
  private var swipedInPlayer = false
  private val diagnostics = ViewIdDiagnostics()

  /** A single reel/short the user opened from a DM or link, which we're letting them watch. */
  private class SharedSession(val ruleId: String, val openedAt: Long) {
    var swiped = false
  }

  /** Time limits: the feed is on screen and allowed, and its time is being counted. */
  private class Watch(val pkg: String, now: Long) {
    /** elapsedRealtime the count has reached. */
    var countedTo = now
    var savedAt = now
    /** Counted but not yet written to [QuotaStore]. It ends at [countedTo]. */
    var unsavedMs = 0L
  }

  private sealed class Allowance {
    object Watching : Allowance()
    class UsedUp(val status: QuotaStatus, val whileWatching: Boolean) : Allowance()
  }

  // ---- Lifecycle -----------------------------------------------------------------------------

  override fun onServiceConnected() {
    super.onServiceConnected()
    debuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    prefs = BlockerPrefs(this)
    stats = StatsStore(this)
    quota = QuotaStore(this)
    screenTime = ScreenTimeStore(this)
    power = getSystemService(Context.POWER_SERVICE) as PowerManager
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
    if (::workerThread.isInitialized) {
      worker.post { // Keep the time counted so far; quitSafely still runs it.
        stopWatching()
        stopUsage()
      }
      workerThread.quitSafely()
    }
    BlockEventBus.emitServiceState(false)
    Log.i(TAG, "Disconnected")
  }

  override fun onSharedPreferenceChanged(sp: SharedPreferences?, key: String?) {
    when {
      key == null || key in BlockerPrefs.CONFIG_KEYS -> {
        config = prefs.read()
        if (!config.isActiveNow()) mainHandler.post { overlay.hide() }
        // Limits turned off, or blocking off or paused: stop counting, keeping what was counted.
        if (!config.quotaEnabled || !config.isActiveNow()) worker.post { stopWatching() }
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
    // No return when blocking is off or paused: screen time is recorded either way.

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
      windowChanged = true
      worker.removeCallbacks(scanRunnable)
      scanQueued = true
      worker.post(scanRunnable)
    } else if (!scanQueued) {
      scanQueued = true
      // While a time limit lets the feed play, the quota tick does the counting; content changes
      // only need to notice the user leaving, so they can be scanned less often.
      worker.postDelayed(scanRunnable, if (watch != null) WATCH_SCAN_DEBOUNCE_MS else SCAN_DEBOUNCE_MS)
    }
  }

  private val scanRunnable = Runnable {
    scanQueued = false
    pendingPackage?.let(::scan)
  }

  private fun scan(pkg: String) {
    val cfg = config
    val currentRules = rules ?: return
    val root = findRootFor(pkg) ?: return
    val tree = AccessibilityUiTree(root)
    val blocking = cfg.isActiveNow()
    val detection = if (blocking) detector.detect(pkg, tree, currentRules) { cfg.isTargetEnabled(it.configKey) } else null
    recordScreen(pkg, root, tree, currentRules, detection)

    if (!blocking) {
      sharedSession = null
      stopWatching()
      return
    }
    if (detection == null) {
      sharedSession = null
      stopWatching()
      // With screen-time rules, recordScreen logs the screens it can't place instead.
      if (debuggable && currentRules.screenTimeFor(pkg) == null) diagnostics.maybeLog(pkg, root, "unmatched")
      return
    }
    onFeed(pkg, tree, detection, cfg)
  }

  // ---- Screen time (worker thread) -----------------------------------------------------------

  /**
   * Sorts the screen into a part of the app and records the time. Runs on every scan whether or
   * not blocking is on, at most once a second unless a new screen just opened or another app
   * took over. [blockingDetection] is reused when the scan already made one.
   */
  private fun recordScreen(
    pkg: String,
    root: AccessibilityNodeInfo,
    tree: UiTree,
    currentRules: DetectionRules,
    blockingDetection: Detection?,
    force: Boolean = false,
  ) {
    val app = currentRules.screenTimeFor(pkg) ?: return
    val now = SystemClock.elapsedRealtime()
    val newScreen = windowChanged
    windowChanged = false
    if (!force && !newScreen && usageMeter.pkg == pkg && now - lastClassifiedAt < CLASSIFY_EVERY_MS) return
    lastClassifiedAt = now

    // Every target, not only those being blocked: time is recorded either way.
    val detection = blockingDetection ?: detector.detect(pkg, tree, currentRules) { true }
    val inPlayer = detection?.entry == EntryPoint.PLAYER
    if (!inPlayer) swipedInPlayer = false
    playerOpen = inPlayer
    val category = classifier.classify(app, tree, detection, swipedInPlayer)
    if (debuggable && category == ScreenClassifier.OTHER) diagnostics.maybeLog(pkg, root, "other")

    saveUsage(usageMeter.observe(pkg, app.app, category, now, System.currentTimeMillis()))
    worker.removeCallbacks(usageTick)
    worker.postDelayed(usageTick, USAGE_TICK_MS)
  }

  /**
   * Every few seconds while YouTube or Instagram is on screen: is it still there? Leaving the app
   * or switching the screen off sends no events from the watched apps, so without this the time
   * would keep running.
   */
  private val usageTick = Runnable {
    val pkg = usageMeter.pkg ?: return@Runnable
    val currentRules = rules
    val root = if (currentRules != null && power.isInteractive) findRootFor(pkg) else null
    if (currentRules == null || root == null) {
      stopUsage()
      return@Runnable
    }
    recordScreen(pkg, root, AccessibilityUiTree(root), currentRules, blockingDetection = null, force = true)
  }

  private fun stopUsage() {
    worker.removeCallbacks(usageTick)
    val hadApp = usageMeter.pkg != null
    saveUsage(usageMeter.stop(SystemClock.elapsedRealtime(), System.currentTimeMillis()))
    playerOpen = false
    swipedInPlayer = false
    // The app just left the screen, which is when the home-screen widget comes back into view.
    if (hadApp) ScreenTimeWidget.updateAll(this)
  }

  private fun saveUsage(slices: List<UsageMeter.Slice>) {
    for (slice in slices) screenTime.add(slice)
  }

  /** The feed is on screen: let it play if a time limit allows it, otherwise step in. */
  private fun onFeed(pkg: String, tree: UiTree, detection: Detection, cfg: BlockerConfig) {
    var usedUp: QuotaStatus? = null
    val trigger = if (cfg.quotaEnabled) {
      when (val allowance = checkAllowance(pkg, cfg)) {
        is Allowance.Watching -> return
        is Allowance.UsedUp -> {
          usedUp = allowance.status
          // Ran out mid-feed: out now, without the one-shared-video grace a fresh visit gets.
          if (allowance.whileWatching) TRIGGER_QUOTA else decideTrigger(detection, cfg)
        }
      }
    } else {
      decideTrigger(detection, cfg)
    }
    if (trigger == null) return // Allowed: a shared reel.

    val now = SystemClock.elapsedRealtime()
    if (now - lastInterventionAt < COOLDOWN_MS) return
    lastInterventionAt = now
    intervene(pkg, tree, detection, trigger, usedUp)
  }

  // ---- Time limits (worker thread) -----------------------------------------------------------

  /**
   * Counts the time since the last check and says whether the feed may keep playing. Starts a
   * [Watch] if there's time left and none is running.
   */
  private fun checkAllowance(pkg: String, cfg: BlockerConfig): Allowance {
    val now = SystemClock.elapsedRealtime()
    val ongoing = watch?.takeIf { it.pkg == pkg }
    if (ongoing == null) stopWatching() // The other app's, if any.
    val w = ongoing ?: Watch(pkg, now)
    count(w, now)
    watch = w

    val status = quota.status(cfg.quotaLimits, System.currentTimeMillis(), w.unsavedMs)
    if (status.exhausted != null) {
      stopWatching()
      return Allowance.UsedUp(status, whileWatching = ongoing != null)
    }
    sharedSession = null // The whole feed is allowed; there's no single shared video to track.
    warnIfNearlyUp(status)
    worker.removeCallbacks(quotaTick)
    worker.postDelayed(quotaTick, status.leftMs.coerceIn(MIN_QUOTA_TICK_MS, QUOTA_TICK_MS))
    return Allowance.Watching
  }

  /**
   * Every few seconds while watching, and exactly when the time runs out: is the feed still on
   * screen? Count it and step in once the time is used up. Without this, leaving the app or
   * switching the screen off would go unnoticed (neither produces events from watched apps).
   */
  private val quotaTick = Runnable {
    val w = watch ?: return@Runnable
    val cfg = config
    val currentRules = rules
    if (currentRules == null || !cfg.quotaEnabled || !cfg.isActiveNow() || !power.isInteractive) {
      stopWatching()
      return@Runnable
    }
    val root = findRootFor(w.pkg)
    if (root == null) {
      stopWatching()
      return@Runnable
    }
    val tree = AccessibilityUiTree(root)
    val detection = detector.detect(w.pkg, tree, currentRules) { cfg.isTargetEnabled(it.configKey) }
    if (detection == null) {
      stopWatching()
      return@Runnable
    }
    onFeed(w.pkg, tree, detection, cfg)
  }

  private fun count(w: Watch, now: Long) {
    // Checks come at least every QUOTA_TICK_MS while watching. A longer gap means the phone
    // slept, which isn't watching.
    w.unsavedMs += (now - w.countedTo).coerceIn(0L, MAX_COUNT_GAP_MS)
    w.countedTo = now
    if (now - w.savedAt >= SAVE_EVERY_MS) save(w, now)
  }

  private fun save(w: Watch, now: Long) {
    if (w.unsavedMs > 0L) {
      val end = System.currentTimeMillis() - (now - w.countedTo)
      quota.add(end - w.unsavedMs, end)
      w.unsavedMs = 0L
    }
    w.savedAt = now
  }

  /** The feed is gone (or limits are off): write what was counted and stop the clock. */
  private fun stopWatching() {
    val w = watch ?: return
    watch = null
    worker.removeCallbacks(quotaTick)
    save(w, SystemClock.elapsedRealtime())
  }

  /** One toast per day or hour, about a minute before the feed closes, so it isn't a surprise. */
  private fun warnIfNearlyUp(status: QuotaStatus) {
    if (status.leftMs > WARN_BEFORE_MS) return
    val dayRunsOutFirst = status.leftTodayMs <= status.leftThisHourMs
    val period = if (dayRunsOutFirst) status.dayEndsAt else status.hourEndsAt
    if (warnedFor == period) return
    warnedFor = period
    val message = getString(if (dayRunsOutFirst) R.string.unreel_quota_warn_day else R.string.unreel_quota_warn_hour)
    mainHandler.post { Toast.makeText(this, message, Toast.LENGTH_SHORT).show() }
  }

  /** Overlay and toast wording for a block because the time limit is used up. */
  private fun quotaMessage(status: QuotaStatus): Pair<BlockOverlay.Message, String> {
    if (status.exhausted == QuotaExhausted.HOUR) {
      val again = DateFormat.getTimeFormat(this).format(Date(status.hourEndsAt))
      return BlockOverlay.Message(
        title = getString(R.string.unreel_quota_title_hour),
        body = getString(R.string.unreel_quota_body_hour, QuotaLimits.label(status.limits.hourlyMinutes), again),
      ) to getString(R.string.unreel_quota_toast_hour, again)
    }
    return BlockOverlay.Message(
      title = getString(R.string.unreel_quota_title_day),
      body = getString(R.string.unreel_quota_body_day, QuotaLimits.label(status.limits.dailyMinutes)),
    ) to getString(R.string.unreel_quota_toast_day)
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
    if (sourceId == null) return
    val currentRules = rules ?: return
    // Screen time: only once the player has been seen, so the pager settling as it opens
    // doesn't count as a swipe.
    if (playerOpen && currentRules.targetsFor(pkg).any { sourceId in it.swipeViewIds }) swipedInPlayer = true
    val session = sharedSession ?: return
    val rule = currentRules.targetById(session.ruleId) ?: return
    if (pkg in rule.packageNames && sourceId in rule.swipeViewIds) {
      session.swiped = true
    }
  }

  private fun intervene(pkg: String, tree: UiTree, detection: Detection, trigger: String, usedUp: QuotaStatus? = null) {
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
    val quotaWording = usedUp?.let(::quotaMessage)
    mainHandler.post {
      if (config.interstitial) {
        overlay.show(app, todayTotal, quotaWording?.first)
      } else {
        val text = quotaWording?.second ?: getString(R.string.unreel_toast_blocked, label)
        Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
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

    private const val WATCH_SCAN_DEBOUNCE_MS = 1_000L
    private const val QUOTA_TICK_MS = 5_000L
    private const val MIN_QUOTA_TICK_MS = 250L
    private const val MAX_COUNT_GAP_MS = 10_000L
    private const val SAVE_EVERY_MS = 10_000L
    private const val WARN_BEFORE_MS = 60_000L

    private const val CLASSIFY_EVERY_MS = 1_000L
    private const val USAGE_TICK_MS = 5_000L

    const val TRIGGER_TAB = "tab"
    const val TRIGGER_PLAYER = "player"
    const val TRIGGER_SWIPE = "swipe"
    const val TRIGGER_LIMIT = "limit"
    const val TRIGGER_QUOTA = "quota"

    /** True while the system has this service bound in our process. Read by the module for health. */
    @Volatile
    var running: Boolean = false
      private set
  }
}
