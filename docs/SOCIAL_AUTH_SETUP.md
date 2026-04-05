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

### [x] Step 3 — Create Web Client ID (most important)

1. Menu > **APIs & Services** > **Credentials**
2. **+ Create Credentials** > **OAuth client ID**
3. Application type: **Web application**
4. Name: `Musaium Web Client`
5. No Authorized redirect URIs needed (no web OAuth flow)
6. **Create** > **copy the Client ID** (format: `xxxx.apps.googleusercontent.com`)
7. **This Client ID goes in the backend env**: `GOOGLE_OAUTH_CLIENT_ID=xxxx.apps.googleusercontent.com`

### [x] Step 4 — Create iOS Client ID

1. **+ Create Credentials** > **OAuth client ID**
2. Application type: **iOS**
3. Name: `Musaium iOS`
4. Bundle ID: `com.musaium.mobile`
5. **Create** > **copy the iOS Client ID** (format: `yyyy.apps.googleusercontent.com`)
6. **This Client ID goes in two places**:
   - `museum-frontend/app.config.ts` — `iosUrlScheme` (reversed format: `com.googleusercontent.apps.yyyy`)
   - `museum-frontend/services/socialAuthService.ts` — `iosClientId` in `GoogleSignin.configure()`

### [x] Step 5 — Create Android Client ID

1. **+ Create Credentials** > **OAuth client ID**
2. Application type: **Android**
3. Name: `Musaium Android`
4. Package name: `com.musaium.mobile`
5. SHA-1 certificate fingerprint — get with:

   ```bash
   # With EAS managed credentials:
   eas credentials --platform android
   # Select the keystore > shows SHA-1

   # Or with local keystore:
   keytool -list -v -keystore ./android/app/release.keystore -alias key0
   ```

6. **Create**

### [x] Step 6 — Enable API (optional but recommended)

1. Menu > **APIs & Services** > **Library**
2. Search "Google Identity" or "People API [x]"
3. Enable if not already done

**Result**: 3 Client IDs created (Web, iOS, Android). The Web Client ID is the main one used for token verification.

---

## [x] 3. Backend Environment Variables

Add to `museum-backend/.env`:

```env
# Apple Sign-In (bundle ID — used to verify the "aud" claim in Apple JWTs)
APPLE_CLIENT_ID=com.musaium.mobile

# Google Sign-In (Web Client ID — used to verify the "aud" claim in Google JWTs)
# If you have multiple client IDs (web + iOS), comma-separate them
GOOGLE_OAUTH_CLIENT_ID=xxxx.apps.googleusercontent.com
```

Add to GitHub Actions secrets (for CI/CD):

- `GOOGLE_OAUTH_CLIENT_ID` — same value as above
- For staging: same values (one Google project is sufficient)

---

## 4. Frontend Configuration

### [x] Update `app.config.ts`

Replace the placeholder `iosUrlScheme` with the real iOS Client ID (reversed):

```ts
['@react-native-google-signin/google-signin', {
  iosUrlScheme: 'com.googleusercontent.apps.YOUR_REAL_IOS_CLIENT_ID',
}],
```

### [x] Update `services/socialAuthService.ts`

Replace the placeholder values with real Client IDs:

```ts
GoogleSignin.configure({
  webClientId: 'YOUR_REAL_WEB_CLIENT_ID.apps.googleusercontent.com',
  iosClientId: 'YOUR_REAL_IOS_CLIENT_ID.apps.googleusercontent.com',
});
```

---

## 5. EAS Rebuild

The two libraries add native modules — OTA updates are insufficient:

```bash
# Rebuild dev client for testing
eas build --profile development --platform all

# Or just iOS first (Apple Sign-In only exists on iOS)
eas build --profile development --platform ios
```

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
