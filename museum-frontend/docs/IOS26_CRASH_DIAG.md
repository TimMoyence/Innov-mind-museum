# iOS 26 / A18 Pro launch-crash diagnostics

Companion runbook for [ADR-004](../../docs/adr/ADR-004-ios26-a18pro-crash-watch.md) and the dual-crash investigation tracked in `memory/project_ios26_crash_investigation.md`.

This page describes the instrumentation added to capture the missing diagnostic signal for **Bug 2** (React bridge init crash on iOS 26.x A18 Pro), which surfaced after Bug 1 (expo-updates `ErrorRecovery`) was fixed. The crash signature is:

```
SIGABRT
  std::__terminate
    objc_exception_rethrow
      __cxa_rethrow
        <react framework, +0x319650 / +0x31E8C4>
```

It happens 0.14 - 0.29s after launch — i.e. somewhere between `application(_:didFinishLaunchingWithOptions:)` start and React bridge readiness. Without symbols and without runtime context, all we know is "something throws" — that gap is what this instrumentation closes.

## What the instrumentation captures

### 1. Native init phase timeline (AppDelegate.swift -> RNCrashCapture)

Phases logged with monotonic ISO-8601 timestamps:

| Phase | Where it fires |
|---|---|
| `appDelegate.didFinishLaunching.start` | First line of `application(_:didFinishLaunchingWithOptions:)`, after handler install |
| `rn.factory.created` | After `ExpoReactNativeFactory(delegate:)` and `dependencyProvider` assignment |
| `rn.window.created` | After `UIWindow(frame: UIScreen.main.bounds)` (iOS / tvOS only) |
| `rn.startReactNative.before` | Immediately before `factory.startReactNative(...)` |
| `rn.startReactNative.after` | Immediately after `factory.startReactNative(...)` returns (skipped if it throws) |
| `appDelegate.didFinishLaunching.return` | After `super.application(...)` returns; carries the `superResult` boolean |

Each entry is appended to `NSTemporaryDirectory()/musaium-crash-context.json` (one JSON object per line) and mirrored to NSLog with the tag `[MUSAIUM_INIT]`.

### 2. JS init phase breadcrumbs (shared/observability/init-phase-breadcrumbs.ts)

Mirrors the native instrumentation on the JS side, prefixed `js.<phase>`. Wired in `app/_layout.tsx`:

| Phase | When it fires |
|---|---|
| `js.sentry.initialized` | Right after `initSentry(sentryDsn)` |
| `js.rootLayout.mounted` | First `useEffect` in `RootLayout` |
| `js.navigationContainer.registered` | After `reactNavigationIntegration.registerNavigationContainer(ref)` |
| `js.runtimeSettings.applied` | Resolution of `applyRuntimeSettings()` |

Each phase emits:
- A `console.log("[MUSAIUM_INIT] js.<phase> ts=<iso>")` line that appears in device / simulator logs.
- A `Sentry.addBreadcrumb({category: "rn.init", message: "js.<phase>"})` so it lands on the next Sentry event.

### 3. Uncaught NSException snapshot

`NSSetUncaughtExceptionHandler` captures, on first exception:

- `phaseAtCrash` - the most recent phase logged before the throw (key signal for Bug 2).
- `name`, `reason`, `userInfo` - exception identity.
- `callStack`, `callStackReturnAddresses` - raw symbols + addresses for symbolication.
- `registeredNativeModules` - the bridge's `moduleClasses` list at crash time, so we can see which TurboModule has finished registering.

The snapshot is appended to `musaium-crash-context.json` and to NSLog with the tag `[MUSAIUM_CRASH]`.

## How to read the timeline

After a crash, run `./scripts/extract-crash-context.sh` from `museum-frontend/`. It tries, in order:

1. **Booted simulator** - `xcrun simctl get_app_container booted com.musaium.mobile data` -> `tmp/musaium-crash-context.json`.
2. **USB-attached device** - via `idevice_id` + `ifuse` (libimobiledevice; install with `brew install libimobiledevice ifuse`).
3. **macOS unified log** - `log show --predicate 'eventMessage CONTAINS "MUSAIUM_"'` for the last 10 minutes.

Pass `--json` to skip the formatting and dump raw events; pass `--since 30m` to widen the unified-log window.

The expected timeline of a healthy launch is:

```
appDelegate.didFinishLaunching.start
rn.factory.created
rn.window.created
rn.startReactNative.before
rn.startReactNative.after          <- iOS 26 builds NEVER reach this in the failing case
appDelegate.didFinishLaunching.return
js.sentry.initialized              <- JS runtime running
js.rootLayout.mounted
js.navigationContainer.registered
js.runtimeSettings.applied
```

