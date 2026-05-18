# Lessons — @sentry/react-native (v8.9.1)

Project-specific gotchas. Audit enterprise-grade 2026-05-18.

## 🚨 2026-05-18 — F1 MAJOR : `metro.config.js` uses `getDefaultConfig` au lieu de `getSentryExpoConfig`
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
