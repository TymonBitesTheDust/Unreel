package expo.modules.unreelblocker.widget

import org.junit.Assert.assertEquals
import org.junit.Test

/** The home-screen widget's size choice and words. */
class WidgetModelTest {
  private val min = 60_000L

  @Test fun `the widget shows more as it gets taller`() {
    assertEquals(WidgetSize.COMPACT, WidgetSize.forHeight(70))
    assertEquals(WidgetSize.COMPACT, WidgetSize.forHeight(119))
    assertEquals(WidgetSize.MEDIUM, WidgetSize.forHeight(120))
    assertEquals(WidgetSize.MEDIUM, WidgetSize.forHeight(159))
    assertEquals(WidgetSize.FULL, WidgetSize.forHeight(160))
    assertEquals(WidgetSize.FULL, WidgetSize.forHeight(400))
  }

  @Test fun `a launcher that reports no size gets the default 4x2 layout`() {
    assertEquals(WidgetSize.MEDIUM, WidgetSize.forHeight(0))
  }

  @Test fun `legend durations are short`() {
    assertEquals("0m", WidgetText.compactDuration(0))
    assertEquals("<1m", WidgetText.compactDuration(20_000))
    assertEquals("52m", WidgetText.compactDuration(52 * min))
    assertEquals("2h", WidgetText.compactDuration(120 * min))
    assertEquals("1h 10m", WidgetText.compactDuration(70 * min))
  }

  @Test fun `youtube legend lists every part in order, including empty ones`() {
    val legend = WidgetText.legend("youtube", mapOf("video" to 52 * min, "other" to 17 * min))
    assertEquals(listOf("shorts" to "Shorts 0m", "video" to "Videos 52m", "other" to "Not watching 17m"), legend)
  }

  @Test fun `instagram legend uses the short names`() {
    val legend = WidgetText.legend("instagram", mapOf("normal" to 21 * min, "chat" to 14 * min, "other" to 6 * min))
    assertEquals(
      listOf("scrolling" to "Scrolling 0m", "normal" to "Posts & Stories 21m", "chat" to "Chat 14m", "other" to "Other 6m"),
      legend,
    )
  }

  @Test fun `totals read like the dashboards`() {
    assertEquals("0 min", ScreenTimeFormat.duration(0))
    assertEquals("under 1 min", ScreenTimeFormat.duration(30_000))
    assertEquals("41 min", ScreenTimeFormat.duration(41 * min))
    assertEquals("1 h 10 min", ScreenTimeFormat.duration(70 * min))
    assertEquals("2 h", ScreenTimeFormat.duration(120 * min))
  }
}