Any uncaughtException with `phaseAtCrash == "rn.startReactNative.before"` means the crash is inside `factory.startReactNative(...)` - the React bridge init itself. Any crash with `phaseAtCrash == "rn.startReactNative.after"` and no JS phase means the bridge handed control back but the JS bundle never executed (Hermes load failure or root view mount failure).

## Symbolicating the React frames

`callStackSymbols` is **not** symbolicated when shipped from a release build. To resolve the React framework offsets you need:

1. The dSYM for the React framework that shipped in the failing build.
2. `atos -arch arm64 -o <Path>/React.framework.dSYM/Contents/Resources/DWARF/React 0x319650 0x31E8C4`.

For Expo SDK 55 prebuilt React (`Pods/React-Core/React.framework`), the dSYM is *only* available if `Build Settings -> Debug Information Format` is `DWARF with dSYM File`. Verify this is the case in the EAS Build output before shipping the next build.

Sentry's automatic dSYM upload (Sentry RN 8.9.1 onward) covers the JS bundle but **not** the prebuilt React framework. Upload manually after each EAS build:

```bash
sentry-cli debug-files upload \
  --auth-token "$SENTRY_AUTH_TOKEN" \
  --org musaium \
  --project mobile-ios \
  ios/Pods/Sentry/iOS-Swift/dSYMs ios/Pods/React-Core/React.framework.dSYM
```

(Adjust paths for the actual EAS build artefact layout.)

## Limitations

- The handler is installed in `installHandlers()` *before* anything else in `application(_:didFinishLaunchingWithOptions:)`, but a crash that happens earlier (e.g. inside `+load`, static initializers, or `dyld`) is captured only by the OS crash report - not by this code path.
- `NSSetUncaughtExceptionHandler` fires for **ObjC** `NSException` only. A "true" C++ exception (`__cxa_rethrow` of a non-bridged `std::exception`) bypasses it. Bug 2's signature - `__cxa_rethrow -> objc_exception_rethrow` - does cross the bridge, so we capture it; a hypothetical pure-C++ crash would not. Adding a `std::set_terminate` shim (ObjC++ `.mm` file) is the next step if the recovered phase context still leaves us blind.
- `phaseAtCrash` may be **off-by-one** under load: `logPhase` writes via `DispatchQueue.async`, so a phase enqueued microseconds before the throw may not have updated `currentPhase` yet. Treat boundary phases as "between X and X+1".
- `ProcessInfo.processInfo.environment["HERMES_VM"]` is a soft signal; Hermes does not export a runtime "alive" flag. Treat the field as informational, not authoritative.
- The append-only JSON file is rotated by the OS when the temp directory is cleaned, so collect it promptly after each crash.
- **Device pull on TestFlight builds**: `extract-crash-context.sh` step 2 (libimobiledevice + `ifuse`) only sees `Documents/`; the file lives in `tmp/`. For a real device, use Xcode -> Window -> Devices and Simulators -> the device -> the app -> "Download Container" and grep `tmp/musaium-crash-context.json` from the resulting `.xcappdata` package. The script's step 1 (booted simulator) is the reliable automated path.

## Wire-up reference

| File | Role |
|---|---|
| `ios/Musaium/Musaium-Bridging-Header.h` | Imports `Sentry/Sentry.h` so Swift can call SentrySDK directly. |
| `ios/Musaium/AppDelegate.swift` (`RNCrashCapture` enum) | Native phase logger + uncaught exception handler. |
| `shared/observability/init-phase-breadcrumbs.ts` | JS-side `logInitPhase()` helper. |
| `app/_layout.tsx` | Calls `logInitPhase()` at each JS init phase. |
| `scripts/extract-crash-context.sh` | Pulls `musaium-crash-context.json` from a simulator / device + the unified log. |

## Next actions when a TestFlight crash arrives

1. Pull the `.ips` crash report from the user's device (Settings -> Privacy & Security -> Analytics & Improvements -> Analytics Data).
2. Run `./scripts/extract-crash-context.sh` against the same device while it is connected, OR ask the reporter to share `musaium-crash-context.json` from the app sandbox.
3. Cross-reference `phaseAtCrash` with the React framework offsets in the `.ips` to pinpoint which TurboModule / init step is the culprit.
4. Update [`memory/project_ios26_crash_investigation.md`](../../memory/project_ios26_crash_investigation.md) with the findings.
5. If a specific TurboModule is implicated, follow the ADR-004 escalation ladder.
