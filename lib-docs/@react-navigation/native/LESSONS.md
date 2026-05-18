# Lessons — @react-navigation/native (v7.0.14)

Audit 2026-05-18 : **GREEN** — Single production usage (chat session screen). All other 6 grep hits = test mocks. Expo Router owns NavigationContainer transitively.

## ⚠️ F1 MEDIUM : Universal Links / App Links NOT configured pour musaium.com
- **Cause** : `app.config.ts:124` declares custom scheme `'musaium'` only. NO `associatedDomains` (iOS) NO `intentFilters with autoVerify` (Android).
- **Impact** : marketing email magic-links + Apple Smart App Banners + Android Chrome intent fallback → tous BREAK. Inbound `https://musaium.com/*` deep links can't open the app.
- **Fix TD-RNAV-01** : wire `associatedDomains: ['applinks:musaium.com']` (iOS) + `intentFilters with autoVerify: true` (Android) in app.config.ts BEFORE V1 launch 2026-06-01.

## ✅ v7 compliance complete
- Zero v6 dead patterns (no `navigate as back`, no `key` in navigate, no `unmountOnBlur`, no `animationEnabled:false`, no `headerBackTitleVisible:false`, no `customAnimationOnGesture`, no `statusBarColor`, no `independent` on NavigationContainer, no `theme without fonts`)
- Zero second NavigationContainer (Expo Router owns via `useNavigationContainerRef`)
- Sentry navigationContainerRef registered (`_layout.tsx:102-108`)
- Chat session screen uses `useNavigation()`, `canGoBack`, `addListener('focus', cb)` — all v7-clean
