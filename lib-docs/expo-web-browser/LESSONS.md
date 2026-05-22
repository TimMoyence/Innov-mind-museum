# Lessons — expo-web-browser

Project-specific gotchas for `expo-web-browser` in Musaium (human-edited; agents append dated sections only).

## 2026-05-20 — Lazy `require()`, never static import — SIGABRT defense (PR #258 / hotfix f7ec92f7)
- **Incident**: PR #258 shipped `expo-web-browser` without `pod install` → the native `ExpoWebBrowser` module wasn't linked → static `import` evaluated at JS-bundle load → RCTFatal → **SIGABRT crash on TestFlight 1.2.2 (87/88)**. Hotfix `f7ec92f7`.
- **Fix**: `loadWebBrowser()` does `require('expo-web-browser')` inside try/catch, validates `typeof mod.openAuthSessionAsync === 'function'`, and on failure throws a `SocialAuth` `browser_unavailable` AppError. Combined with the global JS error handler (`app/_layout.tsx`) it degrades a missing native module to a UI error instead of an app abort. Types via `import type * as WebBrowserNamespace`. Reference `features/auth/infrastructure/socialAuthProviders.ts:11-33`. Carries an approved `eslint-disable @typescript-eslint/no-require-imports` with reason.
- **Rule**: any non-critical native Expo module reachable at startup gets the lazy-require treatment.

## 2026-05-20 — `openAuthSessionAsync` (not `openBrowserAsync`) for the Google OAuth flow
- **Context**: Google sign-in is server-mediated — `WebBrowser.openAuthSessionAsync(authUrl, 'musaium://auth/google/callback')` opens `/api/auth/google/initiate?platform=mobile`; the browser auto-dismisses when it hits the deep link and resolves `{ type: 'success', url }`. `openBrowserAsync` would never return the redirect URL. `socialAuthProviders.ts:100-125`.

## 2026-05-20 — Strip the URL fragment before `URLSearchParams` or the OTC breaks
- **Symptom**: `URLSearchParams('code=ABC#frag').get('code')` returns `'ABC#frag'`, not `'ABC'`. iOS `ASWebAuthenticationSession` (observed TestFlight 1.2.2/88) can append a stray `#fragment` to the redirect, which then fails the backend `^[A-Za-z0-9_-]+$` regex with a misleading "Code must be base64url".
- **Fix**: in `parseCallbackUrl`, slice off everything from the first `#` after the query before constructing `URLSearchParams`. `socialAuthProviders.ts:143-152`.

## 2026-05-20 — Redirect deep link is hardcoded client + server (no open-redirect surface)
- **Fact**: `musaium://auth/google/callback` is hardcoded in both `socialAuthProviders.ts` and the backend. The redirect target is never client-controlled, so there's no open-redirect attack surface. Keep it that way — never derive the `redirectUrl` from user input.

## 2026-05-20 — `maybeCompleteAuthSession()` is web-only; correctly absent on mobile
- **Note**: the auth flow here is mobile-only, so `maybeCompleteAuthSession()` is not (and should not be) called. If a web OAuth target is ever added, the web redirect page must call it once to close the popup.

## 2026-05-20 — Treat `cancel`/`dismiss` as user back-out, not an error
- **Fix**: `signInWithGoogle` maps `result.type !== 'success'` to a `google_cancelled` AppError that the UI shows quietly (no scary error toast). `socialAuthProviders.ts:107-113`.
