import DeviceActivity
import ExpoModulesCore
import FamilyControls
import ManagedSettings

/// Partial update from JS. Absent fields keep their current value.
/// Android-only keys (youtubeShorts, instagramReels, …) are simply ignored here.
struct ConfigPatch: Record {
  @Field var enabled: Bool?
  @Field var iosMode: String?
  @Field var dailyBudgetMinutes: Int?
  @Field var pausedUntil: Double?
}

final class PauseTooShortException: Exception {
  override var reason: String {
    "iOS can't schedule a pause shorter than 15 minutes."
  }
}

final class ScheduleFailedException: GenericException<String> {
  override var reason: String {
    "Screen Time refused the schedule: \(param)"
  }
}

/// iOS side of the Unreel bridge.
///
/// iOS gives third-party apps no way to look inside Instagram or YouTube, so instead of
/// detecting the Reels/Shorts screen (Android's approach), this module:
///   1. asks for Screen Time (FamilyControls) authorization for the individual user,
///   2. lets the user pick Instagram + YouTube with Apple's privacy-preserving picker,
///   3. shields those apps via ManagedSettings, always or after a daily allowance,
///   4. hands time-based changes (midnight, pause end) to the DeviceActivity monitor extension.
/// Safari is handled separately by the web extension in targets/safari, which *can* remove just
/// Reels and Shorts from instagram.com / youtube.com.
public class UnreelBlockerModule: Module {

  public func definition() -> ModuleDefinition {
    Name("UnreelBlocker")

    // Declared for API parity with Android. Shield extensions can't reach the running app, so
    // iOS never emits it; the dashboard refreshes stats when it comes to the foreground instead.
    Events("onBlocked", "onServiceStateChanged")

    Function("getStatus") { () -> [String: Any] in
      let selection = ShieldApplier.loadSelection()
      return [
        "platform": "ios",
        "authorization": Self.authorizationStatus(),
        // nil when the App Group entitlement is missing from the signed app — extensions would
        // then never see the config or selection.
        "appGroupReachable": FileManager.default
          .containerURL(forSecurityApplicationGroupIdentifier: UnreelShared.appGroupID) != nil,
        "selection": [
          "applications": selection?.applicationTokens.count ?? 0,
          "categories": selection?.categoryTokens.count ?? 0,
          "webDomains": selection?.webDomainTokens.count ?? 0,
        ],
        "shieldActive": ShieldApplier.isShieldActive,
        "budgetExhaustedToday": UnreelShared.isBudgetExhausted(),
      ]
    }

    AsyncFunction("requestAuthorization") { () async throws -> String in
      // .individual: the user authorizes themselves with Face ID / passcode (iOS 16+). No parent
      // or Family Sharing involved. Throws if the user cancels.
      try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
      return Self.authorizationStatus()
    }

    AsyncFunction("presentAppPicker") { (promise: Promise) in
      Task { @MainActor in
        ActivityPickerPresenter.present { selection in
          guard let selection else {
            promise.resolve(nil)
            return
          }
          ShieldApplier.saveSelection(selection)
          do {
            try ShieldApplier.rescheduleDaily()
          } catch {
            // Shields still apply below; only the allowance/midnight callbacks are affected.
          }
          ShieldApplier.sync()
          promise.resolve([
            "applications": selection.applicationTokens.count,
            "categories": selection.categoryTokens.count,
            "webDomains": selection.webDomainTokens.count,
          ])
        }
      }
    }

    Function("getConfig") { () -> [String: Any] in
      Self.toDictionary(UnreelShared.loadConfig())
    }

    AsyncFunction("setConfig") { (patch: ConfigPatch) throws -> [String: Any] in
      let previous = UnreelShared.loadConfig()
      var next = previous
      if let enabled = patch.enabled { next.enabled = enabled }
      if let raw = patch.iosMode, let mode = UnreelShared.Config.Mode(rawValue: raw) { next.mode = mode }
      if let minutes = patch.dailyBudgetMinutes { next.dailyBudgetMinutes = min(max(minutes, 1), 24 * 60) }
      if let until = patch.pausedUntil { next.pausedUntil = until }

      // Validate the pause before persisting anything, so a rejected pause can't half-apply.
      let now = Date()
      let pauseEnd = Date(timeIntervalSince1970: next.pausedUntil / 1000)
      let pauseChanged = next.pausedUntil != previous.pausedUntil
      if pauseChanged && next.pausedUntil > 0 {
        guard pauseEnd.timeIntervalSince(now) >= ShieldApplier.minimumScheduleInterval else {
          throw PauseTooShortException()
        }
      }

      UnreelShared.saveConfig(next)

      do {
        if pauseChanged {
          if next.pausedUntil > 0 {
            try ShieldApplier.schedulePauseEnd(at: pauseEnd, from: now)
          } else {
            ShieldApplier.cancelPause()
          }
        }
        if next.enabled != previous.enabled || next.mode != previous.mode
          || next.dailyBudgetMinutes != previous.dailyBudgetMinutes {
          try ShieldApplier.rescheduleDaily()
        }
      } catch {
        // Roll back so the stored config never claims a schedule that doesn't exist.
        UnreelShared.saveConfig(previous)
        ShieldApplier.sync()
        throw ScheduleFailedException(error.localizedDescription)
      }

      ShieldApplier.sync(now: now)
      return Self.toDictionary(next)
    }

    Function("getStats") { (days: Int) -> [String: Any] in
      let count = min(max(days, 1), 60)
      let calendar = Calendar.current
      let today = Date()
      let window: [[String: Any]] = (0..<count).reversed().map { offset in
        let date = calendar.date(byAdding: .day, value: -offset, to: today) ?? today
        let key = UnreelShared.dayKey(date)
        let youtube = UnreelShared.count(.shieldShown, app: "youtube", on: key)
        let instagram = UnreelShared.count(.shieldShown, app: "instagram", on: key)
        let other = UnreelShared.count(.shieldShown, app: "other", on: key)
        return ["date": key, "youtube": youtube, "instagram": instagram, "total": youtube + instagram + other]
      }
      let allTime = window.reduce(0) { $0 + (($1["total"] as? Int) ?? 0) }
      return [
        "days": window,
        "today": window.last ?? [:],
        // iOS keeps per-day keys only; "all time" is the visible window. Good enough for a dashboard.
        "allTime": allTime,
      ]
    }

    Function("resetStats") {
      UnreelShared.resetCounters()
    }
  }

  private static func authorizationStatus() -> String {
    switch AuthorizationCenter.shared.authorizationStatus {
    case .notDetermined: return "notDetermined"
    case .denied: return "denied"
    case .approved: return "approved"
    @unknown default:
      // Newer SDKs add finer-grained approvals; anything containing "approved" is usable.
      return String(describing: AuthorizationCenter.shared.authorizationStatus)
        .lowercased().contains("approved") ? "approved" : "unknown"
    }
  }

  private static func toDictionary(_ config: UnreelShared.Config) -> [String: Any] {
    [
      "enabled": config.enabled,
      "iosMode": config.mode.rawValue,
      "dailyBudgetMinutes": config.dailyBudgetMinutes,
      "pausedUntil": config.pausedUntil,
    ]
  }
}
