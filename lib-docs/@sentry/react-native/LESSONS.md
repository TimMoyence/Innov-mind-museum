# Lessons — @sentry/react-native (v8.9.1)

Project-specific gotchas. Audit enterprise-grade 2026-05-18.

## ~~🚨 2026-05-18 — F1 MAJOR~~: `metro.config.js` uses `getDefaultConfig` — RESOLVED 2026-05-20 (commit `d06bfd54c` — see refresh section below)
- **Symptôme** : risque Hermes bundle source-maps non-aligned avec Sentry upload → stack traces minifiées dashboard, debug impossible.
- **Cause** : `museum-frontend/metro.config.js:2` utilise `const { getDefaultConfig } = require('expo/metro-config')`. PATTERNS.md §1 prescrit explicitement `getSentryExpoConfig` from `@sentry/react-native/metro` comme canonical Expo Metro setup.
- **Fix** : voir TD-SRN-01. Replace par `const { getSentryExpoConfig } = require('@sentry/react-native/metro')` + call `getSentryExpoConfig(__dirname)`. Verify EAS build still uploads source maps via `@sentry/expo-upload-sourcemaps`.

## 2026-05-18 — F2 minor : `registerNavigationContainer` pattern Expo Router
- Expo Router has NO onReady prop. `_layout.tsx:104-111` register via useEffect on mount avec `useNavigationContainerRef()`. Acceptable deviation — Expo Router idiom, ref attachée par useEffect time en React 19.
- **Add** : inline comment référençant PATTERNS.md §3.

## 2026-05-18 — Configuration exemplaire (15 PASS)
- ✅ `Sentry.init()` SINGLE call at app entry (`_layout.tsx:53` avant tout)
- ✅ DSN env-sourced via `readEnvString` (Platform.OS Android/iOS)
- ✅ `Sentry.wrap(RootLayout)` exported (`_layout.tsx:217`)
- ✅ `enableNative` + `enableNativeCrashHandling` defaults true (NOT overridden)
- ✅ `tracesSampleRate: 0.2`
- ✅ `sendDefaultPii: false`
- ✅ `beforeSend` + `beforeBreadcrumb` scrubbing via `@musaium/shared/observability` (email hashing)
- ✅ ErrorBoundary at root (wraps tree, supports i18n + Updates.reloadAsync recovery)
- ✅ Manual capture sites structured (tags.flow, contexts.react, level:fatal)
- ✅ NO `withScope` mutating global state (use option-arg pattern)
- ✅ Breadcrumbs avoid PII (only userId, not email)
- ✅ Global error handler downgrade fatal→non-fatal en release (CLAUDE.md gotcha confirmé `global-error-handler.ts:80`)
- ✅ Expo config plugin registered avec org+project env-sourced
- ✅ Pods committed per CLAUDE.md (RNSentry target support files tracked)
- ✅ Sentry.init NOT called multiple times

## 2026-05-18 — INFO : mobileReplayIntegration NOT enabled
- Optional. App handles sensitive data (auth tokens, museum visits) — enabling Session Replay nécessiterait GDPR review. Documented intentional omission acceptable.

## 2026-05-18 — Anti-patterns à éviter
- ❌ Hardcoded DSN (always env-sourced)
- ❌ Multiple `Sentry.init` calls
- ❌ `Sentry.getCurrentScope().setTag(...)` (global state pollution) — use captureException option-arg
- ❌ Log raw email/PII in breadcrumbs
- ❌ Bypass `getSentryExpoConfig` in metro.config.js → source-maps broken

## 2026-05-20 — Refresh wave (doc-curator)

### Codebase audit re-run vs 8.9.1 pinned + 8.11.1 upstream

**RESOLVED since 2026-05-18 :**
- ✅ F1 closed — `museum-frontend/metro.config.js:2` now `const { getSentryExpoConfig } = require('@sentry/react-native/metro')` (commit `d06bfd54c` "fix(observability): clusters 1+2+3 Sentry/OTel cleanup"). Source-map upload path is correct.
- ✅ F2 closed — `_layout.tsx:103-112` Expo Router `useEffect(registerNavigationContainer)` pattern now matches the OFFICIALLY documented pattern at https://docs.sentry.io/platforms/react-native/tracing/instrumentation/expo-router/ (the upstream guide now explicitly recommends the `useEffect` pattern because Expo Router has no `onReady`). PATTERNS.md §3 cites this. No code change needed.

### 2026-05-20 — INFO : version bump candidate 8.9.1 → 8.11.1

- Bump is **minor**, no API breaking changes.
- Wins : iOS AVAssetDownloadTask crash fix (8.11.1) + gradle auth-token masking (8.10.0, defense-in-depth for GHSA-68c2-4mpx-qh95) + iOS dSYM upload fix under pnpm (8.11.0).
- Risk : low. Cocoa SDK transitive bump 9.11→9.13 — `pod install` required.
- Action : NOT yet a TD-SRN-XX (no concrete bug observed at 8.9.1). Schedule in next Renovate cycle after V1 launch bake.
- Required steps when applied : `npm install @sentry/react-native@8.11.1` → `cd ios && pod install` → `git add -f ios/Pods/` → verify `Podfile.lock` → TestFlight bake ≥7d.

