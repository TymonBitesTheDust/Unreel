package expo.modules.unreelblocker.service

import android.os.SystemClock
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Debug builds only: when a watched app shows a screen nothing matched, log the distinct view IDs
 * on it so a broken rule can be fixed from `adb logcat -s UnreelDiag`.
 *
 * Why not `uiautomator dump`? It waits for the window to go idle, and a playing reel never idles,
 * so it hangs on exactly the screens you need. The service already has the tree.
 *
 * Reads ONLY viewIdResourceName — never text or content descriptions, which on these screens
 * would be private messages and captions.
 */
internal class ViewIdDiagnostics {
  private val seenSignatures = HashSet<String>()
  private var lastWalkAt = 0L

  fun maybeLog(pkg: String, root: AccessibilityNodeInfo) {
    val now = SystemClock.elapsedRealtime()
    if (now - lastWalkAt < THROTTLE_MS) return
    lastWalkAt = now

    val ids = LinkedHashSet<String>()
    val queue = ArrayDeque<AccessibilityNodeInfo>()
    queue.add(root)
    var visited = 0
    while (queue.isNotEmpty() && visited < NODE_LIMIT) {
      val node = queue.removeFirst()
      visited++
      if (node.isVisibleToUser) node.viewIdResourceName?.let { ids.add(it) }
      for (i in 0 until node.childCount) node.getChild(i)?.let { queue.add(it) }
    }
    val signature = ids.joinToString(",")
    if (seenSignatures.size > MAX_SIGNATURES || !seenSignatures.add(signature)) return
    Log.d(TAG, "unmatched $pkg (${visited} nodes): $signature")
  }

  private companion object {
    const val TAG = "UnreelDiag"
    const val THROTTLE_MS = 5_000L
    const val NODE_LIMIT = 800
    const val MAX_SIGNATURES = 200
  }
}
