package com.unreel.app.lite

import android.content.Context
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID

/**
 * A change that makes blocking weaker. These wait behind the PIN and the unlock delay.
 * Same rules as src/lib/friction.ts in the Expo app.
 */
data class Change(val kind: Kind, val arg: Long = 0, val label: String) {
  enum class Kind { DISABLE, PAUSE_MINUTES, PAUSE_UNTIL_MIDNIGHT, TARGET_OFF_YOUTUBE, TARGET_OFF_INSTAGRAM, ALLOW_SHARED, LOWER_DELAY, REMOVE_PIN }

  fun toJson(): JSONObject = JSONObject().put("kind", kind.name).put("arg", arg).put("label", label)

  companion object {
    fun fromJson(o: JSONObject) = Change(Kind.valueOf(o.getString("kind")), o.optLong("arg"), o.getString("label"))
  }
}

data class Pending(val change: Change, val readyAt: Long, val expiresAt: Long)

sealed class PinResult {
  object Ok : PinResult()
  data class Wrong(val attemptsLeft: Int) : PinResult()
  data class Locked(val until: Long) : PinResult()
}

/**
 * PIN, unlock delay and the pending request, in private SharedPreferences.
 *
 * Self-control, not security: a salted SHA-256 of a 4–8 digit PIN can't be made brute-force
 * proof, and the user can always revoke Accessibility access in system Settings.
 */
class FrictionStore(context: Context) {
  private val sp = context.applicationContext.getSharedPreferences("unreel_friction", Context.MODE_PRIVATE)

  var delaySec: Int
    get() = sp.getInt(K_DELAY, DEFAULT_DELAY_SEC)
    set(v) {
      sp.edit().putInt(K_DELAY, v).apply()
    }

  val hasPin: Boolean get() = sp.getString(K_HASH, null) != null

  fun setPin(pin: String) {
    val salt = UUID.randomUUID().toString()
    sp.edit().putString(K_SALT, salt).putString(K_HASH, hash(pin, salt)).putInt(K_FAILED, 0).putLong(K_LOCKED, 0).apply()
  }

  fun clearPin() {
    sp.edit().remove(K_SALT).remove(K_HASH).putInt(K_FAILED, 0).putLong(K_LOCKED, 0).apply()
  }

  fun verifyPin(pin: String, now: Long = System.currentTimeMillis()): PinResult {
    val salt = sp.getString(K_SALT, null) ?: return PinResult.Ok
    val expected = sp.getString(K_HASH, null) ?: return PinResult.Ok
    val lockedUntil = sp.getLong(K_LOCKED, 0)
    if (now < lockedUntil) return PinResult.Locked(lockedUntil)
    if (hash(pin, salt) == expected) {
      sp.edit().putInt(K_FAILED, 0).putLong(K_LOCKED, 0).apply()
      return PinResult.Ok
    }
    val failed = sp.getInt(K_FAILED, 0) + 1
    if (failed >= MAX_ATTEMPTS) {
      val until = now + LOCKOUT_MS
      sp.edit().putInt(K_FAILED, 0).putLong(K_LOCKED, until).apply()
      return PinResult.Locked(until)
    }
    sp.edit().putInt(K_FAILED, failed).apply()
    return PinResult.Wrong(MAX_ATTEMPTS - failed)
  }

  fun pending(now: Long = System.currentTimeMillis()): Pending? {
    val raw = sp.getString(K_PENDING, null) ?: return null
    return try {
      val o = JSONObject(raw)
      val p = Pending(Change.fromJson(o.getJSONObject("change")), o.getLong("readyAt"), o.getLong("expiresAt"))
      if (now > p.expiresAt) {
        clearPending()
        null
      } else {
        p
      }
    } catch (_: Exception) {
      clearPending()
      null
    }
  }

  fun startPending(change: Change, now: Long = System.currentTimeMillis()): Pending {
    val readyAt = now + delaySec * 1000L
    val p = Pending(change, readyAt, readyAt + CONFIRM_WINDOW_MS)
    val o = JSONObject().put("change", change.toJson()).put("readyAt", p.readyAt).put("expiresAt", p.expiresAt)
    sp.edit().putString(K_PENDING, o.toString()).apply()
    return p
  }

  fun clearPending() {
    sp.edit().remove(K_PENDING).apply()
  }

  private fun hash(pin: String, salt: String): String =
    MessageDigest.getInstance("SHA-256").digest("$salt:$pin".toByteArray()).joinToString("") { "%02x".format(it) }

  companion object {
    const val DEFAULT_DELAY_SEC = 5 * 60
    const val CONFIRM_WINDOW_MS = 2 * 60_000L
    const val MAX_ATTEMPTS = 5
    const val LOCKOUT_MS = 5 * 60_000L
    val DELAY_OPTIONS_SEC = intArrayOf(0, 60, 5 * 60, 15 * 60, 30 * 60)
    val PIN_PATTERN = Regex("^\\d{4,8}$")

    private const val K_DELAY = "delaySec"
    private const val K_SALT = "pinSalt"
    private const val K_HASH = "pinHash"
    private const val K_FAILED = "failedAttempts"
    private const val K_LOCKED = "lockedUntil"
    private const val K_PENDING = "pending"
  }
}
