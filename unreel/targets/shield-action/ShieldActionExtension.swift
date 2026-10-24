import ManagedSettings

/// Handles taps on the shield's buttons. There's only a primary "Close" button: a shield action
/// can't open the Unreel app or unlock anything by itself, and offering an "unlock" here would
/// skip the PIN / delay friction the user set up in the app.
class ShieldActionExtension: ShieldActionDelegate {

  override func handle(action: ShieldAction, for application: ApplicationToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
    completionHandler(respond(to: action))
  }

  override func handle(action: ShieldAction, for webDomain: WebDomainToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
    completionHandler(respond(to: action))
  }

  override func handle(action: ShieldAction, for category: ActivityCategoryToken, completionHandler: @escaping (ShieldActionResponse) -> Void) {
    completionHandler(respond(to: action))
  }

  private func respond(to action: ShieldAction) -> ShieldActionResponse {
    UnreelShared.increment(.shieldAction, app: "all")
    switch action {
    case .primaryButtonPressed:
      return .close
    case .secondaryButtonPressed:
      return .defer
    @unknown default:
      // Never crash in an extension on a new SDK case; doing nothing keeps the shield up.
      return .none
    }
  }
}
