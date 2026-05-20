# Social Sign-In Setup Guide

Step-by-step setup for Apple Sign-In and Google Sign-In in Musaium.

---

## 1. Apple Developer Portal (developer.apple.com)

> Pre-requisite: an active Apple Developer account ($99/year) and app ID `com.musaium.mobile` already created.

### Step 1 — Enable Sign in with Apple capability

1. Go to https://developer.apple.com/account/resources/identifiers/list
2. Click the `com.musaium.mobile` identifier
3. Scroll to **Capabilities**
4. Check **Sign In with Apple**
5. Click **Save** (top right) and confirm

### Step 2 — Verify provisioning profile

1. Go to **Profiles** (left menu)
2. If the profile tied to `com.musaium.mobile` shows "Invalid" after the capability change:
   - Click it > **Edit** > **Save** > **Download**
3. With EAS Build, this is handled automatically — EAS regenerates profiles

### Step 3 — Done

- No Service ID needed (that's for web-based Sign in with Apple)
- No client secret needed — the backend verifies Apple JWTs using Apple's public JWKS keys (fetched automatically from `https://appleid.apple.com/auth/keys`)
- The `expo-apple-authentication` plugin adds the entitlement in the iOS build automatically

**Result**: `com.musaium.mobile` has "Sign In with Apple" capability checked.

---

## 2. Google Cloud Console (console.cloud.google.com)

> Pre-requisite: a Google Cloud project (ideally the same one used for Google Play Console).

> **Architecture note** — Musaium does **not** use the native `@react-native-google-signin` SDK. Google sign-in is a **server-mediated OAuth flow**: the mobile app opens `${apiBaseUrl}/api/auth/google/initiate?platform=mobile` in an in-app browser (`expo-web-browser` `openAuthSessionAsync`), the **backend** drives the entire OAuth dance with Google and redirects back to the `musaium://auth/google/callback` deeplink with a single-use code. The OAuth Client ID + secret live **server-side only**. Consequently there are **no** iOS/Android Client IDs, **no** `iosUrlScheme`, and **no** SHA-1 fingerprint to configure on the client. See `museum-frontend/features/auth/infrastructure/socialAuthProviders.ts`.

### [x] Step 1 — Create project (if not done)

1. Go to https://console.cloud.google.com
2. Click the project selector (top) > **New Project**
3. Name: `Musaium` > **Create**
4. Select the created project

### [x] Step 2 — Configure OAuth consent screen

1. Menu > **APIs & Services** > **OAuth consent screen**
2. Choose **External** > **Create**
3. Fill in:
   - App name: `Musaium`
   - User support email: your email
   - Developer contact: your email
4. **Save and Continue** on each step (Scopes, Test users) — no specific scopes needed
5. **Publish App** when ready (otherwise stays in "Testing" mode with max 100 users)

### [x] Step 3 — Create Web Client ID (the only one needed)

The backend performs the OAuth exchange, so a single **Web application** OAuth client is sufficient for all platforms (iOS, Android, web).

1. Menu > **APIs & Services** > **Credentials**
2. **+ Create Credentials** > **OAuth client ID**
3. Application type: **Web application**
4. Name: `Musaium Web Client`
5. **Authorized redirect URIs**: add the backend OAuth callback the server registers with Google (the production server's `/api/auth/google/callback` endpoint). The mobile deeplink (`musaium://...`) is **not** registered here — Google only ever redirects to the backend, which then 302s to the deeplink.
6. **Create** > copy **both** the Client ID (`xxxx.apps.googleusercontent.com`) **and** the Client secret.
7. These go in the **backend env**:
   - `GOOGLE_OAUTH_CLIENT_ID=xxxx.apps.googleusercontent.com` (used to verify the `aud` claim)
   - the Client secret (consult the backend `.env.example` for the exact var name) — needed for the server-side token exchange.

### [x] Step 4 — Enable API (optional but recommended)

1. Menu > **APIs & Services** > **Library**
2. Search "Google Identity" or "People API"
3. Enable if not already done

**Result**: 1 Web OAuth Client ID created. No iOS/Android Client IDs, no SHA-1 fingerprint, no `iosUrlScheme` — the backend owns the whole Google OAuth flow.

---

## [x] 3. Backend Environment Variables

Add to `museum-backend/.env`:

```env
# Apple Sign-In (bundle ID — used to verify the "aud" claim in Apple JWTs)
APPLE_CLIENT_ID=com.musaium.mobile

# Google Sign-In (Web Client ID — used to verify the "aud" claim in Google JWTs)
GOOGLE_OAUTH_CLIENT_ID=xxxx.apps.googleusercontent.com
# Plus the Google OAuth Client secret for the server-side token exchange
# (see museum-backend/.env.example for the exact variable name).
```

Add to GitHub Actions secrets (for CI/CD):

- `GOOGLE_OAUTH_CLIENT_ID` — same value as above
- For staging: same values (one Google project is sufficient)

---

## 4. Frontend Configuration

**No client-side Google Client ID configuration is required.** The mobile app never holds a Google OAuth client — it only opens the backend `/api/auth/google/initiate` URL and listens for the `musaium://auth/google/callback` deeplink. There is **no** `iosUrlScheme` to set in `app.config.ts` and **no** `services/socialAuthService.ts` (the actual implementation lives in `museum-frontend/features/auth/infrastructure/socialAuthProviders.ts`).

The only client-side requirements are:

- The `musaium://` deeplink scheme (set via `scheme: APP_SCHEME` in `app.config.ts`) so the OS routes the OAuth callback back into the app.
- `expo-web-browser` (registered as an Expo config plugin in `app.config.ts`) for `openAuthSessionAsync`.
- `expo-apple-authentication` (config plugin) for the native Apple Sign-In button.

All of these are already wired — no per-environment client config is needed for Google.

---

## 5. EAS Rebuild

`expo-apple-authentication` and `expo-web-browser` add native modules — OTA updates are insufficient when these are added/changed:

```bash
# Rebuild dev client for testing
eas build --profile development --platform all

# Or just iOS first (Apple Sign-In only exists on iOS)
eas build --profile development --platform ios
```

> **iOS native deps reminder** — if `expo-web-browser` / `expo-apple-authentication` Pods drift, the iOS build (Xcode Cloud) uses the committed `museum-frontend/ios/Pods/`. After any `expo prebuild` or native dep change, run `cd museum-frontend/ios && pod install` and `git add -f ios/Pods/...` (see CLAUDE.md "iOS build chain" gotcha). A missing native module is degraded gracefully via the lazy `require('expo-web-browser')` in `socialAuthProviders.ts`.

---

## 6. Database Migration

Run the migration on first deploy:

```bash
cd museum-backend
pnpm migration:run
```

This creates the `social_accounts` table and makes the `password` column nullable in `users`.

---

## 7. Verification Checklist

1. Backend typecheck: `cd museum-backend && pnpm lint`
2. Backend tests: `cd museum-backend && pnpm test`
3. Migration: `pnpm migration:run` then generate check migration (should be empty)
4. Frontend typecheck: `cd museum-frontend && npm run lint`
5. Frontend tests: `cd museum-frontend && npm test`
6. OpenAPI types sync: `npm run check:openapi-types`
7. Manual: iOS simulator > Apple Sign-In > session created
8. Manual: Android/iOS > Google Sign-In > session created
9. Manual: Settings > Delete Account > confirm > user deleted > redirected to auth
10. Manual: Account linking > register with email > sign in with Google (same email) > same user account

---

## Platform Visibility

| Platform    | Buttons visible |
| ----------- | --------------- |
| iPhone/iPad | Apple + Google  |
| Android     | Google only     |
| Web         | Google only     |

Apple Sign-In uses the native `AppleAuthentication.AppleAuthenticationButton` component (mandatory Apple branding). It only renders on iOS 13+ via `Platform.OS === 'ios'` + `AppleAuthentication.isAvailableAsync()`.
