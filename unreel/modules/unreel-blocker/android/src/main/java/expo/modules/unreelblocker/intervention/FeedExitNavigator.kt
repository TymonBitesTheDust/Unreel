package expo.modules.unreelblocker.intervention

import android.accessibilityservice.AccessibilityService
import expo.modules.unreelblocker.detection.Detection
import expo.modules.unreelblocker.detection.EntryPoint
import expo.modules.unreelblocker.detection.ShortFormDetector
import expo.modules.unreelblocker.detection.UiNode
import expo.modules.unreelblocker.detection.UiTree

/**
 * Takes the user out of the feed while keeping them inside the app.
 *
 * Preference order:
 *  1. Click the app's own Home tab (Instagram `feed_tab`, YouTube "Home"). The user lands on the
 *     part of the app they're allowed to use, and playback stops because the feed fragment pauses.
 *  2. Global BACK. Right for a reel opened from a DM: back returns to the chat.
 *  3. Global HOME — only used by the service's escalation if 1 and 2 didn't work.
 */
class FeedExitNavigator(
  private val service: AccessibilityService,
  private val detector: ShortFormDetector,
) {
  enum class Method(val wireName: String) {
    EXIT_TAB("exitTab"),
    BACK("back"),
    HOME("home"),
  }

  fun exit(tree: UiTree, detection: Detection): Method {
    // A player opened from a DM sits in a modal with no tab bar — clicking a stale, off-screen
    // Home tab from an underlying window would do nothing, so go straight to BACK there.
    if (detection.entry == EntryPoint.FEED_TAB) {
      val target = detector.findExitTarget(tree, detection.rule.exitTab)
      if (target != null && clickSelfOrAncestor(target)) return Method.EXIT_TAB
    }
    service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
    return Method.BACK
  }

  fun escalate(attempt: Int): Method =
    if (attempt <= 1) {
      service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
      Method.BACK
    } else {
      service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
      Method.HOME
    }

  /** Labels often sit on a non-clickable child of the real button; walk up a few levels. */
  private fun clickSelfOrAncestor(node: UiNode): Boolean {
    var current: UiNode? = node
    repeat(4) {
      val n = current ?: return false
      if (n.isClickable && n.click()) return true
      current = n.parent
    }
    return false
  }
}
