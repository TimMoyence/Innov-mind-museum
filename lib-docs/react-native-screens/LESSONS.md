# Lessons — react-native-screens (v4.24.0)

Audit 2026-05-18 : **PASS** — zero direct imports, zero deprecated paths, zero anti-patterns.

## ✅ Compliance complète
- Used **purely transitively** via Expo Router Stack + @react-navigation/native-stack
- ZERO imports from `react-native-screens` ou deprecated `'react-native-screens/native-stack'` (v5 path)
- ZERO use of deprecated `statusBarBackgroundColor` / `statusBarTranslucent` / `navigationBarColor`
- ZERO `enableScreens()` / `enableFreeze()` global toggle (library defaults OK)
- BottomSheetContainer = JS Animated + PanResponder (custom, intentional bypass of native `formSheet`) — R8 reducer requirement
- newArchEnabled=true (Android) confirmed
- v4.24.0 last release tested with legacy arch but Fabric path works

## INFO : v4.25.0+ upgrade path is clear
- Drops legacy arch + requires RN ≥0.82 (we have 0.83) → safe
- Tabs API renames (TabsAccessory→TabsBottomAccessory, tabKey→screenKey, onTabChange→onTabSelected) NOT applicable (we use @react-navigation/bottom-tabs)

## Status : NO TD entry. NO action needed.

## 2026-05-20

Re-audit (UFR-022 bundle refresh, verified 2026-05-21) : **PASS** — unchanged verdict.

- `grep -rn "react-native-screens|enableScreens|enableFreeze"` over `app/ features/ shared/ components/` → **0 hits** (tests excluded). Still purely transitive via expo-router → `@react-navigation/native-stack`.
- Latest upstream is **4.25.1**; we pin `~4.24.0`. 4.25.0 dropped legacy arch + RN floor 0.82 — Musaium (RN 0.83.6, Fabric) is unblocked. Tabs renames N/A (we use `@react-navigation/bottom-tabs`). Bump remains optional, not urgent.
- **Zero security advisories** on the upstream GitHub Security Advisories page (verified 2026-05-21).
- New Arch default = native screens on without `enableScreens()`; `enableFreeze` still not needed (no deep-stack churn observed). No regression vs 2026-05-18.
