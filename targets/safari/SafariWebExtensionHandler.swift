import SafariServices
import os.log

/// Native side of the Safari extension. The extension is self-contained (rules + content script),
/// so this only answers `browser.runtime.sendNativeMessage` pings — handy for debugging whether
/// the extension is loaded. It must never crash on an unexpected message shape.
class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

  func beginRequest(with context: NSExtensionContext) {
    let item = context.inputItems.first as? NSExtensionItem
    let message = item?.userInfo?[SFExtensionMessageKey]
    os_log(.debug, "Unreel Safari extension message: %{public}@", String(describing: message))

    let response = NSExtensionItem()
    response.userInfo = [SFExtensionMessageKey: ["ok": true]]
    context.completeRequest(returningItems: [response], completionHandler: nil)
  }
}
