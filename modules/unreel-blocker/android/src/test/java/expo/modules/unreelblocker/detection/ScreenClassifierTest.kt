package expo.modules.unreelblocker.detection

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** Screen time: which part of YouTube or Instagram a screen counts as, with the bundled rules. */
class ScreenClassifierTest {

  private val rules = DetectionRules.parse(File("src/main/assets/unreel_rules.json").readText())
  private val detector = ShortFormDetector()
  private val classifier = ScreenClassifier(detector)

  private fun youtube(tree: UiTree, swiped: Boolean = false) = classify("com.google.android.youtube", tree, swiped)
  private fun instagram(tree: UiTree, swiped: Boolean = false) = classify("com.instagram.android", tree, swiped)

  private fun classify(pkg: String, tree: UiTree, swiped: Boolean): String {
    val app = rules.screenTimeFor(pkg)!!
    // As the service does: detection with every target on, so time is recorded even when not blocking.
    return classifier.classify(app, tree, detector.detect(pkg, tree, rules) { true }, swiped)
  }

  private fun yt(name: String, visible: Boolean = true) = node("com.google.android.youtube:id/$name", visible = visible)
  private fun ig(name: String, selected: Boolean = false, visible: Boolean = true, children: List<FakeNode> = emptyList()) =
    node("com.instagram.android:id/$name", selected = selected, visible = visible, children = children)

  @Test fun `bundled rules cover both apps`() {
    assertEquals("youtube", rules.screenTimeFor("com.google.android.youtube")?.app)
    assertEquals("instagram", rules.screenTimeFor("com.instagram.android")?.app)
  }

  // ---- YouTube -------------------------------------------------------------------------------

  @Test fun `youtube shorts tab is shorts`() {
    assertEquals("shorts", youtube(FakeTree(node(label = "Home"), node(label = "Shorts", selected = true))))
  }

  @Test fun `a single short opened from a link is still shorts`() {
    assertEquals("shorts", youtube(FakeTree(yt("reel_player_page_container"))))
  }

  @Test fun `the watch page is video`() {
    assertEquals("video", youtube(FakeTree(node(label = "Home"), yt("watch_player"))))
  }

  @Test fun `browsing with nothing playing is other`() {
    assertEquals("other", youtube(FakeTree(node(label = "Home", selected = true), yt("results"))))
  }

  @Test fun `a shorts pager left off-screen behind the watch page is video, not shorts`() {
    assertEquals("video", youtube(FakeTree(yt("reel_recycler", visible = false), yt("watch_player"))))
  }

  // ---- Instagram -----------------------------------------------------------------------------

  @Test fun `instagram reels tab is scrolling`() {
    val tree = FakeTree(
      ig("feed_tab", children = listOf(ig("tab_icon"))),
      ig("clips_tab", children = listOf(ig("tab_icon", selected = true))),
      ig("clips_viewer_view_pager"),
    )
    assertEquals("scrolling", instagram(tree))
  }

  @Test fun `one reel opened from a post or DM is normal until the user swipes`() {
    val tree = FakeTree(ig("clips_viewer_view_pager"))
    assertEquals("normal", instagram(tree, swiped = false))
    assertEquals("scrolling", instagram(tree, swiped = true))
  }

  @Test fun `stories are normal, never scrolling`() {
    val tree = FakeTree(ig("reel_viewer_container"), ig("clips_video_container"))
    assertEquals("normal", instagram(tree, swiped = true))
  }

  @Test fun `a DM thread is chat`() {
    assertEquals("chat", instagram(FakeTree(ig("message_list"), ig("row_thread_composer_edittext"))))
  }

  @Test fun `the messages tab is chat`() {
    assertEquals("chat", instagram(FakeTree(node(label = "Messages", selected = true), node(label = "Home"))))
  }

  @Test fun `a reel shared in a DM and opened full screen is normal, not chat`() {
    assertEquals("normal", instagram(FakeTree(ig("message_list", visible = false), ig("clips_viewer_view_pager"))))
  }

  @Test fun `the home feed is normal`() {
    val tree = FakeTree(
      ig("feed_tab", children = listOf(ig("tab_icon", selected = true))),
      ig("clips_tab", children = listOf(ig("tab_icon"))),
      ig("media_group"),
    )
    assertEquals("normal", instagram(tree))
  }

  @Test fun `a post opened from explore is normal`() {
    assertEquals("normal", instagram(FakeTree(ig("row_feed_photo_profile_name"), ig("row_feed_button_like"))))
  }

  @Test fun `explore grid, profile or search is other`() {
    assertEquals("other", instagram(FakeTree(ig("search_tab", selected = true), ig("explore_grid"))))
  }

  @Test fun `hidden chat views left in the tree don't count`() {
    val tree = FakeTree(ig("feed_tab", children = listOf(ig("tab_icon", selected = true))), ig("message_list", visible = false))
    assertEquals("normal", instagram(tree))
  }

  // ---- Rules ---------------------------------------------------------------------------------

  private val target = """{"id":"t","app":"youtube","feature":"shorts","configKey":"youtubeShorts",
    "packageNames":["p"],"playerViewIds":["p:id/player"]}"""

  @Test fun `rules without a screenTime section still parse`() {
    val parsed = DetectionRules.parse("""{"schema":1,"version":5,"targets":[$target]}""")
    assertTrue(parsed.screenTime.isEmpty())
  }

  @Test fun `screen time categories the dashboards can't show are rejected`() {
    assertRejected("""{"app":"youtube","packageNames":["p"],"categories":[{"id":"gaming","viewIds":["p:id/x"]}]}""", "isn't one of")
  }

  @Test fun `screen time categories naming a missing target are rejected`() {
    assertRejected("""{"app":"youtube","packageNames":["p"],"categories":[{"id":"shorts","target":"nope"}]}""", "unknown target")
  }

  private fun assertRejected(screenApp: String, message: String) {
    try {
      DetectionRules.parse("""{"schema":1,"version":5,"targets":[$target],"screenTime":[$screenApp]}""")
      throw AssertionError("expected rejection")
    } catch (e: IllegalArgumentException) {
      assertTrue(e.message, e.message!!.contains(message))
    }
  }
}
