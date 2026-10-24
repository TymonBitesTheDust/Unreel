package expo.modules.unreelblocker.detection

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

data class DetectionRules(
  val schema: Int,
  val version: Long,
  val targets: List<TargetRule>,
) {
  val packageNames: Set<String> = targets.flatMap { it.packageNames }.toSet()

  fun targetsFor(packageName: String): List<TargetRule> =
    targets.filter { packageName in it.packageNames }

  fun targetById(id: String): TargetRule? = targets.firstOrNull { it.id == id }

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

      return DetectionRules(schema, version, targets)
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
