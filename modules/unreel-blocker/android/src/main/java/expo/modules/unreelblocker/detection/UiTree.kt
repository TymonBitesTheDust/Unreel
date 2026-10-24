package expo.modules.unreelblocker.detection

import android.view.accessibility.AccessibilityNodeInfo

/**
 * The slice of an accessibility node the detector needs. Kept as an interface so detection can be
 * unit-tested on the JVM with fake trees (see ShortFormDetectorTest) — AccessibilityNodeInfo
 * itself can't be constructed off-device.
 */
interface UiNode {
  val viewId: String?
  val label: String?
  val isSelected: Boolean
  val isVisibleToUser: Boolean
  val isClickable: Boolean
  val parent: UiNode?
  val childCount: Int
  fun child(index: Int): UiNode?
  fun click(): Boolean
}

/** Lookups against one window's tree. Implementations should use the platform's indexed search. */
interface UiTree {
  fun findByViewId(viewId: String): List<UiNode>
  /** Platform semantics: case-insensitive substring match on text and content description. */
  fun findByText(text: String): List<UiNode>
}

/** Adapter over the real accessibility tree. One instance per scan; don't keep it around. */
class AccessibilityUiTree(private val root: AccessibilityNodeInfo) : UiTree {
  override fun findByViewId(viewId: String): List<UiNode> =
    safe { root.findAccessibilityNodeInfosByViewId(viewId) }.map(::AccessibilityUiNode)

  override fun findByText(text: String): List<UiNode> =
    safe { root.findAccessibilityNodeInfosByText(text) }.map(::AccessibilityUiNode)

  // Lookups are IPC into the target app and can throw if its window is torn down mid-scan.
  private inline fun safe(block: () -> List<AccessibilityNodeInfo>?): List<AccessibilityNodeInfo> =
    try {
      block() ?: emptyList()
    } catch (_: RuntimeException) {
      emptyList()
    }
}

class AccessibilityUiNode(private val node: AccessibilityNodeInfo) : UiNode {
  override val viewId: String? get() = node.viewIdResourceName
  override val label: String? get() = (node.contentDescription ?: node.text)?.toString()
  override val isSelected: Boolean get() = node.isSelected
  override val isVisibleToUser: Boolean get() = node.isVisibleToUser
  override val isClickable: Boolean get() = node.isClickable
  override val parent: UiNode? get() = node.parent?.let(::AccessibilityUiNode)
  override val childCount: Int get() = node.childCount
  override fun child(index: Int): UiNode? = node.getChild(index)?.let(::AccessibilityUiNode)
  override fun click(): Boolean = node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
}
