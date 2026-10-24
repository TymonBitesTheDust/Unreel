import FamilyControls
import SwiftUI
import UIKit

/// Presents Apple's FamilyActivityPicker as a sheet over the React Native UI.
///
/// The picker is the only way to obtain tokens for Instagram and YouTube: iOS never tells us
/// bundle ids, so the user has to find and tick the apps themselves. The header text says so.
enum ActivityPickerPresenter {

  /// Calls `completion` exactly once: with the new selection on Done, or nil on Cancel / failure.
  @MainActor
  static func present(completion: @escaping (FamilyActivitySelection?) -> Void) {
    guard let presenter = topViewController() else {
      completion(nil)
      return
    }
    let model = PickerModel(selection: ShieldApplier.loadSelection() ?? FamilyActivitySelection())
    weak var weakHost: UIViewController?
    var finished = false
    let finish: (FamilyActivitySelection?) -> Void = { result in
      guard !finished else { return }
      finished = true
      weakHost?.dismiss(animated: true)
      completion(result)
    }
    let sheet = ActivityPickerSheet(
      model: model,
      onDone: { finish(model.selection) },
      onCancel: { finish(nil) }
    )
    let host = UIHostingController(rootView: sheet)
    // Swipe-to-dismiss would bypass both buttons and leave the JS promise hanging.
    host.isModalInPresentation = true
    weakHost = host
    presenter.present(host, animated: true)
  }

  @MainActor
  private static func topViewController() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }
    var top = scene?.windows.first { $0.isKeyWindow }?.rootViewController
    while let presented = top?.presentedViewController {
      top = presented
    }
    return top
  }
}

final class PickerModel: ObservableObject {
  @Published var selection: FamilyActivitySelection

  init(selection: FamilyActivitySelection) {
    self.selection = selection
  }
}

struct ActivityPickerSheet: View {
  @ObservedObject var model: PickerModel
  let onDone: () -> Void
  let onCancel: () -> Void

  var body: some View {
    NavigationView {
      FamilyActivityPicker(
        headerText: "Search for Instagram and YouTube and tick both.",
        footerText: "iOS gives Unreel anonymous tokens for these apps. It can lock them, but it can't see what you do inside them.",
        selection: $model.selection
      )
      .navigationTitle("Apps to lock")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel", action: onCancel)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Done", action: onDone).bold()
        }
      }
    }
    .navigationViewStyle(.stack)
  }
}
