// GENERATED from shared/ios/ShieldApplier.swift by scripts/sync-shared-swift.mjs — do not edit this copy.
// SOURCE OF TRUTH — edit this file, then run `npm run sync:swift`.
// Copies live in targets/activity-monitor/ and modules/unreel-blocker/ios/.

import DeviceActivity
import FamilyControls
import Foundation
import ManagedSettings

/// Turns the shared config + the user's app selection into Screen Time state.
///
/// Everything here is idempotent and derives its decision from the App Group, because it runs
/// from two places that never talk to each other: the app (when the user changes something) and
/// the DeviceActivity monitor extension (at midnight, when a pause ends, when the allowance runs
/// out). Whoever runs last wins, and both reach the same answer.
enum ShieldApplier {

  /// A named store, so clearing our shields never touches another Screen Time app's.
  static let store = ManagedSettingsStore(named: ManagedSettingsStore.Name("unreel"))

  static let dailyActivity = DeviceActivityName("unreel.daily")
  static let pauseActivity = DeviceActivityName("unreel.pause")
  static let budgetEvent = DeviceActivityEvent.Name("unreel.budget")

  /// DeviceActivity rejects schedules shorter than this (MonitoringError.intervalTooShort).
  static let minimumScheduleInterval: TimeInterval = 15 * 60

  // MARK: Selection

  /// The apps the user picked. Opaque tokens: we can shield them but can't see which apps they are.
  static func loadSelection() -> FamilyActivitySelection? {
    guard let data = UnreelShared.defaults.data(forKey: UnreelShared.Key.selection) else { return nil }
    return try? PropertyListDecoder().decode(FamilyActivitySelection.self, from: data)
  }

  static func saveSelection(_ selection: FamilyActivitySelection) {
    if let data = try? PropertyListEncoder().encode(selection) {
      UnreelShared.defaults.set(data, forKey: UnreelShared.Key.selection)
    }
  }

  static func isEmpty(_ selection: FamilyActivitySelection?) -> Bool {
    guard let s = selection else { return true }
    return s.applicationTokens.isEmpty && s.categoryTokens.isEmpty && s.webDomainTokens.isEmpty
  }

  // MARK: Shields

  /// Applies or clears shields to match the current config. Safe to call any time, from anywhere.
  @discardableResult
  static func sync(now: Date = Date()) -> Bool {
    let config = UnreelShared.loadConfig()
    let selection = loadSelection()
    let shouldShield: Bool = {
      guard config.enabled, !config.isPaused(at: now), !isEmpty(selection) else { return false }
      switch config.mode {
      case .always: return true
      case .budget: return UnreelShared.isBudgetExhausted(on: now)
      }
    }()
    if shouldShield, let selection {
      shield(selection)
    } else {
      store.clearAllSettings()
    }
    return shouldShield
  }

  static var isShieldActive: Bool {
    !(store.shield.applications?.isEmpty ?? true)
      || store.shield.applicationCategories != nil
      || !(store.shield.webDomains?.isEmpty ?? true)
  }

  private static func shield(_ s: FamilyActivitySelection) {
    store.shield.applications = s.applicationTokens.isEmpty ? nil : s.applicationTokens
    store.shield.applicationCategories = s.categoryTokens.isEmpty ? nil : .specific(s.categoryTokens)
    store.shield.webDomains = s.webDomainTokens.isEmpty ? nil : s.webDomainTokens
  }

  // MARK: Schedules (call from the app)

  /// Registers the all-day repeating activity. Its callbacks are how the extension gets a chance
  /// to run at midnight (allowance reset) and when the allowance threshold is crossed.
  static func rescheduleDaily() throws {
    let center = DeviceActivityCenter()
    center.stopMonitoring([dailyActivity])

    let config = UnreelShared.loadConfig()
    guard config.enabled, let selection = loadSelection(), !isEmpty(selection) else { return }

    let schedule = DeviceActivitySchedule(
      intervalStart: DateComponents(hour: 0, minute: 0),
      intervalEnd: DateComponents(hour: 23, minute: 59),
      repeats: true
    )
    var events: [DeviceActivityEvent.Name: DeviceActivityEvent] = [:]
    if config.mode == .budget {
      let threshold = DateComponents(minute: max(1, config.dailyBudgetMinutes))
      if #available(iOS 17.4, *) {
        // Count usage from midnight, not from when monitoring (re)started. Without this, changing
        // any setting mid-day would hand the user a fresh allowance.
        events[budgetEvent] = DeviceActivityEvent(
          applications: selection.applicationTokens,
          categories: selection.categoryTokens,
          webDomains: selection.webDomainTokens,
          threshold: threshold,
          includesPastActivity: true
        )
      } else {
        events[budgetEvent] = DeviceActivityEvent(
          applications: selection.applicationTokens,
          categories: selection.categoryTokens,
          webDomains: selection.webDomainTokens,
          threshold: threshold
        )
      }
    }
    try center.startMonitoring(dailyActivity, during: schedule, events: events)
  }

  /// One-off activity that ends when the pause ends; the extension re-applies shields in
  /// `intervalDidEnd`. Needed because the app is usually not running when a pause expires.
  static func schedulePauseEnd(at end: Date, from start: Date = Date()) throws {
    let center = DeviceActivityCenter()
    center.stopMonitoring([pauseActivity])
    let parts: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
    let calendar = Calendar.current
    let schedule = DeviceActivitySchedule(
      intervalStart: calendar.dateComponents(parts, from: start),
      intervalEnd: calendar.dateComponents(parts, from: end),
      repeats: false
    )
    try center.startMonitoring(pauseActivity, during: schedule)
  }

  static func cancelPause() {
    DeviceActivityCenter().stopMonitoring([pauseActivity])
  }
}
