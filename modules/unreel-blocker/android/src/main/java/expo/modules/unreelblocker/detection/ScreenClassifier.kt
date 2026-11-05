package expo.modules.unreelblocker.detection

/**
 * Sorts what's on screen into one part of the app for the Screen time view, e.g. YouTube
 * "shorts" / "video" / "other" or Instagram "scrolling" / "normal" / "chat" / "other".
 *
 * Pure like [ShortFormDetector], so it's unit-tested with fake trees. The caller passes the
 * short-form [Detection] for this screen (made with every target enabled, so screen time is
 * recorded even for an app the user isn't blocking) and whether the user has swiped in the
 * player since it opened.
 */
class ScreenClassifier(private val detector: ShortFormDetector) {

  fun classify(app: ScreenTimeApp, tree: UiTree, detection: Detection?, swipedInPlayer: Boolean): String {
    for (category in app.categories) {
      if (matches(category, tree, detection, swipedInPlayer)) return category.id
    }
    return OTHER
  }

  private fun matches(category: ScreenCategory, tree: UiTree, detection: Detection?, swiped: Boolean): Boolean {
    if (category.target != null && detection != null && detection.rule.id == category.target) {
      val endless = detection.entry == EntryPoint.FEED_TAB || swiped
      val hit = when (category.entry) {
        TargetEntry.ANY -> true
        TargetEntry.FEED -> endless
        TargetEntry.SINGLE -> !endless
      }
      if (hit) return true
    }
    if (category.viewIds.any { id -> tree.findByViewId(id).any { it.isVisibleToUser } }) return true
    return !category.tab.isEmpty && detector.isTabSelected(tree, category.tab)
  }

  companion object {
    const val OTHER = "other"
  }
}
