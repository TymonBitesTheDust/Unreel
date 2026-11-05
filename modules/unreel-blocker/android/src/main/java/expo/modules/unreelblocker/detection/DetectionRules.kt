package expo.modules.unreelblocker.detection

import expo.modules.unreelblocker.data.SCREEN_CATEGORIES
import org.json.JSONArray
import org.json.JSONObject

/**
 * Data-driven description of what a short-form feed looks like inside a host app.
 *
 * Everything that changes when YouTube or Instagram ships a redesign lives here rather than in
 * code, so a broken view ID is fixed by shipping a new JSON file (bundled asset or a remote
 * update through [RulesRepository]) instead of a new app release.
 */
data class TabMatcher(
  /** Fully-qualified resource IDs, e.g. `com.instagram.android:id/clips_tab`. */
  val viewIds: List<String>,
  /** Accessibility labels (content description or text), e.g. "Shorts". Matched as a whole word. */
  val labels: List<String>,
) {
  val isEmpty: Boolean get() = viewIds.isEmpty() && labels.isEmpty()
}

data class TargetRule(
  val id: String,
  /** Stable short name used in stats and events: "youtube" | "instagram". */
  val app: String,
  /** "shorts" | "reels". */
  val feature: String,
  val label: String,
  /** Key of the per-target on/off switch in [expo.modules.unreelblocker.data.BlockerConfig]. */
  val configKey: String,
  val packageNames: List<String>,
  /** The dedicated feed tab. Selected tab ⇒ the user is in the infinite feed ⇒ block immediately. */
  val feedTab: TabMatcher,
  /** Containers that only exist inside the full-screen vertical player, whichever way it was opened. */
  val playerViewIds: List<String>,
  /** The vertical pager. A scroll event from one of these means the user swiped to the next item. */
  val swipeViewIds: List<String>,
  /** If any of these is visible, never treat the screen as the feed (e.g. Instagram Stories). */
  val excludeViewIds: List<String>,
  /** Where to send the user: a tab we can click to leave the feed without leaving the app. */
  val exitTab: TabMatcher,
)

/** Which short-form screens a [ScreenCategory] with a target matches. */
enum class TargetEntry {
  /** The feed tab or the player, however it was opened. */
  ANY,
  /** The feed tab, or a player the user has swiped in: endless scrolling. */
  FEED,
  /** A player opened from elsewhere (a DM, a post) and not swiped: one video. */
  SINGLE,
}

/**
 * One part of an app for the Screen time view, e.g. YouTube "video" or Instagram "chat".
 * Matches if any of its signals does: the short-form [target] (by rule id, for [entry]), any
 * visible [viewIds], or a selected [tab].
 */
data class ScreenCategory(
  val id: String,
  val target: String?,
  val entry: TargetEntry,
  val viewIds: List<String>,
  val tab: TabMatcher,
)

/** How to sort time in one app into parts. Categories are tried in order; no match is "other". */
data class ScreenTimeApp(
  /** Stable short name used in stats: "youtube" | "instagram". */
  val app: String,
  val packageNames: List<String>,
  val categories: List<ScreenCategory>,
)

