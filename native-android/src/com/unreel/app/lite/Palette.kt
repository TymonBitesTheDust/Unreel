package com.unreel.app.lite

import android.content.res.Configuration
import android.content.res.Resources
import android.graphics.Color

/** Mirrors src/theme.ts in the Expo app. */
data class Palette(
  val background: Int,
  val surface: Int,
  val ink: Int,
  val muted: Int,
  val line: Int,
  val brand: Int,
  val link: Int,
  val onBrand: Int,
  val onBrandMuted: Int,
  val signal: Int,
  val ok: Int,
  val warnSurface: Int,
  val danger: Int,
  val dark: Boolean,
  // Screen time categories (chart marks only, never text). The dataviz reference palette's first
  // three categorical slots, stepped per mode and checked against this app's surfaces.
  /** Watching / normal use. */
  val vizBlue: Int,
  /** The short-form feeds: Shorts, scrolling Reels. */
  val vizOrange: Int,
  /** Chat. */
  val vizAqua: Int,
) {
  companion object {
    fun from(resources: Resources): Palette {
      val night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
      return if (night) {
        Palette(
          c("#0D1124"), c("#171C35"), c("#EEF0F7"), c("#9AA1BC"), c("#2A3050"), c("#3443E0"), c("#9AA6FF"),
          Color.WHITE, c("#C2C8F5"), c("#FFB020"), c("#4CC38A"), c("#33270F"), c("#FF7A61"), true,
          c("#3987E5"), c("#D95926"), c("#199E70"),
        )
      } else {
        Palette(
          c("#EDEFF3"), Color.WHITE, c("#10162F"), c("#5A6075"), c("#D5D9E2"), c("#2B3BD6"), c("#2B3BD6"),
          Color.WHITE, c("#C9CEF7"), c("#FFB020"), c("#1E8E5A"), c("#FFF1D6"), c("#C23A22"), false,
          c("#2A78D6"), c("#EB6834"), c("#1BAF7A"),
        )
      }
    }

    private fun c(hex: String) = Color.parseColor(hex)
  }
}
