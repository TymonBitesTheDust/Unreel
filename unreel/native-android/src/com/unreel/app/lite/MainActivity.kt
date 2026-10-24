package com.unreel.app.lite

import android.app.Activity
import android.app.AlertDialog
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputFilter
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsetsController
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import expo.modules.unreelblocker.data.BlockEventBus
import expo.modules.unreelblocker.data.BlockerConfig
import expo.modules.unreelblocker.data.BlockerPrefs
import expo.modules.unreelblocker.data.StatsStore
import expo.modules.unreelblocker.detection.RulesRepository
import expo.modules.unreelblocker.service.ServiceStatus
import expo.modules.unreelblocker.service.ShortFormBlockerService
import java.text.DateFormat
import java.util.Calendar
import java.util.Date
import kotlin.math.ceil

/**
 * Native dashboard for the standalone Android build. Same behaviour as the Expo app's
 * src/app/index.tsx + settings.tsx: status and master switch, today's blocks, the week, what to
 * block, and the friction gate (PIN → unlock delay → confirm) in front of anything that loosens
 * blocking.
 *
 * Framework widgets only (no AndroidX), so it builds with nothing but aapt2, kotlinc and dx.
 */
class MainActivity : Activity() {

  private lateinit var p: Palette
  private lateinit var prefs: BlockerPrefs
  private lateinit var stats: StatsStore
  private lateinit var friction: FrictionStore
  private lateinit var scroll: ScrollView
  private lateinit var content: LinearLayout
  private var displayFace: Typeface = Typeface.DEFAULT_BOLD
  private var displayBoldFace: Typeface = Typeface.DEFAULT_BOLD

  private val handler = Handler(Looper.getMainLooper())
  private var stopBlocked: (() -> Unit)? = null
  private var stopState: (() -> Unit)? = null

  // Live parts of the pending-change card, updated every second without a full re-render.
  private var pendingShown: Pending? = null
  private var pendingText: TextView? = null
  private var confirmButton: TextView? = null
  private var pausedUntilShown = 0L

  private val ticker = object : Runnable {
    override fun run() {
      tick()
      handler.postDelayed(this, 1000)
    }
  }

  // ---- Lifecycle -----------------------------------------------------------------------------

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    p = Palette.from(resources)
    prefs = BlockerPrefs(this)
    stats = StatsStore(this)
    friction = FrictionStore(this)
    displayFace = font("fonts/BarlowCondensed_600SemiBold.ttf")
    displayBoldFace = font("fonts/BarlowCondensed_700Bold.ttf")

