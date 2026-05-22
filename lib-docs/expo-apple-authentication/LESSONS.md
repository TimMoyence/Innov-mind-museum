# Lessons — expo-apple-authentication

Project-specific gotchas for `expo-apple-authentication` in Musaium (human-edited; agents append dated sections only).

## 2026-05-20 — ID token is verified server-side, never trusted on the client
- **Context**: `signInWithApple` returns only `{ provider, idToken, nonce }` to the caller and POSTs the `idToken` to the backend. The client does NOT decode the token nor create a session from its claims.
- **Why**: the `identityToken` is a JWS forgeable by anyone who knows the algorithm. Trust is established by `social-token-verifier.ts` (Apple JWKS fetch + RS256 signature + `iss`/`aud`/`exp` + nonce). Reference `features/auth/infrastructure/socialAuthProviders.ts:59-83`.

## 2026-05-20 — Raw nonce in, hashed nonce out (F3)
- **Symptom temptation**: pass the hashed nonce to `signInAsync` "to match the claim". Wrong.
- **Fact**: Apple's SDK SHA-256-hashes the **raw** nonce client-side and embeds the digest as the token `nonce` claim. So the client sends the RAW nonce to `signInAsync` AND forwards the RAW nonce to the backend, which re-hashes to lowercase hex and constant-time-compares. Reference `social-token-verifier.ts:193-240`. `OIDC_NONCE_ENFORCE` flag gates hard-401 during rollout.

## 2026-05-20 — `identityToken` can be `null` — guard before POST
- **Fix**: `if (!credential.identityToken) throw createAppError({ code: 'apple_no_identity_token' })`. Sending `null` to the backend yields a misleading verifier error. `socialAuthProviders.ts:70-76`.

## 2026-05-20 — Apple button is iOS-only and App-Store-mandatory (Guideline 4.8)
- **Context**: Musaium offers Google sign-in, so Apple's Guideline 4.8 makes Sign in with Apple MANDATORY on iOS with equal prominence. `SocialLoginButtons.tsx` gates the button on the `appleAuthAvailable` prop (computed from `isAppleSignInAvailable` → `Platform.OS === 'ios' && isAvailableAsync()`).
- **Implication**: do NOT remove or de-emphasize the Apple button on iOS while keeping Google — instant App Store rejection. The button renders only when available; never render it on Android.

## 2026-05-20 — `fullName`/`email` are first-login-only
- **Fact**: Apple returns name + email only on the very first sign-in; every later sign-in returns `null`. Persist them server-side on first credential. Don't rely on them being present for returning users.
