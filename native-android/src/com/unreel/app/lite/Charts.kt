package com.unreel.app.lite

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.view.View
import expo.modules.unreelblocker.data.StatsStore
import java.text.SimpleDateFormat
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

/** Today's blocks as crossed-out 9:16 frames, one per Short or Reel stopped (max 40, then "+N"). */
class FrameStripView(context: Context, private val p: Palette) : View(context) {
  var count: Int = 0
    set(value) {
      field = value
      requestLayout()
      invalidate()
    }

  private val density = resources.displayMetrics.density
  private val frameW = 12 * density
  private val frameH = 21 * density
  private val gap = 6 * density
  private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeWidth = 1.5f * density
    color = p.onBrandMuted
  }
  private val strike = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeWidth = 2f * density
    color = p.signal
  }
  private val more = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = p.onBrandMuted
    textSize = 14 * resources.displayMetrics.scaledDensity
  }

  private fun perRow(width: Int): Int = max(1, ((width + gap) / (frameW + gap)).toInt())

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    val width = MeasureSpec.getSize(widthMeasureSpec)
    val cells = if (count == 0) 1 else min(count, MAX) + if (count > MAX) 1 else 0
    val rows = ceil(cells / perRow(width).toDouble()).toInt()
    setMeasuredDimension(width, (rows * frameH + (rows - 1) * gap).toInt() + 2)
  }

  override fun onDraw(canvas: Canvas) {
    val row = perRow(width)
    val shown = min(count, MAX)
    if (count == 0) {
      stroke.pathEffect = android.graphics.DashPathEffect(floatArrayOf(4 * density, 3 * density), 0f)
      canvas.drawRoundRect(RectF(1f, 1f, frameW, frameH), 2.5f * density, 2.5f * density, stroke)
      stroke.pathEffect = null
      return
    }
    for (i in 0 until shown) {
      val x = (i % row) * (frameW + gap) + 1
      val y = (i / row) * (frameH + gap) + 1
      val rect = RectF(x, y, x + frameW - 2, y + frameH - 2)
      canvas.save()
      canvas.clipPath(Path().apply { addRoundRect(rect, 2.5f * density, 2.5f * density, Path.Direction.CW) })
      canvas.drawLine(rect.left, rect.bottom, rect.right, rect.top, strike)
      canvas.restore()
      canvas.drawRoundRect(rect, 2.5f * density, 2.5f * density, stroke)
    }
    if (count > MAX) {
      val i = shown
      val x = (i % row) * (frameW + gap)
      val y = (i / row) * (frameH + gap) + frameH * 0.7f
      canvas.drawText("+${count - MAX}", x, y, more)
    }
  }

  private companion object {
    const val MAX = 40
  }
}

/** Seven slim bars, today in the brand colour, counts above non-empty days. */
class WeekChartView(context: Context, private val p: Palette) : View(context) {
  var days: List<StatsStore.DayStats> = emptyList()
    set(value) {
      field = value
      contentDescription = value.joinToString(", ") { "${initial(it.date)} ${it.total}" }
      invalidate()
    }

  private val density = resources.displayMetrics.density
  private val sp = resources.displayMetrics.scaledDensity
  private val bar = Paint(Paint.ANTI_ALIAS_FLAG)
  private val label = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    textSize = 13 * sp
    textAlign = Paint.Align.CENTER
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), (132 * density).toInt())
  }

  override fun onDraw(canvas: Canvas) {
    if (days.isEmpty()) return
    val maxTotal = max(1, days.maxOf { it.total })
    val colW = width / days.size.toFloat()
    val barMax = 72 * density
    val baseline = height - 28 * density
    days.forEachIndexed { i, d ->
      val today = i == days.lastIndex
      val cx = colW * i + colW / 2
      val h = if (d.total == 0) 3 * density else max(6 * density, d.total / maxTotal.toFloat() * barMax)
      bar.color = if (today) p.brand else p.ink
      bar.alpha = if (today) 255 else if (d.total > 0) 56 else 30
      val half = 7 * density
      canvas.drawRoundRect(RectF(cx - half, baseline - h, cx + half, baseline), 4 * density, 4 * density, bar)

      label.color = p.muted
      label.typeface = Typeface.DEFAULT
      if (d.total > 0) canvas.drawText(d.total.toString(), cx, baseline - h - 6 * density, label)
      label.color = if (today) p.ink else p.muted
      label.typeface = if (today) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
      canvas.drawText(initial(d.date), cx, height - 8 * density, label)
    }
  }

  private fun initial(day: String): String = try {
    val date = SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(day)
    SimpleDateFormat("EEEEE", Locale.getDefault()).format(date!!)
  } catch (_: Exception) {
    ""
  }
}