    content = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(16), dp(20), dp(16), dp(40))
    }
    scroll = ScrollView(this).apply {
      setBackgroundColor(p.background)
      isFillViewport = true
      addView(content)
    }
    setContentView(scroll)
    styleSystemBars()
  }

  override fun onStart() {
    super.onStart()
    // Called on the service's worker thread.
    stopBlocked = BlockEventBus.onBlocked { runOnUiThread { render() } }
    stopState = BlockEventBus.onServiceState { runOnUiThread { render() } }
  }

  override fun onResume() {
    super.onResume()
    render() // Coming back from Settings is when permissions change.
    handler.post(ticker)
  }

  override fun onPause() {
    handler.removeCallbacks(ticker)
    super.onPause()
  }

  override fun onStop() {
    stopBlocked?.invoke()
    stopState?.invoke()
    stopBlocked = null
    stopState = null
    super.onStop()
  }

  // ---- Screen --------------------------------------------------------------------------------

  private var renderQueued = false

  /**
   * Rebuilds the screen on the next frame. Deferred so it's safe to call from inside a switch or
   * click listener whose view is about to be replaced, and so bursts of calls collapse into one.
   */
  private fun render() {
    if (renderQueued) return
    renderQueued = true
    handler.post {
      renderQueued = false
      renderNow()
    }
  }

  private fun renderNow() {
    val scrollY = scroll.scrollY
    content.removeAllViews()
    pendingShown = null
    pendingText = null
    confirmButton = null

    val cfg = prefs.read()
    val now = System.currentTimeMillis()
    val enabledInSettings = ServiceStatus.isEnabledInSettings(this)
    val running = ShortFormBlockerService.running
    val ready = enabledInSettings && running
    val days = stats.lastDays(7)
    val today = days.last()
    pausedUntilShown = if (cfg.pausedUntil > now) cfg.pausedUntil else 0L

    content.addView(text("Unreel", 30f, p.ink, displayBoldFace), margins(bottom = 16))
    content.addView(hero(cfg, ready, today, now))

    friction.pending(now)?.let { content.addView(pendingCard(it), margins(top = 16)) }

    if (!enabledInSettings) {
      content.addView(
        notice(
          "Finish setup to start blocking",
          "Unreel needs Accessibility access to notice when Shorts or Reels open.",
          "Set up Unreel",
        ) { showDisclosure() },
        margins(top = 16),
      )
    } else if (!running) {
      content.addView(
        notice(
          "Android stopped the blocker",
          "This happens after a crash or when a battery saver closes Unreel. Switch Unreel off and on again in Accessibility settings.",
          "Open Accessibility settings",
        ) { openAccessibilitySettings() },
        margins(top = 16),
      )
    }

    section("This week")
    group(WeekChartView(this, p).apply { this.days = days; setPadding(dp(16), 0, dp(16), 0) })

    section("What to block")
    group(
      switchRow(
        "YouTube Shorts",
        if (ServiceStatus.isInstalled(this, "com.google.android.youtube")) null else "YouTube isn’t installed",
        cfg.youtubeShorts,
        first = true,
      ) { on ->
        if (on) save(cfg.copy(youtubeShorts = true))
        else requestLoosening(Change(Change.Kind.TARGET_OFF_YOUTUBE, label = "Stop blocking YouTube Shorts"))
      },
      switchRow(
        "Instagram Reels",
        if (ServiceStatus.isInstalled(this, "com.instagram.android")) null else "Instagram isn’t installed",
        cfg.instagramReels,
      ) { on ->
        if (on) save(cfg.copy(instagramReels = true))
        else requestLoosening(Change(Change.Kind.TARGET_OFF_INSTAGRAM, label = "Stop blocking Instagram Reels"))
      },
      switchRow(
        "Allow one shared video",
        "A Reel or Short someone sends you plays. Swiping to the next one is blocked.",
        cfg.allowSharedReels,
      ) { on ->
        if (on) requestLoosening(Change(Change.Kind.ALLOW_SHARED, label = "Allow shared Reels and Shorts"))
        else save(cfg.copy(allowSharedReels = false))
      },
    )
    footer("Feed posts, Stories, messages, search and long videos keep working.")

    section("Make it harder to give in")
    group(
      if (friction.hasPin) {
        row("Remove PIN", "Asks for the PIN, then waits out the delay.", first = true) {
          requestLoosening(Change(Change.Kind.REMOVE_PIN, label = "Remove your PIN"))
        }
      } else {
        row("Set a PIN", "Give it to a friend if you don’t trust yourself with it.", first = true) { createPin() }
      },
      delayPicker(),
    )
    footer("Turning blocking off, pausing it, allowing an app, removing the PIN or shortening the delay all go through these steps.")

    section("Blocking on this phone")
    val rules = try {
      RulesRepository(this).active().rules.version.toString()
    } catch (_: Exception) {
      "unavailable"
    }
    group(
      switchRow(
        "Show a pause screen",
        "After sending you back, show a full-screen reminder for a few seconds. Off: a short message instead.",
        cfg.interstitial,
        first = true,
      ) { on -> save(cfg.copy(interstitial = on)) },
      row("Accessibility settings", if (running) "Unreel is running" else "Unreel isn’t running") { openAccessibilitySettings() },
      row("App info", "If Unreel’s Accessibility switch is greyed out, tap ⋮ there, then Allow restricted settings.") {
        ServiceStatus.openAppInfo(this)
      },
      row("Detection rules", "Version $rules, built in"),
    )

    section("Your numbers")
    group(
      row("Stopped in total", null, first = true, right = text(stats.allTime().toString(), 24f, p.ink, displayFace)),
      row("Reset numbers", null) {
        AlertDialog.Builder(this)
          .setTitle("Reset your numbers?")
          .setMessage("This clears every count. Blocking keeps working.")
          .setPositiveButton("Reset") { _, _ ->
            stats.reset()
            render()
          }
          .setNegativeButton("Cancel", null)
          .show()
      },
    )
    footer("Unreel has no account and no analytics, and doesn’t use the internet. Block counts and settings never leave this phone.")

    scroll.post { scroll.scrollTo(0, scrollY) }
    tick()
  }

  /** The status block: what's happening, the master switch, and today's crossed-out frames. */
  private fun hero(cfg: BlockerConfig, ready: Boolean, today: StatsStore.DayStats, now: Long): View {
    val box = vertical().apply {
      background = rounded(p.brand, 28)
      setPadding(dp(24), dp(24), dp(24), dp(24))
    }
    val active = cfg.isActiveNow(now)
    val (title, detail) = describe(cfg, ready, now)

    val top = horizontal().apply { gravity = Gravity.CENTER_VERTICAL }
    val titles = vertical()
    titles.addView(text(title, 16f, p.onBrand, Typeface.DEFAULT_BOLD))
    titles.addView(text(detail, 14f, p.onBrandMuted), margins(top = 2))
    top.addView(titles, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    val master = Switch(this).apply {
      isChecked = active
      isEnabled = ready || active
      contentDescription = "Blocking"
      thumbTintList = ColorStateList.valueOf(Color.WHITE)
      trackTintList = ColorStateList(
        arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()),
        intArrayOf(p.signal, Color.argb(90, 255, 255, 255)),
      )
      setOnCheckedChangeListener { _, on ->
        if (on) save(prefs.read().copy(enabled = true, pausedUntil = 0L)) else showPauseOptions()
      }
    }
    top.addView(master)
    box.addView(top)

    val counter = horizontal().apply { gravity = Gravity.BOTTOM }
    counter.addView(text(today.total.toString(), 96f, p.onBrand, displayBoldFace).apply { includeFontPadding = false })
    counter.addView(
      text("Shorts and Reels\nstopped today", 16f, p.onBrandMuted).apply { setPadding(dp(12), 0, 0, dp(14)) },
    )
    box.addView(counter, margins(top = 12))
    box.addView(FrameStripView(this, p).apply { count = today.total }, margins(top = 16))

    val split = horizontal()
    split.addView(appCount("YouTube", today.perApp["youtube"] ?: 0), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    split.addView(appCount("Instagram", today.perApp["instagram"] ?: 0), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    box.addView(split, margins(top = 16))
    return box
  }

  private fun describe(cfg: BlockerConfig, ready: Boolean, now: Long): Pair<String, String> = when {
    !ready -> "Not blocking yet" to "Setup isn’t finished."
    !cfg.enabled -> "Blocking is off" to "Turn it on to stop Shorts and Reels again."
    cfg.pausedUntil > now -> "Paused until ${clock(cfg.pausedUntil)}" to "Blocking comes back on by itself."
    cfg.youtubeShorts && cfg.instagramReels -> "Blocking is on" to "Shorts and Reels close as soon as they open."
    cfg.youtubeShorts -> "Blocking YouTube Shorts" to "Instagram Reels are allowed."
    cfg.instagramReels -> "Blocking Instagram Reels" to "YouTube Shorts are allowed."
    else -> "Nothing to block" to "Both apps are switched off below."
  }

  private fun appCount(label: String, value: Int): View = vertical().apply {
    addView(text(value.toString(), 24f, p.onBrand, displayFace))
    addView(text(label, 13f, p.onBrandMuted))
  }

  // ---- Friction ------------------------------------------------------------------------------

  private fun showPauseOptions() {
    // Every option is ≥ 15 minutes, matching the iOS build (DeviceActivity's minimum).
    val options = listOf(
      Change(Change.Kind.PAUSE_MINUTES, 15, "Pause for 15 minutes"),
      Change(Change.Kind.PAUSE_MINUTES, 60, "Pause for 1 hour"),
      Change(Change.Kind.PAUSE_UNTIL_MIDNIGHT, 0, "Pause until tomorrow"),
      Change(Change.Kind.DISABLE, 0, "Turn blocking off"),
    )
    AlertDialog.Builder(this)
      .setTitle("Take a break from blocking?")
      .setItems(options.map { it.label }.toTypedArray()) { _, which -> requestLoosening(options[which]) }
      .setNegativeButton("Keep blocking", null)
      .setOnDismissListener { render() }
      .show()
  }

  /** PIN (if set) → wait out the delay → confirm. With no delay the change applies at once. */
  private fun requestLoosening(change: Change) {
    if (friction.hasPin) {
      askPin("Needed to ${change.label.replaceFirstChar { it.lowercase() }}.") { afterPin(change) }
    } else {
      afterPin(change)
    }
    render() // Reset any switch the user flipped; the real state hasn't changed yet.
  }

  private fun afterPin(change: Change) {
    if (friction.delaySec <= 0) {
      apply(change)
    } else {
      friction.startPending(change)
      scroll.post { scroll.smoothScrollTo(0, 0) }
    }
    render()
  }

  private fun confirmPending() {
    val pending = friction.pending() ?: return render()
    if (System.currentTimeMillis() < pending.readyAt) return
    friction.clearPending()
    apply(pending.change)
    render()
  }

  private fun apply(change: Change) {
    val cfg = prefs.read()
    val now = System.currentTimeMillis()
    when (change.kind) {
      Change.Kind.DISABLE -> save(cfg.copy(enabled = false))
      Change.Kind.PAUSE_MINUTES -> save(cfg.copy(pausedUntil = now + change.arg * 60_000L))
      Change.Kind.PAUSE_UNTIL_MIDNIGHT -> save(cfg.copy(pausedUntil = nextMidnight(now)))
      Change.Kind.TARGET_OFF_YOUTUBE -> save(cfg.copy(youtubeShorts = false))
      Change.Kind.TARGET_OFF_INSTAGRAM -> save(cfg.copy(instagramReels = false))
      Change.Kind.ALLOW_SHARED -> save(cfg.copy(allowSharedReels = true))
      Change.Kind.LOWER_DELAY -> friction.delaySec = change.arg.toInt()
      Change.Kind.REMOVE_PIN -> friction.clearPin()
    }
    Toast.makeText(this, "Done: ${change.label}", Toast.LENGTH_SHORT).show()
  }

  /** Tightening changes apply immediately. */
  private fun save(next: BlockerConfig) {
    prefs.write(next)
    render()
  }

  private fun pendingCard(pending: Pending): View {
    pendingShown = pending
    val card = vertical().apply {
      background = rounded(p.surface, 16, stroke = p.line, strokeDp = 1.5f)
      setPadding(dp(16), dp(16), dp(16), dp(12))
    }
    card.addView(text(pending.change.label, 16f, p.ink, Typeface.DEFAULT_BOLD))
    pendingText = text("", 14f, p.muted).also { card.addView(it, margins(top = 4)) }
    val actions = horizontal().apply { gravity = Gravity.END }
    actions.addView(button("Never mind", primary = false) {
      friction.clearPending()
      render()
    })
    confirmButton = button("Confirm", primary = true) { confirmPending() }.also { actions.addView(it, wrap(start = 8)) }
    card.addView(actions, margins(top = 12))
    return card
  }

  /** Every second: countdowns, expiry of a pending change, and the end of a pause. */
  private fun tick() {
    val now = System.currentTimeMillis()
    if (pausedUntilShown in 1..now) {
      render()
      return
    }
    val pending = pendingShown ?: return
    if (now > pending.expiresAt) {
      friction.clearPending()
      render()
      return
    }
    val ready = now >= pending.readyAt
    pendingText?.text = if (ready) {
      "Still want to? Confirm within ${countdown(pending.expiresAt - now)} or it’s cancelled."
    } else {
      "Available in ${countdown(pending.readyAt - now)}. Most urges pass before this does."
    }
    confirmButton?.apply {
      isEnabled = ready
      alpha = if (ready) 1f else 0.4f
    }
  }

  private fun askPin(message: String, onOk: () -> Unit) {
    val input = pinField("PIN")
    val dialog = AlertDialog.Builder(this)
      .setTitle("Enter your PIN")
      .setMessage(message)
      .setView(padded(input))
      .setPositiveButton("Continue", null)
      .setNegativeButton("Cancel", null)
      .create()
    dialog.setOnShowListener {
      dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
        when (val result = friction.verifyPin(input.text.toString())) {
          is PinResult.Ok -> {
            dialog.dismiss()
            onOk()
          }
          is PinResult.Wrong -> {
            input.text.clear()
            input.error = "That PIN isn’t right. ${result.attemptsLeft} ${if (result.attemptsLeft == 1) "try" else "tries"} left."
          }
          is PinResult.Locked -> {
            val minutes = ceil((result.until - System.currentTimeMillis()) / 60_000.0).toInt().coerceAtLeast(1)
            input.text.clear()
            input.error = "Too many wrong PINs. Try again in $minutes min."
          }
        }
      }
    }
    dialog.show()
  }

  private fun createPin() {
    val first = pinField("PIN")
    val second = pinField("Same PIN again")
    val fields = vertical().apply {
      addView(first)
      addView(second, margins(top = 8))
    }
    val dialog = AlertDialog.Builder(this)
      .setTitle("Set a PIN")
      .setMessage("You’ll need it to turn blocking off, pause it, or loosen any setting. 4 to 8 digits.")
      .setView(padded(fields))
      .setPositiveButton("Save PIN", null)
      .setNegativeButton("Cancel", null)
      .create()
    dialog.setOnShowListener {
      dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
        val pin = first.text.toString()
        when {
          !FrictionStore.PIN_PATTERN.matches(pin) -> first.error = "Use 4 to 8 digits."
          pin != second.text.toString() -> second.error = "The two PINs don’t match."
          else -> {
            friction.setPin(pin)
            dialog.dismiss()
            render()
          }
        }
      }
    }
    dialog.show()
  }

  private fun delayPicker(): View {
    val box = vertical().apply {
      setPadding(dp(16), dp(14), dp(16), dp(16))
      background = topDivider()
    }
    box.addView(text("Unlock delay", 16f, p.ink))
    box.addView(text("How long to wait before a change that loosens blocking takes effect.", 14f, p.muted), margins(top = 2))
    val current = friction.delaySec
    val segmented = horizontal().apply {
      background = rounded(p.background, 12, stroke = p.line, strokeDp = 1f)
      setPadding(dp(3), dp(3), dp(3), dp(3))
    }
    for (seconds in FrictionStore.DELAY_OPTIONS_SEC) {
      val selected = seconds == current
      val option = text(delayLabel(seconds), 14f, if (selected) p.ink else p.muted, if (selected) Typeface.DEFAULT_BOLD else Typeface.DEFAULT).apply {
        gravity = Gravity.CENTER
        setPadding(0, dp(9), 0, dp(9))
        if (selected) background = rounded(p.surface, 9, stroke = p.line, strokeDp = 1f)
        isClickable = true
        contentDescription = "Unlock delay ${delayLabel(seconds)}${if (selected) ", selected" else ""}"
        setOnClickListener {
          when {
            seconds > current -> {
              friction.delaySec = seconds
              render()
            }
            seconds < current -> requestLoosening(
              Change(Change.Kind.LOWER_DELAY, seconds.toLong(), "Shorten the unlock delay to ${delayLabel(seconds).lowercase()}"),
            )
          }
        }
      }
      segmented.addView(option, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    }
    box.addView(segmented, margins(top = 12))
    return box
  }

  /**
   * Google Play's prominent-disclosure requirement for non-accessibility-tool apps: say what's
   * read and why, before sending the user to Settings, with a way to decline.
   */
  private fun showDisclosure() {
    AlertDialog.Builder(this)
      .setTitle("Unreel uses Accessibility access")
      .setMessage(
        "It’s how Unreel notices the moment Shorts or Reels open, so it can send you back to the main feed.\n\n" +
          "• It watches only YouTube and Instagram.\n" +
          "• It reads the names of on-screen layout elements, like whether the Reels tab is selected. Not your messages, captions or typing.\n" +
          "• It presses Back or taps Home for you, only when the Shorts or Reels feed is on screen.\n" +
          "• Everything stays on this phone.\n\n" +
          "In Settings, choose Unreel and switch it on. If the switch is greyed out, open App info, tap ⋮, then Allow restricted settings.",
      )
      .setPositiveButton("Agree and open settings") { _, _ -> openAccessibilitySettings() }
      .setNeutralButton("Open App info") { _, _ -> ServiceStatus.openAppInfo(this) }
      .setNegativeButton("Not now", null)
      .show()
  }

  private fun openAccessibilitySettings() {
    if (!ServiceStatus.openSettings(this)) {
      Toast.makeText(this, "Open Settings, then Accessibility, then Unreel.", Toast.LENGTH_LONG).show()
    }
  }

  // ---- Building blocks -----------------------------------------------------------------------

  private fun section(title: String) {
    content.addView(text(title, 24f, p.ink, displayFace), margins(top = 28, bottom = 8, start = 4))
  }

  private fun footer(message: String) {
    content.addView(text(message, 13f, p.muted), margins(top = 8, start = 4, end = 4))
  }

  private fun group(vararg rows: View) {
    val box = vertical().apply {
      background = rounded(p.surface, 16, stroke = p.line, strokeDp = 1f)
      clipToOutline = true
    }
    rows.forEach { box.addView(it) }
    content.addView(box)
  }

  private fun row(title: String, subtitle: String?, first: Boolean = false, right: View? = null, onClick: (() -> Unit)? = null): View {
    val r = horizontal().apply {
      gravity = Gravity.CENTER_VERTICAL
      minimumHeight = dp(56)
      setPadding(dp(16), dp(12), dp(16), dp(12))
      if (!first) background = topDivider()
    }
    val texts = vertical()
    texts.addView(text(title, 16f, p.ink))
    subtitle?.let { texts.addView(text(it, 14f, p.muted), margins(top = 2)) }
    r.addView(texts, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    right?.let { r.addView(it, wrap(start = 12)) }
    if (onClick != null) {
      r.isClickable = true
      r.foreground = ripple()
      r.setOnClickListener { onClick() }
    }
    return r
  }

  private fun switchRow(title: String, subtitle: String?, checked: Boolean, first: Boolean = false, onChange: (Boolean) -> Unit): View {
    val toggle = Switch(this).apply {
      isChecked = checked
      contentDescription = title
      thumbTintList = ColorStateList.valueOf(Color.WHITE)
      trackTintList = ColorStateList(
        arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()),
        intArrayOf(p.brand, p.line),
      )
      setOnCheckedChangeListener { _, on -> onChange(on) }
    }
    return row(title, subtitle, first, toggle)
  }

  private fun notice(title: String, body: String, action: String, onClick: () -> Unit): View = vertical().apply {
    background = rounded(p.warnSurface, 16)
    setPadding(dp(16), dp(16), dp(16), dp(16))
    addView(text(title, 16f, p.ink, Typeface.DEFAULT_BOLD))
    addView(text(body, 14f, p.ink), margins(top = 4))
    addView(button(action, primary = true, onClick = onClick), margins(top = 12))
  }

  private fun button(label: String, primary: Boolean, onClick: () -> Unit): TextView =
    text(label, 16f, if (primary) p.background else p.ink, Typeface.DEFAULT_BOLD).apply {
      gravity = Gravity.CENTER
      minHeight = dp(44)
      setPadding(dp(16), dp(10), dp(16), dp(10))
      if (primary) background = rounded(p.ink, 12)
      isClickable = true
      foreground = ripple()
      setOnClickListener { if (isEnabled) onClick() }
    }

  private fun text(value: String, sizeSp: Float, color: Int, typeface: Typeface = Typeface.DEFAULT): TextView =
    TextView(this).apply {
      text = value
      setTextColor(color)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
      this.typeface = typeface
      setLineSpacing(0f, 1.15f)
    }

  private fun pinField(hint: String) = EditText(this).apply {
    this.hint = hint
    inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
    filters = arrayOf(InputFilter.LengthFilter(8))
    setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
    letterSpacing = 0.3f
  }

  private fun padded(view: View): View = LinearLayout(this).apply {
    setPadding(dp(24), dp(8), dp(24), 0)
    addView(view, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
  }

  private fun vertical() = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

  private fun horizontal() = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }

  private fun rounded(color: Int, radiusDp: Int, stroke: Int? = null, strokeDp: Float = 1f) = GradientDrawable().apply {
    setColor(color)
    cornerRadius = dp(radiusDp).toFloat()
    if (stroke != null) setStroke(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, strokeDp, resources.displayMetrics).toInt().coerceAtLeast(1), stroke)
  }

  /** A hairline across the top of a row, used between rows in a group. */
  private fun topDivider() = android.graphics.drawable.LayerDrawable(
    arrayOf(GradientDrawable().apply { setColor(p.line) }, GradientDrawable().apply { setColor(p.surface) }),
  ).apply { setLayerInset(1, 0, 1, 0, 0) }

  private fun ripple() = TypedValue().let { tv ->
    theme.resolveAttribute(android.R.attr.selectableItemBackground, tv, true)
    getDrawable(tv.resourceId)
  }

  private fun margins(top: Int = 0, bottom: Int = 0, start: Int = 0, end: Int = 0) =
    LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
      setMargins(dp(start), dp(top), dp(end), dp(bottom))
    }

  /** For children of horizontal rows, which must not stretch to the full width. */
  private fun wrap(start: Int = 0) =
    LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
      marginStart = dp(start)
    }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

  private fun font(path: String): Typeface = try {
    Typeface.createFromAsset(assets, path)
  } catch (_: RuntimeException) {
    Typeface.DEFAULT_BOLD
  }

  @Suppress("DEPRECATION")
  private fun styleSystemBars() {
    window.statusBarColor = p.background
    window.navigationBarColor = p.background
    if (p.dark) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
      window.insetsController?.setSystemBarsAppearance(light, light)
    } else {
      window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
    }
  }

  private companion object {
    fun clock(ms: Long): String = DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(ms))

    fun countdown(ms: Long): String {
      val total = ceil(ms.coerceAtLeast(0) / 1000.0).toLong()
      val h = total / 3600
      val m = (total % 3600) / 60
      val s = total % 60
      return if (h > 0) "$h h $m min" else "%d:%02d".format(m, s)
    }

    fun nextMidnight(now: Long): Long = Calendar.getInstance().apply {
      timeInMillis = now
      add(Calendar.DAY_OF_YEAR, 1)
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }.timeInMillis

    fun delayLabel(seconds: Int): String = when (seconds) {
      0 -> "None"
      60 -> "1 min"
      else -> "${seconds / 60} min"
    }
  }
}
