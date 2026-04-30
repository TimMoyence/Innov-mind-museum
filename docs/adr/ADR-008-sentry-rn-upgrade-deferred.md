# ADR-008 — Sentry React Native 8.7 → 8.9.1 upgrade deferred

- **Status:** Superseded by [ADR-011](./ADR-011-sentry-rn-8.9.1-shipped.md) (2026-04-30)
- **Date:** 2026-04-24
- **Deciders:** Backend+Mobile audit consolidation (sprint S4)
- **Supersedes:** N/A

> **Outcome update (2026-04-30):** the bump was actually performed shortly after this ADR was written. `package.json` is now `@sentry/react-native ^8.9.1` and `ios/Podfile.lock` resolves `RNSentry 8.9.1` + `Sentry 9.11.0`. The defer reasoning below is preserved for historical context; see ADR-011 for the shipped state.

## Context

The 2026-04-24 enterprise audit initially flagged `@sentry/react-native ^8.7.0` as "2 majors behind" (presumed stable at v10). Investigation corrected the premise:

- **Truth:** `@sentry/react-native` latest stable is **8.9.1** (published 2026-04-23). The v10 line belongs to the underlying JS SDK (`@sentry/core`, `@sentry/react`), which the RN SDK bumped internally during the 7.x → 8.x transition. No v9 or v10 exists for the RN SDK package.
- **We are 2 minors behind** on the current major line, not 2 majors.

The bump nevertheless has real upside:

1. **Hermes silent event-drop fix** (8.8.0) — production crash reports may currently be dropped on iOS release builds using Hermes.
2. **Expo SDK 55 Metro lazy-load fix** (8.8.0) — we run Expo 55.
3. Minor perf improvements in navigation tracing (8.8.0).

## Decision

**Defer the bump.** Attempted `pod install` during sprint S4 failed with:

```
In Podfile.lock: Sentry (= 9.8.0)
In Podfile: RNSentry 8.9.1 depends on Sentry (= 9.11.0)
Specs satisfying the Sentry (= 9.11.0) dependency were found,
but they required a higher minimum deployment target.
```

Sentry Cocoa 9.11 requires an iOS deployment target above our current `platform :ios, '15.1'`. Raising the deployment target ripples through every Pod and is out of scope for this sprint. Musaium also ships iOS builds via Xcode Cloud with `Pods/` committed (see memory `feedback_ios_pods_xcloud.md` and `reference_podfile_fmt_patch.md`) — any Pods regen must be coordinated with the iOS release flow plus the `fmt` consteval patch re-application.

The risk of running **JS 8.9.1 with native RNSentry 8.7.0** (package.json ahead, Podfile.lock behind) is a JS/native bridge mismatch that can silently drop events or crash on init. **We do not want that.** Therefore `@sentry/react-native` stays pinned at `^8.7.0` until the iOS deployment-target bump is scheduled.

## Consequences

- We continue to run `@sentry/react-native` 8.7 on both JS and native — **internally consistent**, lower risk.
- We accept that:
  - Some Hermes iOS-release crashes may be silently dropped (low expected volume given small current user base).
  - Expo 55 Metro lazy-load improvement is not active.
- When the iOS deployment target is raised (likely alongside the next annual iOS min-OS review), this ADR becomes actionable:
  1. Bump `platform :ios` in `museum-frontend/ios/Podfile` (likely to 16.0).
  2. Set `@sentry/react-native` to `^8.9.1` in `package.json`.
  3. `pod install`; re-apply fmt consteval patch (see `reference_podfile_fmt_patch.md`).
  4. Run `npx expo-doctor`, `npm run lint`, `npm test`, full Maestro E2E.
  5. Smoke Sentry event capture in TestFlight build before promoting.

## Related

- Memory: `feedback_ios_pods_xcloud.md` — Pods/ stays committed, no `expo prebuild --clean` at CI.
- Memory: `reference_podfile_fmt_patch.md` — fmt consteval patch applied in `Podfile` post_install.
- Audit report 2026-04-24 — original P0 "Sentry 2 majors behind" was a false premise; correct classification is P2 deferred.
