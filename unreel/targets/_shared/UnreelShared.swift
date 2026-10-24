// GENERATED from shared/ios/UnreelShared.swift by scripts/sync-shared-swift.mjs — do not edit this copy.
// SOURCE OF TRUTH — edit this file, then run `npm run sync:swift`.
// Copies live in targets/_shared/ (linked into every extension and the app) and in
// modules/unreel-blocker/ios/ (the Expo module is a separate pod and can't see target files).
//
// Foundation only, on purpose: this file is also linked into the Safari extension, which has no
// business importing FamilyControls.

import Foundation

/// State shared between the app and its Screen Time extensions through the App Group container.
/// Extensions run in their own processes and can't call into the app, so UserDefaults in the
/// group suite is the only channel.
enum UnreelShared {

  /// `group.<main app bundle id>`. Derived rather than hard-coded so changing
  /// `ios.bundleIdentifier` in app.json is the only edit needed. Extensions are configured with
  /// bundle ids `<main>.<suffix>`, so dropping the last component recovers the main id.
  /// Override by adding `UnreelAppGroup` to a target's Info.plist.
  static let appGroupID: String = {
    if let explicit = Bundle.main.object(forInfoDictionaryKey: "UnreelAppGroup") as? String, !explicit.isEmpty {
      return explicit
    }
    var id = Bundle.main.bundleIdentifier ?? "com.unreel.app"
    if Bundle.main.bundlePath.hasSuffix(".appex") {
      id = id.split(separator: ".").dropLast().joined(separator: ".")
    }
    return "group.\(id)"
  }()

  static var defaults: UserDefaults {
    // Falling back to .standard keeps the app usable (but not the extensions) if the App Group
    // entitlement is missing — the status screen surfaces that as "Screen Time not set up".
    UserDefaults(suiteName: appGroupID) ?? .standard
  }

  enum Key {
    static let config = "unreel.config.v1"
    static let selection = "unreel.selection.v1"
    static let budgetExhaustedDay = "unreel.budgetExhaustedDay"
    static let counterPrefix = "unreel.c."
  }

  // MARK: Config

  struct Config: Codable, Equatable {
    enum Mode: String, Codable {
      /// Shield the chosen apps whenever blocking is on.
      case always
      /// Allow `dailyBudgetMinutes` of combined use per day, then shield until midnight.
      case budget
    }

    var enabled: Bool = true
    var mode: Mode = .always
    var dailyBudgetMinutes: Int = 15
    /// Milliseconds since 1970, matching the JS side. 0 = not paused.
    var pausedUntil: Double = 0

    func isPaused(at date: Date = Date()) -> Bool {
      pausedUntil > date.timeIntervalSince1970 * 1000
    }
  }

  static func loadConfig() -> Config {
    guard let data = defaults.data(forKey: Key.config),
          let config = try? JSONDecoder().decode(Config.self, from: data)
    else { return Config() }
    return config
  }

  static func saveConfig(_ config: Config) {
    if let data = try? JSONEncoder().encode(config) {
      defaults.set(data, forKey: Key.config)
    }
  }

  // MARK: Daily allowance

  static func markBudgetExhausted(on date: Date = Date()) {
    defaults.set(dayKey(date), forKey: Key.budgetExhaustedDay)
  }

  /// Keyed by calendar day, so the flag expires by itself at midnight even if no extension runs.
  static func isBudgetExhausted(on date: Date = Date()) -> Bool {
    defaults.string(forKey: Key.budgetExhaustedDay) == dayKey(date)
  }

  // MARK: Counters

  enum Counter: String {
    /// Shield screen rendered (best proxy for "an attempt was stopped").
    case shieldShown = "shown"
    /// User tapped a button on the shield.
    case shieldAction = "action"
  }

  /// Maps a bundle id to the stats bucket the dashboard shows.
  static func appKey(bundleID: String?) -> String {
    switch bundleID {
    case "com.burbn.instagram": return "instagram"
    case "com.google.ios.youtube": return "youtube"
    default: return "other"
    }
  }

  static func increment(_ counter: Counter, app: String, on date: Date = Date()) {
    let key = "\(Key.counterPrefix)\(counter.rawValue).\(dayKey(date)).\(app)"
    defaults.set(defaults.integer(forKey: key) + 1, forKey: key)
  }

  static func count(_ counter: Counter, app: String, on day: String) -> Int {
    defaults.integer(forKey: "\(Key.counterPrefix)\(counter.rawValue).\(day).\(app)")
  }

  static func resetCounters() {
    for key in defaults.dictionaryRepresentation().keys where key.hasPrefix(Key.counterPrefix) {
      defaults.removeObject(forKey: key)
    }
  }

  static func dayKey(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = .current
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: date)
  }
}
