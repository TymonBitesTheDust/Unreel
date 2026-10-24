package expo.modules.unreelblocker.detection

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Detection tests against hand-built trees that mirror what the apps expose.
 * Run with: ./gradlew :unreel-blocker:testDebugUnitTest (from android/ after prebuild).
 */
class ShortFormDetectorTest {

  private val rules = DetectionRules.parse(File("src/main/assets/unreel_rules.json").readText())
  private val detector = ShortFormDetector()
  private val all: (TargetRule) -> Boolean = { true }

  @Test fun `bundled rules parse and cover both apps`() {
    assertEquals(setOf("com.google.android.youtube", "com.instagram.android"), rules.packageNames)
  }

  @Test fun `instagram reels tab selected on child tab_icon is the feed`() {
    val tree = FakeTree(
      node("com.instagram.android:id/feed_tab", children = listOf(node("com.instagram.android:id/tab_icon"))),
      node("com.instagram.android:id/clips_tab", children = listOf(node("com.instagram.android:id/tab_icon", selected = true))),
    )
    val d = detector.detect("com.instagram.android", tree, rules, all)
    assertEquals(EntryPoint.FEED_TAB, d?.entry)
    assertEquals("instagram_reels", d?.rule?.id)
  }

  @Test fun `instagram home feed with inline video is not blocked`() {
    val tree = FakeTree(
      node("com.instagram.android:id/feed_tab", children = listOf(node("com.instagram.android:id/tab_icon", selected = true))),
      node("com.instagram.android:id/clips_tab", children = listOf(node("com.instagram.android:id/tab_icon"))),
      node("com.instagram.android:id/media_group"),
    )
    assertNull(detector.detect("com.instagram.android", tree, rules, all))
  }

  @Test fun `reel opened from a DM is a PLAYER entry`() {
    val tree = FakeTree(node("com.instagram.android:id/clips_viewer_view_pager"))
    assertEquals(EntryPoint.PLAYER, detector.detect("com.instagram.android", tree, rules, all)?.entry)
  }

  @Test fun `instagram stories are never treated as reels`() {
    val tree = FakeTree(
      node("com.instagram.android:id/reel_viewer_container"),
      node("com.instagram.android:id/clips_video_container"),
    )
    assertNull(detector.detect("com.instagram.android", tree, rules, all))
  }

  @Test fun `off-screen shorts pager left in the tree does not block youtube`() {
    val tree = FakeTree(
      node("com.google.android.youtube:id/reel_recycler", visible = false),
      node(label = "Home", selected = true),
    )
    assertNull(detector.detect("com.google.android.youtube", tree, rules, all))
  }

  @Test fun `youtube shorts pivot tab selected is the feed`() {
    val tree = FakeTree(node(label = "Home"), node(label = "Shorts", selected = true))
    assertEquals(EntryPoint.FEED_TAB, detector.detect("com.google.android.youtube", tree, rules, all)?.entry)
  }

  @Test fun `a selected video titled with the word shorts is not the tab`() {
    val tree = FakeTree(node(label = "My favourite basketball shorts of all time — full review", selected = true))
    assertNull(detector.detect("com.google.android.youtube", tree, rules, all))
  }

  @Test fun `disabled target is ignored`() {
    val tree = FakeTree(node("com.google.android.youtube:id/reel_player_page_container"))
    assertNull(detector.detect("com.google.android.youtube", tree, rules) { it.app != "youtube" })
  }

  @Test fun `exit target prefers instagram feed_tab id`() {
    val tree = FakeTree(node("com.instagram.android:id/feed_tab", clickable = true))
    val rule = rules.targetById("instagram_reels")!!
    assertNotNull(detector.findExitTarget(tree, rule.exitTab))
  }

  @Test fun `label matching accepts state suffixes only`() {
    assertTrue(ShortFormDetector.labelMatches("Shorts", "Shorts"))
    assertTrue(ShortFormDetector.labelMatches("Reels, Tab 3 of 5", "Reels"))
    assertFalse(ShortFormDetector.labelMatches("Shortstop highlights", "Shorts"))
    assertFalse(ShortFormDetector.labelMatches(null, "Shorts"))
  }

  @Test fun `invalid rules are rejected, not half-applied`() {
    val bad = """{"schema":1,"version":5,"targets":[{"id":"x","app":"a","feature":"f","configKey":"k",
      "packageNames":["p"],"playerViewIds":["no_package_prefix"]}]}"""
    try {
      DetectionRules.parse(bad)
      throw AssertionError("expected rejection")
    } catch (e: IllegalArgumentException) {
      assertTrue(e.message!!.contains("fully-qualified"))
    }
  }

  // ---- Fakes ---------------------------------------------------------------------------------

  private class FakeNode(
    override val viewId: String?,
    override val label: String?,
    override val isSelected: Boolean,
    override val isVisibleToUser: Boolean,
    override val isClickable: Boolean,
    private val children: List<FakeNode>,
  ) : UiNode {
    override var parent: UiNode? = null
    override val childCount: Int get() = children.size
    override fun child(index: Int): UiNode? = children.getOrNull(index)
    override fun click(): Boolean = isClickable

    init {
      children.forEach { it.parent = this }
    }

    fun flatten(): List<FakeNode> = listOf(this) + children.flatMap { it.flatten() }
  }

  private fun node(
    id: String? = null,
    label: String? = null,
    selected: Boolean = false,
    visible: Boolean = true,
    clickable: Boolean = false,
    children: List<FakeNode> = emptyList(),
  ) = FakeNode(id, label, selected, visible, clickable, children)

  private class FakeTree(vararg roots: FakeNode) : UiTree {
    private val nodes = roots.flatMap { it.flatten() }
    override fun findByViewId(viewId: String) = nodes.filter { it.viewId == viewId }
    override fun findByText(text: String) =
      nodes.filter { it.label?.contains(text, ignoreCase = true) == true }
  }
}
