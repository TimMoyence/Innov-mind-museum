internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    RNCrashCapture.installHandlers()
    RNCrashCapture.logPhase("appDelegate.didFinishLaunching.start")

    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    RNCrashCapture.logPhase("rn.factory.created")

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    RNCrashCapture.logPhase("rn.window.created")

    RNCrashCapture.logPhase("rn.startReactNative.before")
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
    RNCrashCapture.logPhase("rn.startReactNative.after")
#endif

    let result = super.application(application, didFinishLaunchingWithOptions: launchOptions)
    RNCrashCapture.logPhase("appDelegate.didFinishLaunching.return", details: ["superResult": result])
    return result
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}

// MARK: - iOS 26 / A18 Pro crash diagnostics
//
// Captures the React Native init phase timeline + an uncaught NSException
// snapshot to NSTemporaryDirectory()/musaium-crash-context.json. Pulled by
// scripts/extract-crash-context.sh and surfaced in IOS26_CRASH_DIAG.md.
// Tracks ADR-004 (active monitoring) + project_ios26_crash_investigation Bug 2.
enum RNCrashCapture {
  private static let contextFileName = "musaium-crash-context.json"
  private static var currentPhase: String = "pre-init"
  private static let queue = DispatchQueue(label: "app.musaium.crashcapture", qos: .utility)

  static func installHandlers() {
    NSSetUncaughtExceptionHandler { exception in
      RNCrashCapture.handleUncaughtException(exception)
    }
    appendEvent(["kind": "handler.installed", "ts": isoNow()])
  }

  static func logPhase(_ phase: String, details: [String: Any] = [:]) {
    queue.async {
      currentPhase = phase
      var entry: [String: Any] = [
        "kind": "phase",
        "phase": phase,
        "ts": isoNow(),
      ]
      if !details.isEmpty {
        entry["details"] = details
      }
      appendEvent(entry)
      NSLog("[MUSAIUM_INIT] phase=%@ ts=%@", phase, isoNow())

      if SentrySDK.isEnabled {
        let crumb = Breadcrumb(level: .info, category: "rn.init")
        crumb.message = phase
        crumb.data = details
        SentrySDK.addBreadcrumb(crumb)
      }
    }
  }

  private static func handleUncaughtException(_ exception: NSException) {
    let modules = registeredNativeModules()
    let entry: [String: Any] = [
      "kind": "uncaughtException",
      "ts": isoNow(),
      "phaseAtCrash": currentPhase,
      "name": exception.name.rawValue,
      "reason": exception.reason ?? "",
      "userInfo": stringifyUserInfo(exception.userInfo),
      "callStack": exception.callStackSymbols,
      "callStackReturnAddresses": exception.callStackReturnAddresses.map { $0.uint64Value },
      "registeredNativeModules": modules,
      "isHermesAlive": ProcessInfo.processInfo.environment["HERMES_VM"] ?? "unknown",
    ]
    appendEvent(entry)
    NSLog(
      "[MUSAIUM_CRASH] phase=%@ name=%@ reason=%@ modules=%lu",
      currentPhase,
      exception.name.rawValue,
      exception.reason ?? "<no reason>",
      UInt(modules.count)
    )
  }

  private static func registeredNativeModules() -> [String] {
    // Surface whichever modules have already registered with the running bridge.
    // Empty list when the crash precedes bridge setup.
    guard
      let factory = (UIApplication.shared.delegate as? AppDelegate)?.reactNativeFactory,
      let bridge = factory.bridge
    else {
      return []
    }
    return Array(bridge.moduleClasses.compactMap { NSStringFromClass($0) }).sorted()
  }

  private static func stringifyUserInfo(_ userInfo: [AnyHashable: Any]?) -> [String: String] {
    guard let userInfo = userInfo else { return [:] }
    var out: [String: String] = [:]
    for (key, value) in userInfo {
      out["\(key)"] = "\(value)"
    }
    return out
  }

  private static func appendEvent(_ entry: [String: Any]) {
    guard let payload = try? JSONSerialization.data(withJSONObject: entry, options: []) else {
      return
    }
    let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(contextFileName)
    let line = payload + Data("\n".utf8)
    if FileManager.default.fileExists(atPath: url.path) {
      if let handle = try? FileHandle(forWritingTo: url) {
        defer { try? handle.close() }
        try? handle.seekToEnd()
        try? handle.write(contentsOf: line)
      }
    } else {
      try? line.write(to: url, options: .atomic)
    }
  }

  private static func isoNow() -> String {
    let fmt = ISO8601DateFormatter()
    fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fmt.string(from: Date())
  }
}
