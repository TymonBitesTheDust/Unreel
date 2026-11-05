package expo.modules.unreelblocker.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/** Screen time: observations in, time slices out. */
class UsageMeterTest {

  private val yt = "com.google.android.youtube"
  private val ig = "com.instagram.android"
  private val wall0 = 1_793_000_000_000L // Any wall-clock instant; elapsed time starts at 0.

  private fun meter() = UsageMeter(maxGapMs = 10_000L, saveEveryMs = 10_000L)

  private fun UsageMeter.see(pkg: String, app: String, category: String, atMs: Long) =
    observe(pkg, app, category, atMs, wall0 + atMs)

  @Test fun `the first observation counts nothing yet`() {
    val m = meter()
    assertTrue(m.see(yt, "youtube", "video", 0).isEmpty())
    assertEquals(yt, m.pkg)
  }

  @Test fun `time goes to what was on screen until something else is seen`() {
    val m = meter()
    m.see(yt, "youtube", "other", 0)
    m.see(yt, "youtube", "other", 2_000)
    val slices = m.see(yt, "youtube", "video", 3_000)
    assertEquals(listOf(UsageMeter.Slice("youtube", "other", wall0, wall0 + 3_000)), slices)
  }

  @Test fun `a long stretch on one screen is saved every so often, not only at the end`() {
    val m = meter()
    m.see(yt, "youtube", "video", 0)
    assertTrue(m.see(yt, "youtube", "video", 5_000).isEmpty())
    assertEquals(10_000L, m.see(yt, "youtube", "video", 10_000).single().let { it.toMs - it.fromMs })
    assertTrue(m.see(yt, "youtube", "video", 15_000).isEmpty())
    assertEquals(5_000L, m.stop(16_000, wall0 + 16_000).single().let { it.toMs - it.fromMs })
  }

  @Test fun `leaving the app doesn't count the time since the last check`() {
    val m = meter()
    m.see(ig, "instagram", "chat", 0)
    m.see(ig, "instagram", "chat", 4_000)
    val slice = m.stop(9_000, wall0 + 9_000).single()
    assertEquals(UsageMeter.Slice("instagram", "chat", wall0, wall0 + 4_000), slice)
    assertNull(m.pkg)
  }

  @Test fun `a gap longer than the cap means the phone slept`() {
    val m = meter()
    m.see(yt, "youtube", "video", 0)
    val slice = m.see(yt, "youtube", "other", 60_000).single()
    assertEquals(10_000L, slice.toMs - slice.fromMs)
    assertEquals(wall0 + 60_000, slice.toMs)
  }

  @Test fun `switching apps closes the first app's time`() {
    val m = meter()
    m.see(yt, "youtube", "shorts", 0)
    val slice = m.see(ig, "instagram", "scrolling", 2_000).single()
    assertEquals("youtube", slice.app)
    assertEquals("shorts", slice.category)
    assertEquals(ig, m.pkg)
  }

  @Test fun `nothing is handed out twice`() {
    val m = meter()
    m.see(yt, "youtube", "video", 0)
    m.see(yt, "youtube", "video", 10_000)
    assertTrue(m.stop(10_000, wall0 + 10_000).isEmpty())
    assertTrue(m.stop(11_000, wall0 + 11_000).isEmpty())
  }

  @Test fun `a slice across midnight is split between the two days`() {
    val london = TimeZone.getTimeZone("Europe/London")
    val format = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).apply { timeZone = london }
    val from = format.parse("2026-11-05 23:58")!!.time
    val to = format.parse("2026-11-06 00:03")!!.time
    val byDay = UsageMeter.Slice("youtube", "video", from, to).byDay(london)
    assertEquals(mapOf("2026-11-05" to 120_000L, "2026-11-06" to 180_000L), byDay)
  }
}
