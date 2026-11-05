package expo.modules.unreelblocker.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import kotlin.math.max

/**
 * One whole split into parts, as a thin bar: fully rounded ends, a gap between parts, a part at
 * zero draws nothing, an empty whole shows only the track. Shared by the dashboard's
 * SegmentedBarView and the home-screen widget, which can't host custom views and gets a bitmap.
 */
object BarPainter {
  /** [parts]: (value, colour) in display order. */
  fun draw(canvas: Canvas, parts: List<Pair<Long, Int>>, width: Float, height: Float, gap: Float, minPart: Float, emptyColor: Int, paint: Paint) {
    val shown = parts.filter { it.first > 0 }
    val total = shown.sumOf { it.first }
    val bounds = RectF(0f, 0f, width, height)
    if (total <= 0L) {
      paint.color = emptyColor
      canvas.drawRoundRect(bounds, height / 2, height / 2, paint)
      return
    }
    val usable = width - gap * (shown.size - 1)
    canvas.save()
    canvas.clipPath(Path().apply { addRoundRect(bounds, height / 2, height / 2, Path.Direction.CW) })
    var x = 0f
    shown.forEachIndexed { i, (value, color) ->
      // Even a sliver stays visible; the clip trims any overshoot at the far end.
      val segment = max(minPart, usable * value / total)
      paint.color = color
      canvas.drawRect(x, 0f, if (i == shown.lastIndex) width else x + segment, height, paint)
      x += segment + gap
    }
    canvas.restore()
  }

  fun bitmap(parts: List<Pair<Long, Int>>, widthPx: Int, heightPx: Int, gap: Float, minPart: Float, emptyColor: Int): Bitmap {
    val bitmap = Bitmap.createBitmap(widthPx.coerceAtLeast(1), heightPx.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
    draw(Canvas(bitmap), parts, bitmap.width.toFloat(), bitmap.height.toFloat(), gap, minPart, emptyColor, Paint(Paint.ANTI_ALIAS_FLAG))
    return bitmap
  }
}
