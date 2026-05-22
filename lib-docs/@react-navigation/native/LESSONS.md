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

## 2026-05-20

Refresh re-verify (lib-doc-curator, UFR-022). Pinned `^7.0.14`, registry latest **7.2.4** (same major, minor/patch drift only — no breaking changes; in-place bump low-risk but NOT urgent, let Expo SDK 55 own the version).

- **TD-RNAV-01 STILL OPEN** — `app.config.ts:124` declares custom scheme (`scheme: APP_SCHEME` = `'musaium'`) only. NO `associatedDomains` (iOS) / `intentFilters` with `autoVerify` (Android). Inbound `https://musaium.com/*` deep links + marketing magic-links + Apple Smart App Banners + Android Chrome intent fallback all BREAK. Wire before V1 launch 2026-06-01.
- **Direct usage confirmed minimal + clean** — `useFocusEffect`+`useNavigation` (`chat/[sessionId].tsx`), `useBottomTabBarHeight` (3 tab screens), Sentry container-ref via `useNavigationContainerRef()` from expo-router (`_layout.tsx:103-109`). Zero v6 dead patterns. Zero second `NavigationContainer`. Expo Router owns the container transitively.
- No CVE/GHSA for v7.x as of 2026-05-20. Only attack-adjacent surface = deep-link param handling — validate/whitelist inbound URL params before driving navigation/fetches (relevant once TD-RNAV-01 lands Universal Links).