### 2026-05-20 — INFO : `Sentry.wrapExpoRouter` NEW API (v8.5.0+) available, NOT yet adopted

- Wraps `useRouter()` to capture **prefetch spans** (Expo Router v5+).
- Complement to (not replacement for) `reactNavigationIntegration`.
- Musaium currently has no critical prefetch flows in Q2 2026.
- Decision : defer adoption. Re-evaluate post-V2 walking-guide feature when GPS-driven route prefetch becomes critical.

### 2026-05-20 — INFO : `Sentry.GlobalErrorBoundary` (v8.9.1+) NOT a drop-in for global-error-handler.ts

- New SDK class catches non-rendering errors via `includeNonFatalGlobalErrors` + `includeUnhandledRejections`.
- BUT does NOT downgrade `isFatal` for the chained native handler — Musaium's wrapper specifically does that to defeat the SIGABRT path (post-#258 hotfix `f7ec92f7`).
- Decision : KEEP hand-rolled `global-error-handler.ts:52-92`. Re-audit if Sentry adds a documented `downgradeFatal` option to `GlobalErrorBoundary`.

### 2026-05-20 — INFO : `sendDefaultPii` upstream doc shifted to `true` — Musaium stays `false`

- The official manual-setup Expo snippet (https://docs.sentry.io/platforms/react-native/manual-setup/expo/) now shows `sendDefaultPii: true` as the recommended default.
- Musaium **explicitly deviates** — GDPR policy mandates no auto IP/user-agent/cookie capture. The lower-noise dashboard is a worthwhile tradeoff for compliance posture.
- Documented as intentional in PATTERNS.md §2 and §3 DO bullet.
- Anyone migrating Musaium to upstream "recommended" defaults → STOP, refer here.

### 2026-05-20 — INFO : `tracePropagationTargets` strict allow-list (sentry-init.ts:21-25)

- Pattern `[/^https:\/\/api\.musaium\.com\//, /^https?:\/\/[^/]+\/api\//]` is the **right** shape.
- Upstream's `[/^\//, /^https:\/\/yourserver\.io\/api/]` example is dangerous — `/^\//` matches every relative URL → `sentry-trace` + `baggage` headers leak to third-party SDKs using relative paths.
- Future LAN-IP tightening : if dev API ever moves off `/api/` prefix, the second regex must follow.

### 2026-05-20 — INFO : Session Replay STILL intentionally absent

- Re-confirmed 2026-05-20. App handles auth tokens, museum visit patterns, voice transcripts (V1) — sensitive enough that default-masking-only is insufficient without a DPIA refresh + consent UX.
- Re-audit gate : when V1 GDPR-DPIA refreshes (Q3 2026 baseline), evaluate adding `mobileReplayIntegration` with `replaysSessionSampleRate: 0` + `replaysOnErrorSampleRate: 0.1` AND explicit per-user consent toggle.

### 2026-05-20 — INFO : Security advisory GHSA-68c2-4mpx-qh95

- Low severity, published 2024-03-01: "Potential leakage of Sentry auth tokens by React Native SDK with Expo plugin".
- The public advisory page does not enumerate affected versions in its index — 8.9.1 status indeterminate without authenticated detail view.
- Defense-in-depth already in place :
  - `SENTRY_AUTH_TOKEN` env-only (never committed) — verified in `app.config.ts` (uses `readEnvString`).
  - 8.10.0+ masks the token in gradle logs (another reason to schedule the bump).
- Action : if affected-version range later confirms 8.9.1 vulnerable, the bump to 8.11.1 is upgraded from "schedule" to "expedite".

### 2026-05-20 — Configuration RE-CONFIRMED (15+ PASS)
- ✅ All 15 PASS items from 2026-05-18 still hold (verified line-by-line).
- ✅ New PASS : `tracePropagationTargets` strict allow-list (sentry-init.ts:21-25).
- ✅ New PASS : `reactNativeTracingIntegration()` enabled (sentry-init.ts:41).
- ✅ New PASS : option-arg `Sentry.captureException(err, { tags, contexts, extra })` used everywhere — 0 `withScope` mutations, 0 global scope mutations.
- ✅ New PASS : dedup `_reported` flag on AppError envelope (errorReporting.ts:32) prevents double-capture.
- ✅ New PASS : breadcrumbs do not log PII (verified `AuthContext.tsx:54`, `useAuthAppStateSync.ts:57`, `BiometricGate.tsx:12`).
- ✅ New PASS : `Sentry.setUser(null)` on logout (AuthContext.tsx:270 + :301).

### 2026-05-20 — No active TD-SRN-XX (clear backlog)

- TD-SRN-01 closed (metro.config.js fix).
- No new TD opened. Bump 8.9.1→8.11.1 tracked as a Renovate cycle item, not a TD.

