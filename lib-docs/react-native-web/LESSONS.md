# Lessons — react-native-web (v0.21.0)

Audit 2026-05-18 : **APPROVED** — zero direct imports, Expo handles aliasing.

## ✅ Compliance complete
- ZERO direct `react-native-web` imports in app code (PATTERNS §1 DO)
- Expo metro `getDefaultConfig` auto-aliases `react-native` → `react-native-web` at platform=web (PATTERNS §3 DO)
- 6 platform branches `Platform.OS === 'web'` correctly handle web fallbacks (SecureStore→null, MediaRecorder web API, etc.) — PATTERNS §3 DO
- AppRegistry delegated to `expo-router/entry`, no manual `registerComponent` needed
- web bundler = metro (app.config.ts), output='single' = CSR-only

## INFO opportunities (informational only)
- `babel-plugin-react-native-web` not in devDeps → no build-time tree-shaking. Add seulement si web bundle size deviens user-facing concern (mobile-first product, web is landing/PWA secondary).
- No SSR pathway (out of scope — museum-web/ Next.js owns SEO/SSR)

## Status : NO TD entry. NO action needed.
