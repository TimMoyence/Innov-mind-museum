# Lessons — expo-router (Musaium)

Project gotchas for `expo-router@~55.0.10` in Musaium. Human-edited; agents do not touch.

## 2026-05-20 — `useProtectedRoute` group-segment indexing
- **Cause**: `useSegments()` returns `['(stack)', 'onboarding']` for grouped routes — `segments[0]` is the group, NOT a flat route name. Detecting onboarding needs `segments[0] === '(stack)' && segments[1] === 'onboarding'` (`features/auth/useProtectedRoute.ts:24-27`).
- **Anti-pattern**: assuming `segments[0]` is the screen name when routes live in `(group)/` dirs.
- **À appliquer**: any new auth/route guard reading `useSegments()` must account for the `(stack)`/`(tabs)` group prefix.

## 2026-05-20 — modal dismiss via `router.back()`, not `router.replace()`
- **Cause**: a modal (`presentation:'modal'`, e.g. `(stack)/museums-picker`) reachable from multiple parents must pop back to its actual presenter. `router.replace()` would rewrite history to the wrong root (`app/(stack)/museums-picker.tsx:25-28`).
- **À appliquer**: dismiss multi-parent modals with `router.back()`.

## 2026-05-20 — `useFocusEffect` for per-screen consent re-check
- **Cause**: chat screen re-checks the consent flag on every focus (`app/(stack)/chat/[sessionId].tsx:298` `useFocusEffect`) — recent fixes (commits 4096766aa, 3e6c4de25) hinged on re-evaluating consent at focus, not just mount. Note Musaium imports `useFocusEffect`/`useNavigation` from `@react-navigation/native` (re-exported by expo-router).
- **À appliquer**: state that can change while a screen is backgrounded (consent, auth, quota) → re-check in `useFocusEffect`, not just `useEffect([])`.

## 2026-05-20 — `href: null` hides a registered tab
- **Cause**: `(tabs)/index.tsx` is a redirector route that must exist as a file but not show as a tab → `<Tabs.Screen name="index" options={{ href: null }} />` (`app/(tabs)/_layout.tsx:44-49`).

## 2026-05-20 — typed routes regenerate gitignored `expo-env.d.ts`
- `experiments.typedRoutes: true` (`app.config.ts:344`) regenerates `expo-env.d.ts` (`/// <reference types="expo/types" />`). The file is gitignored + must-not-edit. Do not commit or hand-edit it.
