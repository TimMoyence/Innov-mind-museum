# Lessons — react-native-safe-area-context (v5.7.0)

Audit 2026-05-18 : **PASS_WITH_FINDINGS**.

## ⚠️ F1 MEDIUM : Overuse `useSafeAreaInsets` (23/25 screens) → re-render churn
- PATTERNS §3 + §4 DON'T : 'prefer SafeAreaView over useSafeAreaInsets — hook flags occasional layout flickers, reserve for programmatic logic'.
- 23 screens utilisent le hook pour straight `padding = insets.X` patterns. Seulement 3 sites utilisent SafeAreaView (SourceCitation, ArtworkHeroModal, ImageFullscreenModal).
- **Fix TD-SAFE-01** : audit + swap straight padding usages à `<SafeAreaView edges={['top']}>` ou `EdgeMode {top:'maximum'}`. Garder le hook seulement pour conditional math (e.g. BiometricSetupSheet `Math.max(insets.bottom, 16)`).

## ⚠️ F2 LOW : Hand-rolled Jest mock (test-utils.tsx:72-79)
- PATTERNS §4 DON'T 'partial hand-mocks'. Current mock missing SafeAreaListener + useSafeAreaFrame → future test crash silently.
- **Fix TD-SAFE-02** : `const mock = require('react-native-safe-area-context/jest/mock'); return mock;`.

## ✅ Positives
- SafeAreaProvider auto-mounted by Expo Router (ExpoRoot.js initialMetrics for web/test)
- `edges={['bottom']}` partial-edge override correct (SourceCitation.tsx:81)
- Version 5.7.0 satisfies floor (RN 0.83 ≥ 0.74)

## 2026-05-20

Re-audit (UFR-022 bundle refresh, verified 2026-05-21) : **PASS_WITH_FINDINGS** — F1/F2 still open, no regression.

- **F1 confirmed, now quantified** : `useSafeAreaInsets` = **27 files**, `SafeAreaView` = **4 files**, `useSafeAreaFrame` = 0. Dominant anti-pattern is straight additive padding fed into a screen `contentStyle`: `paddingTop: insets.top + semantic.screen.gapSmall` / `paddingBottom: insets.bottom + token` (e.g. `app/(stack)/{support,carnet,privacy,preferences,terms,onboarding,offline-maps}.tsx`, `app/(tabs)/{home,museums}.tsx`, `app/auth.tsx`). These re-render on inset change; `<SafeAreaView edges={['top']}>` / `{top:'additive'}` would do the math natively. TD-SAFE-01 still valid. Keep the hook only for guarded math (`Math.max(insets.bottom, 16)` in sheets — legitimate).
- **F2 still open** : hand-rolled Jest mock in `__tests__/helpers/test-utils.tsx` (the only manual `SafeAreaProvider`). TD-SAFE-02 still valid — swap to `react-native-safe-area-context/jest/mock`.
- **No hardcoded notch insets** anywhere (`paddingTop: 44/47`, `paddingBottom: 34`, `StatusBar.currentHeight` → 0 hits). Notch/dynamic-island/home-indicator all driven by the provider. Good.
- expo-router auto-mounts root `SafeAreaProvider` w/ `initialMetrics` (`ExpoRoot.js:80`) → no manual root provider, no flicker risk. Do not add one.
- Latest upstream **5.8.0** (internal `UIImplementation` cleanup, no API/breaking change). We pin `~5.7.0`. **Zero security advisories** (verified 2026-05-21). Bump optional/low-risk.
