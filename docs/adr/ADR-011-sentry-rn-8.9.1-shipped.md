# ADR-011 — Sentry React Native 8.7 → 8.9.1 shipped

- **Status:** Accepted (2026-04-30)
- **Owner:** Mobile platform
- **Supersedes:** [ADR-008](./ADR-008-sentry-rn-upgrade-deferred.md)

## Context

ADR-008 (2026-04-24) deferred the `@sentry/react-native` 8.7 → 8.9.1 bump, citing that `pod install` failed because Sentry Cocoa 9.11.0 demanded a deployment target above the then-current `platform :ios, '15.1'`. The bump was nevertheless attractive for two production-impacting fixes:

1. **Hermes silent event-drop fix** (Sentry RN 8.8.0) — events were occasionally lost on iOS release builds with Hermes.
2. **Expo SDK 55 Metro lazy-load fix** (Sentry RN 8.8.0) — relevant since Musaium runs Expo 55.

Between 2026-04-24 and 2026-04-30 the blocker resolved upstream: Sentry Cocoa 9.11.0 became installable on `platform :ios, '15.1'` (no deployment-target bump was ultimately required). The mobile team performed the upgrade in-flight.

## Decision

Ship `@sentry/react-native ^8.9.1` on JS *and* native:

- `museum-frontend/package.json` → `"@sentry/react-native": "^8.9.1"`
- `museum-frontend/ios/Podfile.lock` resolves:
  - `RNSentry (8.9.1)`
  - `Sentry (9.11.0)`
- `museum-frontend/ios/Podfile` keeps `platform :ios, podfile_properties['ios.deploymentTarget'] || '15.1'`. No deployment-target bump was needed in the end — the previous incompatibility cleared.

The fmt consteval patch documented in memory `reference_podfile_fmt_patch.md` was re-applied after `pod install`, per the standing iOS Pods regen procedure.

## Verification

- `npx expo-doctor` → clean.
- `npm run lint` (TypeScript + ESLint) → 0 errors on the mobile app.
- `npm test` → green (full Jest + Node test suite).
- TestFlight build smoke-tested for Sentry event capture (uncaught exception captured + crumbs visible in Sentry web UI) before promotion.
- Xcode Cloud archive succeeded with the committed `Pods/` (no rebuild at CI time, per `feedback_ios_pods_xcloud.md`).

## Consequences

### Positive
- Hermes iOS-release silent event drops fixed (per Sentry release notes 8.8.0).
- Expo 55 Metro lazy-load improvement active.
- JS and native versions are aligned (8.9.1 ↔ 8.9.1), eliminating the bridge-mismatch risk that drove ADR-008's deferral.
- Future minor bumps on the 8.x line are now low-friction.

### Negative
- Sentry Cocoa 9.11.0 enlarges the iOS bundle by ~120 KB compressed (negligible).
- One additional native dependency on Sentry's Cocoa SDK to track for security advisories.

## Related

- ADR-008 — original defer rationale, kept for historical context.
- Memory `feedback_ios_pods_xcloud.md` — Pods/ stays committed; no `expo prebuild --clean` at CI.
- Memory `reference_podfile_fmt_patch.md` — fmt consteval patch re-applied after each pod regen.
