import ManagedSettings
import ManagedSettingsUI
import UIKit

/// Draws the screen iOS shows instead of a shielded app. iOS renders it; we only supply text,
/// colours and an icon. It's also our best signal for "Unreel just stopped an attempt", so it
/// bumps the counter the dashboard reads.
///
/// Note: iOS may ask for the configuration more than once per appearance (e.g. on a theme change),
/// so the count is an upper-bound estimate. That's documented in the dashboard copy.
class ShieldConfigurationExtension: ShieldConfigurationDataSource {

  override func configuration(shielding application: Application) -> ShieldConfiguration {
    record(bundleID: application.bundleIdentifier)
    return makeConfiguration(appName: application.localizedDisplayName)
  }

  override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration {
    record(bundleID: application.bundleIdentifier)
    return makeConfiguration(appName: application.localizedDisplayName)
  }

  override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
    UnreelShared.increment(.shieldShown, app: "other")
    return makeConfiguration(appName: webDomain.domain)
  }

  override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration {
    UnreelShared.increment(.shieldShown, app: "other")
    return makeConfiguration(appName: webDomain.domain)
  }

  // MARK: -

  private func record(bundleID: String?) {
    UnreelShared.increment(.shieldShown, app: UnreelShared.appKey(bundleID: bundleID))
  }

  private func makeConfiguration(appName: String?) -> ShieldConfiguration {
    let name = appName ?? "This app"
    let config = UnreelShared.loadConfig()
    let subtitle: String
    switch config.mode {
    case .budget:
      subtitle = "You've used today's \(config.dailyBudgetMinutes) minutes. It opens again at midnight."
    case .always:
      subtitle = "iPhone can't block just Reels or Shorts inside the app, so Unreel locks the whole app. "
        + "The website still works in Safari, where Unreel removes them."
    }

    return ShieldConfiguration(
      backgroundBlurStyle: .systemUltraThinMaterialDark,
      backgroundColor: Palette.brand,
      icon: UIImage(systemName: "rectangle.portrait.slash")?.withTintColor(Palette.signal, renderingMode: .alwaysOriginal),
      title: ShieldConfiguration.Label(text: "\(name) is paused", color: .white),
      subtitle: ShieldConfiguration.Label(text: subtitle, color: Palette.onBrandMuted),
      primaryButtonLabel: ShieldConfiguration.Label(text: "Close", color: Palette.brand),
      primaryButtonBackgroundColor: .white,
      secondaryButtonLabel: nil
    )
  }

  /// Mirrors src/theme.ts (the dashboard's status block).
  private enum Palette {
    static let brand = UIColor(red: 0.169, green: 0.231, blue: 0.839, alpha: 1)        // #2B3BD6
    static let onBrandMuted = UIColor(red: 0.788, green: 0.808, blue: 0.969, alpha: 1) // #C9CEF7
    static let signal = UIColor(red: 1.0, green: 0.690, blue: 0.125, alpha: 1)         // #FFB020
  }
}
