# Lessons — expo-build-properties (Musaium)

Project gotchas for `expo-build-properties@~55.0.11` in Musaium. Human-edited; agents do not touch.

## 2026-05-20 — `buildReactNativeFromSource: true` (iOS) fixes RN 0.83 dup-symbol
- **Cause**: RN 0.83.6 prebuilt React.framework tarball bakes RCTSwiftUI symbols in, then the pod system rebuilds RCTSwiftUI locally and static-links into `Musaium.debug.dylib` → ObjC "Class implemented in both" warnings at launch (29 dup symbols). Building RN from source = one canonical compile path (`app.config.ts:283`).
- **Cost**: +8-10 min on clean Xcode build, cached after.

## 2026-05-20 — `networkInspector: false` (iOS) when SSL pinning wired
- **Cause**: the Expo dev-client iOS network inspector interferes with `initializeSslPinning` on dev-client builds (TD-SSL-01; react-native-ssl-public-key-pinning PATTERNS §5.3 lines 135-152). Disabled for dev/preview; production disables the inspector automatically (`app.config.ts:289`).

## 2026-05-20 — `usesCleartextTraffic` variant-gated; `blockedPermissions` strips transitive perms
- **Cause**: `usesCleartextTraffic: variant === 'development'` (`app.config.ts:268`) — HTTP only in dev for Metro/LAN; HTTPS-only at the OS layer for preview/prod (P3.3). `blockedPermissions` strips READ/WRITE_EXTERNAL_STORAGE, AD_ID, SYSTEM_ALERT_WINDOW from the merged manifest (Play data-safety / privacy).
- **Anti-pattern**: enabling cleartext for non-dev variants; leaving AD_ID in (triggers Play Store ad-id disclosure).

## 2026-05-20 — build-properties does NOT patch pod sources
- **Cause**: the fmt-consteval Xcode 26 fix needs a `withPodfile` plugin (`plugins/withFmtConstevalPatch.js`), NOT expo-build-properties. build-properties only sets build flags, not pod source rewrites. Don't expect it to survive/handle the Podfile post_install patches.
