package expo.modules.unreelblocker.service

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings

/** Settings-side view of the service, plus deep links the dashboard uses during setup. */
object ServiceStatus {

  fun component(context: Context): ComponentName =
    ComponentName(context.packageName, ShortFormBlockerService::class.java.name)

  /**
   * Whether the user switched the service on. This can be true while the service is NOT running
   * (crashed and Android marked it "not working", or an OEM battery killer stopped the process);
   * the dashboard compares it with [ShortFormBlockerService.running] to detect that state.
   */
  fun isEnabledInSettings(context: Context): Boolean {
    val enabled = Settings.Secure.getString(
      context.contentResolver,
      Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
    ) ?: return false
    val target = component(context)
    return enabled.split(':').any { ComponentName.unflattenFromString(it) == target }
  }

  /**
   * Opens our service's own settings page where the OS supports it (Android 11+ on most builds),
   * otherwise the accessibility list. Returns false if nothing could be opened.
   */
  fun openSettings(context: Context): Boolean {
    val details = Intent(ACTION_ACCESSIBILITY_DETAILS)
      .putExtra(Intent.EXTRA_COMPONENT_NAME, component(context).flattenToString())
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (tryStart(context, details)) return true
    return tryStart(
      context,
      Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    )
  }

  /**
   * App info page. On Android 13+ a sideloaded APK's accessibility toggle is greyed out
   * ("Restricted setting") until the user opens App info → ⋮ → "Allow restricted settings".
   */
  fun openAppInfo(context: Context): Boolean = tryStart(
    context,
    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
  )

  fun isInstalled(context: Context, packageName: String): Boolean =
    context.packageManager.getLaunchIntentForPackage(packageName) != null

  private fun tryStart(context: Context, intent: Intent): Boolean = try {
    context.startActivity(intent)
    true
  } catch (_: ActivityNotFoundException) {
    false
  } catch (_: SecurityException) {
    // Some builds keep the details activity unexported.
    false
  }

  private const val ACTION_ACCESSIBILITY_DETAILS = "android.settings.ACCESSIBILITY_DETAILS_SETTINGS"
}
