import DeviceActivity
import Foundation
import ManagedSettings

/// Runs in its own short-lived process whenever a monitored schedule or event fires — including
/// when the Unreel app hasn't been opened for days. It never trusts in-memory state: every callback
/// re-derives the right shield state from the App Group via `ShieldApplier.sync()`.
///
/// Keep this lean. Screen Time extensions have a small memory budget (a few MB); no SwiftUI, no
/// networking, no large allocations.
class DeviceActivityMonitorExtension: DeviceActivityMonitor {

  override func intervalDidStart(for activity: DeviceActivityName) {
    super.intervalDidStart(for: activity)
    // Daily activity: a new day starts; the allowance flag is day-keyed, so sync() unshields in
    // budget mode and keeps shields up in "always" mode.
    // Pause activity: the pause has begun (pausedUntil is in the future), so sync() clears shields.
    ShieldApplier.sync()
  }

  override func intervalDidEnd(for activity: DeviceActivityName) {
    super.intervalDidEnd(for: activity)
    if activity == ShieldApplier.pauseActivity {
      // The schedule's end can land a few seconds before `pausedUntil`; close the pause explicitly
      // so sync() doesn't think we're still inside it.
      var config = UnreelShared.loadConfig()
      config.pausedUntil = 0
      UnreelShared.saveConfig(config)
    }
    ShieldApplier.sync()
  }

  override func eventDidReachThreshold(_ event: DeviceActivityEvent.Name, activity: DeviceActivityName) {
    super.eventDidReachThreshold(event, activity: activity)
    guard event == ShieldApplier.budgetEvent else { return }
    UnreelShared.markBudgetExhausted()
    ShieldApplier.sync()
  }
}