data class DetectionRules(
  val schema: Int,
  val version: Long,
  val targets: List<TargetRule>,
  /** Optional: rules without it still block; screen time then counts everything as "other". */
  val screenTime: List<ScreenTimeApp> = emptyList(),
) {
  val packageNames: Set<String> = targets.flatMap { it.packageNames }.toSet()

  fun targetsFor(packageName: String): List<TargetRule> =
    targets.filter { packageName in it.packageNames }

  fun targetById(id: String): TargetRule? = targets.firstOrNull { it.id == id }

  fun screenTimeFor(packageName: String): ScreenTimeApp? = screenTime.firstOrNull { packageName in it.packageNames }

  companion object {
    const val SUPPORTED_SCHEMA = 1

    /**
     * Parses and validates a rules document. Throws [IllegalArgumentException] with a readable
     * message instead of returning half-valid rules, because a bad remote push must never
     * silently disable blocking.
     */
    @Throws(IllegalArgumentException::class)
    fun parse(json: String): DetectionRules {
      val root = try {
        JSONObject(json)
      } catch (e: Exception) {
        throw IllegalArgumentException("Rules are not valid JSON: ${e.message}")
      }
      val schema = root.optInt("schema", -1)
      require(schema == SUPPORTED_SCHEMA) { "Unsupported rules schema $schema (expected $SUPPORTED_SCHEMA)" }
      val version = root.optLong("version", -1)
      require(version > 0) { "Rules need a positive numeric 'version'" }

      val targetsJson = root.optJSONArray("targets")
        ?: throw IllegalArgumentException("Rules need a 'targets' array")
      val targets = (0 until targetsJson.length()).map { i -> parseTarget(targetsJson.getJSONObject(i)) }
      require(targets.isNotEmpty()) { "Rules must define at least one target" }
      require(targets.map { it.id }.toSet().size == targets.size) { "Target ids must be unique" }

      val screenJson = root.optJSONArray("screenTime")
      val screenTime = if (screenJson == null) {
        emptyList()
      } else {
        (0 until screenJson.length()).map { i -> parseScreenApp(screenJson.getJSONObject(i), targets.map { it.id }.toSet()) }
      }

      return DetectionRules(schema, version, targets, screenTime)
    }

    private fun parseScreenApp(o: JSONObject, targetIds: Set<String>): ScreenTimeApp {
      val app = o.requireString("app")
      val known = SCREEN_CATEGORIES[app] ?: throw IllegalArgumentException("Screen time: unknown app '$app'")
      val packageNames = o.stringList("packageNames")
      require(packageNames.isNotEmpty()) { "Screen time for '$app' has no packageNames" }
      val list = o.optJSONArray("categories") ?: JSONArray()
      val categories = (0 until list.length()).map { i ->
        val c = list.getJSONObject(i)
        val id = c.requireString("id")
        require(id in known) { "Screen time for '$app': category '$id' isn't one of $known" }
        val target = c.optString("target", "").ifBlank { null }
        require(target == null || target in targetIds) { "Screen time for '$app': unknown target '$target'" }
        val entry = when (val e = c.optString("entry", "any")) {
          "any" -> TargetEntry.ANY
          "feed" -> TargetEntry.FEED
          "single" -> TargetEntry.SINGLE
          else -> throw IllegalArgumentException("Screen time for '$app': unknown entry '$e'")
        }
        val category = ScreenCategory(id, target, entry, c.stringList("viewIds"), c.tabMatcher("tab"))
        require(target != null || category.viewIds.isNotEmpty() || !category.tab.isEmpty) {
          "Screen time for '$app': category '$id' has nothing to match"
        }
        (category.viewIds + category.tab.viewIds).forEach { viewId ->
          require(":id/" in viewId) { "Screen time for '$app': '$viewId' must be a fully-qualified id (pkg:id/name)" }
        }
        category
      }
      return ScreenTimeApp(app, packageNames, categories)
    }

    private fun parseTarget(o: JSONObject): TargetRule {
      val id = o.requireString("id")
      val rule = TargetRule(
        id = id,
        app = o.requireString("app"),
        feature = o.requireString("feature"),
        label = o.optString("label", id),
        configKey = o.requireString("configKey"),
        packageNames = o.stringList("packageNames"),
        feedTab = o.tabMatcher("feedTab"),
        playerViewIds = o.stringList("playerViewIds"),
        swipeViewIds = o.stringList("swipeViewIds"),
        excludeViewIds = o.stringList("excludeViewIds"),
        exitTab = o.tabMatcher("exitTab"),
      )
      require(rule.packageNames.isNotEmpty()) { "Target '$id' has no packageNames" }
      require(!rule.feedTab.isEmpty || rule.playerViewIds.isNotEmpty()) {
        "Target '$id' needs feedTab matchers or playerViewIds, otherwise it can never match"
      }
      val allIds = rule.feedTab.viewIds + rule.playerViewIds + rule.swipeViewIds +
        rule.excludeViewIds + rule.exitTab.viewIds
      allIds.forEach { viewId ->
        require(":id/" in viewId) { "Target '$id': '$viewId' must be a fully-qualified id (pkg:id/name)" }
      }
      return rule
    }

    private fun JSONObject.requireString(key: String): String {
      val v = optString(key, "")
      require(v.isNotBlank()) { "Missing '$key'" }
      return v
    }

    private fun JSONObject.stringList(key: String): List<String> {
      val arr: JSONArray = optJSONArray(key) ?: return emptyList()
      return (0 until arr.length()).map { arr.getString(it) }.filter { it.isNotBlank() }
    }

    private fun JSONObject.tabMatcher(key: String): TabMatcher {
      val o = optJSONObject(key) ?: return TabMatcher(emptyList(), emptyList())
      return TabMatcher(o.stringList("viewIds"), o.stringList("labels"))
    }
  }
}
