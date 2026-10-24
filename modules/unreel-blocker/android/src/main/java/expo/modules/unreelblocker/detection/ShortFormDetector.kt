package expo.modules.unreelblocker.detection

/** How the user reached the short-form surface. Drives the "allow one shared reel" behaviour. */
enum class EntryPoint {
  /** The dedicated Shorts / Reels tab is selected — the infinite feed. Always blocked. */
  FEED_TAB,
  /** The full-screen vertical player without the feed tab, e.g. a reel opened from a DM. */
  PLAYER,
}

data class Detection(val rule: TargetRule, val entry: EntryPoint)

/**
 * Pure, stateless detection: given one window's UI tree, is a short-form feed on screen?
 *
 * Order of checks per target:
 *  1. Feed tab selected  → FEED_TAB (cheapest signal, and unambiguous).
 *  2. Exclusion visible  → not a feed (Instagram Stories reuse "reel" naming internally).
 *  3. Player visible     → PLAYER.
 *
 * Only *visible* nodes count: both apps keep detached fragments (e.g. the Shorts pager after you
 * switch to Home) alive in the tree, and matching those would block the whole app.
 */
class ShortFormDetector {

  fun detect(
    packageName: String,
    tree: UiTree,
    rules: DetectionRules,
    isEnabled: (TargetRule) -> Boolean,
  ): Detection? {
    for (rule in rules.targetsFor(packageName)) {
      if (!isEnabled(rule)) continue
      if (isTabSelected(tree, rule.feedTab)) return Detection(rule, EntryPoint.FEED_TAB)
      if (anyVisible(tree, rule.excludeViewIds)) continue
      if (anyVisible(tree, rule.playerViewIds)) return Detection(rule, EntryPoint.PLAYER)
    }
    return null
  }

  /** Finds a visible node for [matcher] that can be clicked to leave the feed, if any. */
  fun findExitTarget(tree: UiTree, matcher: TabMatcher): UiNode? {
    for (id in matcher.viewIds) {
      tree.findByViewId(id).firstOrNull { it.isVisibleToUser }?.let { return it }
    }
    for (label in matcher.labels) {
      tree.findByText(label)
        .firstOrNull { it.isVisibleToUser && labelMatches(it.label, label) }
        ?.let { return it }
    }
    return null
  }

  internal fun isTabSelected(tree: UiTree, matcher: TabMatcher): Boolean {
    for (id in matcher.viewIds) {
      if (tree.findByViewId(id).any { it.isVisibleToUser && isActive(it) }) return true
    }
    for (label in matcher.labels) {
      val hit = tree.findByText(label).any { node ->
        node.isVisibleToUser && labelMatches(node.label, label) && isActive(node)
      }
      if (hit) return true
    }
    return false
  }

  private fun anyVisible(tree: UiTree, viewIds: List<String>): Boolean =
    viewIds.any { id -> tree.findByViewId(id).any { it.isVisibleToUser } }

  /**
   * Tabs mark selection inconsistently: Instagram sets selected=true on the child `tab_icon`,
   * YouTube on the pivot item or its parent. Check the node, two ancestors and two levels of
   * descendants — enough for both apps without walking whole subtrees.
   */
  internal fun isActive(node: UiNode): Boolean {
    if (node.isSelected) return true
    var ancestor = node.parent
    repeat(2) {
      val current = ancestor ?: return@repeat
      if (current.isSelected) return true
      ancestor = current.parent
    }
    return hasSelectedDescendant(node, depth = 2)
  }

  private fun hasSelectedDescendant(node: UiNode, depth: Int): Boolean {
    if (depth == 0) return false
    for (i in 0 until node.childCount) {
      val child = node.child(i) ?: continue
      if (child.isSelected || hasSelectedDescendant(child, depth - 1)) return true
    }
    return false
  }

  companion object {
    /**
     * `findByText("Shorts")` is a substring search, so it also hits video titles like
     * "best shorts of 2026". Accept only labels that *are* the tab name, optionally followed by
     * the state suffixes apps append ("Shorts, selected", "Reels, Tab 3 of 5").
     */
    fun labelMatches(nodeLabel: String?, target: String): Boolean {
      val label = nodeLabel?.trim()?.lowercase() ?: return false
      val t = target.trim().lowercase()
      if (label == t) return true
      if (!label.startsWith(t)) return false
      val rest = label.substring(t.length)
      return (rest.startsWith(",") || rest.startsWith(" ")) && rest.length <= 32
    }
  }
}
