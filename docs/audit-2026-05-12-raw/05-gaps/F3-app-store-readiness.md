# F3 — Mobile App Store Readiness (Musaium V1, launch 2026-06-01)

Agent : F3 (critical-gap). Date : 2026-05-13. Honesty UFR-013.
Scope : Apple App Store + Google Play submission readiness for Musaium V1.
Path audited : `museum-frontend/` (Expo 55 + RN 0.83, iOS bundle `com.musaium.mobile`, version 1.2.2 / build 89).

---

## TL;DR (verdict)

**Status : SUBMITTABLE WITH PATCHES — 3 blocking gaps, ~12 working days of fixes before TestFlight Beta.**

Musaium has done the hard infra work (PrivacyInfo.xcprivacy filled, ATS strict, Cert Transparency on prod, network security XML, deleteAccount endpoint, in-chat report flow, AI consent modal). What's missing is mostly **disclosure surface** mandated by Apple's November 2025 guideline update (5.1.2(i)), **Google Play closed-testing track** preparation (required for new accounts), and **store listing assets** that have not been produced (no app description, no localized listing, no privacy policy URL surfaced).

The iOS 26 launch crash (R11) is the only hard *technical* blocker outside of metadata work. Without a stable cold-start, no amount of metadata fixes the rejection.

**Recommended path** : fix iOS 26 crash → align AI consent copy with 5.1.2(i) → ship store-listing artefacts → enter TestFlight Beta D-21. Production submission realistic for **D-7 (2026-05-25)** with phased release set to 1% on launch day.

---

## 1. iOS App Store Review 2026 — what's required

| Requirement (2026) | What Apple asks | Musaium state |
|---|---|---|
| **Xcode 26 SDK build** | Mandatory since April 2026 for new submissions | OK — EAS uses Xcode 26.2 default on SDK 55 (Expo changelog confirms). |
| **PrivacyInfo.xcprivacy** | Required since May 1, 2024. Must declare `NSPrivacyAccessedAPITypes` w/ approved reason codes + `NSPrivacyCollectedDataTypes`. | OK — file present at `ios/Musaium/PrivacyInfo.xcprivacy` (verified), 4 API categories + 6 collected types declared. NSPrivacyTracking=false (correct — no IDFA, no ad SDK). |
| **NSPrivacyAccessedAPI reason codes correctness** | Reason codes must match actual usage. | OK BUT light — UserDefaults uses `CA92.1` + `C56D.1` in xcprivacy but config.ts only ships `CA92.1`. Drift between hand-edited Info.plist and Expo-generated manifest (see Risk row I-4). |
| **Guideline 5.1.2(i) — third-party AI disclosure** | (Nov 13 2025) "You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission **before** doing so." | **PARTIAL GAP** — `AiConsentModal` shown before first chat, lists data categories, but **never names the AI provider** (OpenAI / Deepseek / Google). Strings checked in `shared/locales/en/translation.json` (`consent.data_shared_title`, `consent.data_text/data_images/data_audio/data_location`) → no mention of "OpenAI", "GPT", "third-party AI service". |
| **Guideline 4.5.4 / 4.7 — chat content moderation** | UGC apps must let users report content + block users + filter objectionable content. | OK for report (verified `useMessageActions.reportMessage` → backend endpoint), no block-user (single-tenant chat with AI, not user-to-user — not required), input guardrails server-side OK per `chat.service.ts` (CLAUDE.md confirms layered defense). |
| **App Tracking Transparency (ATT)** | Required if you track across apps. | N/A — `NSPrivacyTracking=false`, no AppTrackingTransparency.framework usage. Correct stance. |
| **ITSAppUsesNonExemptEncryption** | Must declare to avoid Missing Compliance warning. | OK — `false` in Info.plist (HTTPS via URLSession is exempt). |
| **Age rating questionnaire (updated Jan 31, 2026)** | New 13+/16+/18+ tiers, new questions on AI/medical/violence themes. | **GAP** — not done in App Store Connect (no evidence in repo). Need to fill before submit. Recommended : 12+ (unrestricted web access via chat + AI content possibly unfiltered occasionally). |
| **Demo account / reviewer notes** | Required if features behind login. | **GAP** — must be provided in App Review Notes. Musaium has email/password + Apple Sign-In; reviewer needs a working demo account that triggers no Apple-ID OTP. |
| **App-specific encryption export** | If proprietary crypto. | N/A — HTTPS only. |

**Sources** :
- [Privacy manifest files — Apple Developer](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [Apple's Guideline 5.1.2(i): The AI Data Sharing Rule (DEV.to)](https://dev.to/arshtechpro/apples-guideline-512i-the-ai-data-sharing-rule-that-will-impact-every-ios-developer-1b0p)
- [Apple tightens App Store age controls and data sharing disclosure (PPC Land)](https://ppc.land/apple-tightens-app-store-age-controls-and-data-sharing-disclosure/)
- [Updated age ratings in App Store Connect](https://developer.apple.com/news/?id=ks775ehf)

---

## 2. `ios/Musaium/Info.plist` audit (verified file content)

File checked : `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/ios/Musaium/Info.plist`.

| Key | Present | Value | Verdict |
|---|---|---|---|
| `NSCameraUsageDescription` | yes | Long, user-facing, explains AI use | OK (descriptive purpose) |
| `NSPhotoLibraryUsageDescription` | yes | "Allow Musaium to select artwork photos from your library." | Minimum acceptable. Recommend expanding to mention AI like the camera string does (consistency). |
| `NSPhotoLibraryAddUsageDescription` | yes | "Allow Musaium to save images to your photo library." | OK — only matters if app saves to library; verify usage; otherwise drop the key to avoid reviewer questions. |
| `NSMicrophoneUsageDescription` | yes | Voice questions about artworks | OK |
| `NSLocationWhenInUseUsageDescription` | yes | "find museums and cultural sites near you…never tracked or shared with third parties." | OK (clear purpose) |
| `NSLocationAlwaysUsageDescription` + `NSLocationAlwaysAndWhenInUseUsageDescription` | yes | "Allow Musaium to access your location" | **WEAK string + likely unused** — no background-location code present (per `expo-location` plugin config which only declares `locationWhenInUsePermission`). Reviewers may reject for "permissions requested but feature not present." → **Drop these two keys** unless we ship a justified always-on feature. |
| `NSFaceIDUsageDescription` | yes | "use Face ID to unlock the app" | OK — biometric unlock present in `features/settings`. |
| `NSLocalNetworkUsageDescription` | yes | Expo Dev Launcher only | OK only if it's truly dev-only — but it's currently in the **production** Info.plist and that triggers a runtime prompt on first dev-server discovery attempt. Apple has flagged this since iOS 14. Move to a `Debug` build setting via `infoPlist` override, or accept the prompt. Low rejection risk. |
| `NSBonjourServices=_expo._tcp` | yes | Expo Bonjour | Same comment — dev-only key in prod build. |
| `ITSAppUsesNonExemptEncryption` | yes | `false` | OK (HTTPS exempt). |
| `NSAppTransportSecurity.NSAllowsArbitraryLoads` | yes | `false` | OK. |
| `NSAppTransportSecurity.NSAllowsLocalNetworking` | yes | `true` in plist (despite app.config.ts setting it `false` for prod) | **DRIFT** — hand-edited Info.plist diverges from app.config.ts P3.3 hardening intent. Reviewer won't reject, but it's a real config inconsistency to flag in F3 → see Rejection Risk I-4 below. |
| `NSRequiresCertificateTransparency` | **missing in Info.plist** | (set to `true` only in app.config.ts for prod variant) | Hand-edited Info.plist doesn't reflect P3.3 prod hardening. Will be regenerated next `expo prebuild --clean`, but the committed file lies about current intent. |
| `UIBackgroundModes = [audio]` | yes | Set | OK *iff* we actually play audio when backgrounded. Voice V1 pipeline returns MP3 buffer that plays in foreground after AI response — **R15 finding**. If no background playback in V1, this is rejection-risk. Apple specifically rejects apps that declare `audio` but never play audio when backgrounded (see [Apple Developer Forums](https://developer.apple.com/forums/thread/95216)). |
| `UIRequiresFullScreen = false` | yes | OK | iPad-friendly. |
| `LSMinimumSystemVersion = 12.0` | yes | iOS 12 minimum | OK but very old — bump to iOS 16 in V1.1 to drop dead-weight (no business impact today). |
| `RCTNewArchEnabled = true` | yes | New Architecture on | Consistent with RN 0.83 + Hermes. |

### Action items on Info.plist

1. **R15 — `UIBackgroundModes=audio` audit** : decide if Musaium actually needs background audio (e.g., user keeps walking with phone in pocket while AI reads response aloud). If yes, set `expo-audio.enableBackgroundPlayback=true` (default) **and** verify it works on a device (Expo Go is broken for backgrounded audio per known issues). If no, set `enableBackgroundPlayback=false` to drop the key. Today it's silently `true` because the default is `true`. → **Verify with PM before submitting**.
2. **Drop `NSLocationAlways*` keys** unless we ship background location. App.config.ts only declares `locationWhenInUsePermission` → the Always keys are dead weight.
3. **Re-run `expo prebuild --clean`** to sync Info.plist with app.config.ts. The committed Info.plist (hand-edited 2026-05-12 per file mtime) diverges from app.config.ts intent on `NSAllowsLocalNetworking` and `NSRequiresCertificateTransparency`.
4. **Expand `NSPhotoLibraryUsageDescription`** to mention AI use, consistent with camera string.

---

## 3. `PrivacyInfo.xcprivacy` audit

File : `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/ios/Musaium/PrivacyInfo.xcprivacy`.

**API types declared (with reason codes)** :
- `NSPrivacyAccessedAPICategoryUserDefaults` → `CA92.1` (3rd-party SDK keyed to bundle) + `C56D.1` (app functionality keyed to user) — OK
- `NSPrivacyAccessedAPICategoryFileTimestamp` → `0A2A.1` + `3B52.1` + `C617.1` — OK (Expo + RN libs touch file mtimes)
- `NSPrivacyAccessedAPICategoryDiskSpace` → `E174.1` + `85F4.1` — OK (image cache, asset manager)
- `NSPrivacyAccessedAPICategorySystemBootTime` → `35F9.1` — OK (Sentry uses for crash session)

**Collected data types** : 6 declared (email, name, photos, audio, precise location, crash data). All `NSPrivacyCollectedDataTypeTracking=false`. All linked correctly. → **OK**.

**Drift vs app.config.ts** : the xcprivacy file ships more reason codes (`C56D.1`, `0A2A.1`, `3B52.1`, `85F4.1`) than `app.config.ts` (`CA92.1`, `C617.1`, `35F9.1`, `E174.1`). The committed file is the truth at runtime — Expo prebuild won't strip it — but if anyone runs `expo prebuild --clean`, the xcprivacy will be regenerated from the leaner config.ts list and we'll lose `C56D.1` / `0A2A.1` / `3B52.1` / `85F4.1`. **Sync app.config.ts** to add the missing codes.

**Sources** :
- [Privacy manifest files — Apple Developer Docs](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [Reminder: Privacy requirement for app submissions starts May 1](https://developer.apple.com/news/?id=pvszzano)

---

## 4. Google Play 2026 — Data Safety + target SDK

| Requirement | What Google asks | Musaium state |
|---|---|---|
| **Target SDK 35 (Android 15)** | New apps after Aug 31 2025 must target API 35. | OK — Expo SDK 55 defaults `compileSdkVersion=35` / `targetSdkVersion=35` (verified `node_modules/expo-modules-autolinking/.../ExpoRootProjectPlugin.kt`). |
| **Scoped storage / Photo Picker** | `READ_MEDIA_IMAGES` requires Play Console declaration if used. | OK — `READ_EXTERNAL_STORAGE` capped at maxSdk 32 (legacy), `WRITE_EXTERNAL_STORAGE` capped at maxSdk 32 (legacy), and both are **blocked** for new SDKs via `expo-build-properties.blockedPermissions`. Image picking uses Expo `expo-image-picker` which uses `PhotoPicker` on Android 14+. → **No `READ_MEDIA_IMAGES` declaration needed**. |
| **Data Safety form** | Must declare all data collection / sharing / processing. | **GAP** — must fill in Play Console. Items to disclose : Email, Name, Photos, Audio (voice msgs), Precise location, Crash logs (Sentry). All processed by 3rd-party LLM providers (OpenAI / Deepseek / Google) — **must declare data shared with third parties.** |
| **AD_ID permission** | Auto-injected by Play Services unless blocked. | OK — `com.google.android.gms.permission.AD_ID` in `blockedPermissions`. |
| **Foreground service media playback** | Android 14+ requires service type. | OK — `android:foregroundServiceType="mediaPlayback"` on `AudioControlsService` in AndroidManifest.xml + `MEDIA_PLAYBACK_SESSION` action. |
| **`SYSTEM_ALERT_WINDOW`** | High-risk permission, Play Console flags. | **CONTRADICTION** — `app.config.ts` declares it `blockedPermissions` AND `AndroidManifest.xml` still has `<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>`. The AndroidManifest.xml file is hand-edited (mtime 2026-05-07) and out of sync with app.config.ts. → **Drop from manifest** (Play Console will flag and require declaration if it's there). |
| **`USE_FINGERPRINT`** | Deprecated since API 28 → 23 actually, replaced by `USE_BIOMETRIC`. | Already declared but harmless; can be dropped. |
| **Internet, Vibrate, etc.** | Normal permissions. | OK |
| **Closed testing — 12 testers × 14 days** | Mandatory for new personal accounts since Nov 13 2023. | **CHECK** — depends on Musaium account type. If **organization account** (Musaium SAS likely) → exempt. If **personal account** → **D-21 minimum to launch closed test track and recruit 12 testers**. Need to verify account type with PM. |
| **App content : declaration of access to sensitive permissions** | Need to justify location, audio, camera, biometric. | Standard, well-justified by core feature. No friction expected. |

**Sources** :
- [Meet Google Play's target API level requirement](https://developer.android.com/google/play/requirements/target-sdk)
- [Provide information for Google Play's Data safety section](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [Details on Google Play's Photo and Video Permissions policy](https://support.google.com/googleplay/android-developer/answer/14115180?hl=en-GB)
- [Google Play 12 Testers Requirement (PrimeTestLab)](https://primetestlab.com/blog/google-play-12-testers-closed-testing-guide)

---

## 5. `android/app/src/main/AndroidManifest.xml` audit

File verified.

**Permissions declared** :
- `ACCESS_COARSE_LOCATION` + `ACCESS_FINE_LOCATION` — OK (core feature)
- `CAMERA` — OK
- `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` — OK if background audio is actually used (R15 again)
- `INTERNET` — OK
- `MODIFY_AUDIO_SETTINGS` — OK (TTS playback)
- `READ_EXTERNAL_STORAGE` + `WRITE_EXTERNAL_STORAGE` (both `maxSdkVersion=32`) — OK (legacy compat)
- `RECORD_AUDIO` — OK (voice questions)
- `SYSTEM_ALERT_WINDOW` — **REMOVE** (contradicts `app.config.ts` blocked list, will trigger Play Console review questions)
- `USE_BIOMETRIC` + `USE_FINGERPRINT` — OK, can drop the deprecated one
- `VIBRATE` — OK

**Application attributes** :
- `android:allowBackup="true"` — **REVIEW** : backups include AsyncStorage data which may contain JWT refresh tokens. Recommend `false` or backup rules excluding secure store (already has `fullBackupContent="@xml/secure_store_backup_rules"` so OK).
- `android:usesCleartextTraffic="false"` — OK (P3.3 hardening)
- `android:enableOnBackInvokedCallback="false"` — Will trigger Play warning on Android 14+ predictive back. Should flip to `true` post-V1 once tested.
- `expo.modules.updates.ENABLED=false` — OK (OTA disabled per ADR-009).
- `MainActivity` deep-link schemes (`musaium`, `exp+musaium`) — `exp+musaium` is the dev-launcher scheme, **should not ship in production builds**. Move under a debug build variant. Low rejection risk but unprofessional.

**Service** : `AudioControlsService` with `mediaPlayback` foregroundServiceType + `MediaSessionService` intent — well-formed.

---

## 6. EAS Build / Submit config

File : `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/eas.json`.

| Profile | Verdict |
|---|---|
| `development` | OK — internal distribution, dev client. |
| `preview` | OK — staging API, internal distribution. |
| `internal` | Extends production, staging API → useful for QA on prod build. OK. |
| `production` | OK — autoIncrement build, env vars set. **`runtimeVersion: '1.0.0'` in app.config.ts** — used by OTA, but OTA disabled per ADR-009, so it's a noop. |
| `submit.production.ios` | OK — uses env vars `$ASC_APP_ID`, `$APPLE_ID`, `$APPLE_TEAM_ID`. Verify these are set in EAS Project Settings → Secrets. |
| `submit.production.android` | `releaseStatus: "draft"` → smart choice : EAS uploads to Play but doesn't auto-promote. Manual gate to start phased rollout. |
| `submit.internal.android` | `track: "internal"` + `releaseStatus: "completed"` → OK for internal beta. |

### Gaps in EAS config
- **No iOS internal submit profile** → impossible to push TestFlight builds via `eas submit -p ios --profile internal`. Add it now (only need `ascAppId/appleId/appleTeamId`, identical to prod).
- **`appVersionSource: "remote"`** + manual `version: "1.2.2"` in app.config.ts → version is hand-managed. With `autoIncrement: true` on production only the build number autoincrements, but version remains static unless bumped by hand. OK if PM owns version bumps explicitly.
- **No `gradleCommand` override** → uses default `:app:bundleRelease`. OK.
- **Service account key path** (`./.secrets/google-service-account.json`) — must be present at build time. Verify CI secret injection.

**Sources** :
- [EAS Build docs](https://docs.expo.dev/build/introduction/)
- [eas.json Demystified (Medium)](https://medium.com/@ikrammohdabdul/eas-json-demystified-the-only-guide-you-need-for-eas-build-submit-8b909e96348b)

---

## 7. TestFlight setup

**Current state** : no evidence of internal TestFlight test groups in the codebase. The repo has no `fastlane/` config, no `metadata/`. All TestFlight admin is presumed manual in App Store Connect.

### Recommended setup (D-21 to D-14)

1. **Internal Testing** (Apple-employee-style, no review needed) :
   - Up to 100 App Store Connect users.
   - Build uploaded via `eas submit -p ios --profile production` → auto-appears in TestFlight after Apple processing (~15–30 min).
   - Use for : Tim, dev team, PM, design.
2. **External Testing** (public-style, requires Beta App Review) :
   - Up to 10,000 testers via public link or email invite.
   - First build per **version** triggers Beta App Review (~24 h, lighter than full App Review).
   - Use for : museum partners, friends/family, ~20–50 beta users to bake the prod build 7 days before D-Day.
3. **Build expiry** : 90 days. Don't ship a TF build older than 60 days.

### Phased Release on App Store
Apple Phased Release pushes update to existing users automatically over 7 days at 1%/2%/5%/10%/20%/50%/100% increments. **New users always get the latest binary**. Use it for every update post-V1. For V1.0 initial release, Phased Release doesn't apply (it's only for updates).

**Sources** :
- [Release a version update in phases — App Store Connect Help](https://developer.apple.com/help/app-store-connect/update-your-app/release-a-version-update-in-phases/)
- [iOS Distribution Guide 2026: TestFlight, App Store & Enterprise](https://foresightmobile.com/blog/ios-app-distribution-guide-2026)

---

## 8. App Store metadata

**Current state** : no store metadata in the repo. No `fastlane/metadata/` folder. Screenshots exist at `museum-frontend/assets/images/store-screenshots/` (5 phone + 6 tablet, naming suggests they're production-grade) — **but they are not sized to current Apple specs.**

### Required for iOS submission

| Field | Limit | Status |
|---|---|---|
| App name | 30 chars | "Musaium" (7) — OK |
| Subtitle | 30 chars | **TO PRODUCE** — recommend "Voice-first museum guide" or "AI museum companion" |
| Keywords | 100 chars total, comma-separated, no spaces | **TO PRODUCE** — suggest "museum,art,history,AI,guide,audio,visit,culture,artwork,heritage" (78 chars) |
| Promotional text | 170 chars | **TO PRODUCE** — short, can be updated without resubmission. |
| Description | 4000 chars | **TO PRODUCE** — Must mention AI use clearly (Guideline 5.1.2). |
| Screenshots iPhone 6.9" | 1320×2868 PNG/JPG, no alpha | **CHECK** — phone screenshots exist but verify dimensions. Apple auto-scales for smaller sizes. |
| Screenshots iPad 13" | 2064×2752 PNG/JPG | **CHECK** — tablet screenshots exist, verify dimensions. |
| App preview video | Optional, ≤30s | Nice-to-have, not required for V1. |
| Age rating | New questionnaire | **TO COMPLETE** — recommend 12+ (unrestricted web content via AI). |
| Support URL | Required | `https://musaium.com/support` (verify exists) |
| Privacy Policy URL | Required | Privacy policy content exists in app (`features/legal/privacyPolicyContent.ts`) — **also need public URL** at e.g. `https://musaium.com/privacy`. |
| Marketing URL | Optional | Landing page. |
| App Review Notes | Required for B2C w/ login | **TO WRITE** — must contain demo creds, AI disclosure rationale, mic/camera/location use case. |
| Demo account | Required if login | **CRITICAL** — create reviewer@musaium.com / fixed-password account, ensure no Apple ID OTP, ensure works without sending real photos for AI to process (or accept that the reviewer will see real AI responses). |

### Required for Google Play

| Field | Limit | Status |
|---|---|---|
| App title | 30 chars | "Musaium" — OK |
| Short description | 80 chars | **TO PRODUCE** |
| Full description | 4000 chars | **TO PRODUCE**, same content as iOS w/ tweaks. |
| Screenshots phone | min 2, ≥320 px shortest side, max 8 | **CHECK** dimensions |
| Screenshots tablet 7" | optional | OK if not produced — no tablet feature degradation |
| Screenshots tablet 10" | optional | OK |
| Feature graphic | 1024×500 | **TO PRODUCE** |
| App icon | 512×512 | OK (already in `assets/images/museum-ia/android/`) |
| Content rating questionnaire | required | **TO COMPLETE** — IARC, recommend Everyone or 12+. |
| Data safety form | required | **TO COMPLETE** — see Section 4. |

**Sources** :
- [App Store Screenshot Sizes 2026 Cheat Sheet (Medium)](https://medium.com/@AppScreenshotStudio/app-store-screenshot-sizes-2026-cheat-sheet-iphone-16-pro-max-google-play-specs-3cb210bf0756)
- [App Store Metadata Optimization Guide 2026 (Appshots)](https://appshots.dev/blog/app-store-metadata-optimization-guide)

---

## 9. Rejection risk audit — Musaium V1 concrete list

Risk is rated B(locker) / H(igh) / M(edium) / L(ow) on probability of rejection × time-to-fix.

| # | Risk | Guideline | Probability | Severity | Effort | Status |
|---|---|---|---|---|---|---|
| **I-1** | **iOS 26 launch crash** (R11) — app crashes on cold start on A18 Pro | 2.1 — Performance | **B** | Blocker | Unknown (diag in progress per AppDelegate.swift `RNCrashCapture`) | **MUST FIX**. Crash = immediate rejection. |
| **I-2** | **AI consent doesn't name OpenAI/Deepseek/Google** in `consent.data_*` strings | 5.1.2(i) — third-party AI disclosure (Nov 2025) | **H** | Blocker | 1 day i18n + UX copy | Add provider name to consent strings : "Your photos and voice are processed by OpenAI (GPT-4o-mini and GPT-4o-mini-tts) and may transit through Deepseek/Google. We never share for marketing." |
| **I-3** | **`UIBackgroundModes=audio` declared but no real background audio playback** (R15) | 2.5.4 — false capability declaration | **H** | High | 2 hours code + 1 day device test | Either implement background playback OR set `expo-audio.enableBackgroundPlayback=false` |
| **I-4** | **Info.plist drift** : hand-edited file diverges from `app.config.ts` on `NSAllowsLocalNetworking`, `NSRequiresCertificateTransparency`, xcprivacy reason codes | 5.1.1(v) — accurate metadata | M | M | 2 hours | Run `expo prebuild --clean`, commit regenerated files, then re-sync app.config.ts with missing xcprivacy reason codes (`C56D.1`, `0A2A.1`, `3B52.1`, `85F4.1`). |
| **I-5** | **`NSLocationAlways*` keys declared but no background-location feature** | 5.1.1(ii) — request only data needed | M | M | 1 hour | Remove `NSLocationAlwaysUsageDescription` + `NSLocationAlwaysAndWhenInUseUsageDescription` from Info.plist + app.config.ts |
| **I-6** | **`NSLocalNetworkUsageDescription` + `NSBonjourServices` shipped in production build** | 2.1 — bundle hygiene | L | L | 4 hours (gate by build config) | Wrap with `#ifdef DEBUG` in Info.plist conditional, or accept first-launch prompt. |
| **I-7** | **Missing demo account in App Review Notes** | 2.1 — incomplete information | H | H | 30 min | Create reviewer account, no OTP, document in Review Notes. |
| **I-8** | **No subtitle / keywords / description in store listing** | 2.3 — accurate metadata | B | Blocker | 2 days copywriting + translation | Write copy, get FR + EN versions reviewed. |
| **I-9** | **Age rating questionnaire not completed** (Jan 31 2026 deadline) | 1.3 — Kids category / age-gating | B | Blocker | 1 hour | Fill new questionnaire in App Store Connect. Recommend 12+. |
| **I-10** | **No public Privacy Policy URL** | 5.1.1 — Privacy policy required | B | Blocker | 1 day (deploy static page) | Deploy `features/legal/privacyPolicyContent.ts` to `musaium.com/privacy` (web project already has `deploy-privacy-policy.yml`). |
| **A-1** | **`SYSTEM_ALERT_WINDOW` permission in AndroidManifest.xml** | Play Console policy | H | M | 5 min | Remove from manifest (already in `blockedPermissions`). |
| **A-2** | **`exp+musaium` deep-link scheme in production build** | Play Console hygiene | L | L | 1 hour | Strip from production manifest. |
| **A-3** | **Data Safety form not filled** | Play Console required | B | Blocker | 4 hours | Fill in Play Console : Email, Name, Photos, Audio, Precise location, Crash logs all collected + shared w/ 3rd-party (LLM). |
| **A-4** | **No closed testing track with 12 testers × 14 days** (if personal account) | Play Console for new personal accounts | B | Blocker if personal | 14 calendar days | **Verify account type with PM**. If personal → start closed test D-21 minimum. |
| **A-5** | **No tablet 7"/10" screenshots required** | — | N/A | — | — | Optional, not blocking. |
| **GEN-1** | **HEIC/HEIF blocked in upload MIME allowlist** (R9 cross-ref) | Bad UX, will trigger 1-star reviews | M | M | 1 day BE | Convert HEIC→JPEG client-side in `expo-image-picker` (set `selectionLimit: 1, allowsEditing: false, mediaTypes: 'images'` and ensure `expo-image-manipulator` re-encodes to JPEG before upload). |
| **GEN-2** | **No in-app rating prompt** | — | L | L | 2 hours | Optional V1. Nice-to-have for ASO. |
| **GEN-3** | **No support URL / contact in app** | iOS 5.1.1 / Android Data Safety | M | M | 1 hour | Ensure `features/support/` reaches a real channel (email, web form). |

**Total blocker count : 7** (I-1, I-2, I-8, I-9, I-10, A-3, A-4).
**Estimated work to clear blockers : ~12 working days** (assuming iOS 26 crash fix is 5 days + parallel metadata work).

---

## 10. Submission runbook

> Calendar D-Day = first day binary visible to first user. Phased Release 1% starts D-Day.
> Add +5 days padding for unexpected App Review back-and-forth.

### D-21 — Foundation (2 weeks before submission)

- [ ] **Verify Google Play account type** with PM (personal vs organization). If personal → start closed test track today w/ 12 testers.
- [ ] **Fix iOS 26 crash** (R11). Submit a TestFlight build to capture native logs via `RNCrashCapture` + symbolicate. Confirm clean start on A18 Pro + iOS 26.x.
- [ ] **Decide R15** : keep `UIBackgroundModes=audio` and ship working background playback, or drop. PM call.
- [ ] **Deploy privacy policy** to `musaium.com/privacy` via `deploy-privacy-policy.yml`.
- [ ] **Create reviewer demo account** : `reviewer@musaium.com` w/ fixed pwd, NO Apple OTP / phone verification.
- [ ] **Draft store listing copy** (subtitle, description, keywords, promo text) in FR + EN.
- [ ] **Validate screenshots** : confirm 1320×2868 (iPhone 6.9") and 2064×2752 (iPad 13") dimensions, RGB, no alpha.

### D-14 — Pre-submission

- [ ] **Run `expo prebuild --clean`** → commit regenerated `ios/` + `android/` → review diff for drift.
- [ ] **Sync app.config.ts xcprivacy reason codes** (add missing `C56D.1`, `0A2A.1`, `3B52.1`, `85F4.1`).
- [ ] **Drop `NSLocationAlways*`** if no background-location feature.
- [ ] **Drop `SYSTEM_ALERT_WINDOW`** from AndroidManifest.xml.
- [ ] **Patch AI consent modal** : `consent.data_shared_title` block should name "OpenAI" (and Google/Deepseek if used for any text request). Add "Learn more" link to public AI disclosure page.
- [ ] **App Store Connect** : create app record, fill age rating, upload icon, fill App Privacy section (echoing PrivacyInfo.xcprivacy), add Review Notes w/ demo creds.
- [ ] **Play Console** : create app record, fill Data Safety form, fill content rating IARC, upload feature graphic.
- [ ] **Run `eas build --profile production --platform all`** → smoke test on real iPhone + real Android device.

### D-7 — Submission

- [ ] **iOS** : `eas submit -p ios --profile production` → choose "Manual release" in App Store Connect. Submit for App Review. ETA : 24–48 h review.
- [ ] **Android** : `eas submit -p android --profile production` → `releaseStatus: "draft"` keeps it parked in Play Console. Manually start rollout at 1% on D-Day.
- [ ] **TestFlight External Beta** : promote latest internal build to external testers (1 group, ~30 testers).
- [ ] **Monitor App Review queue** : average 24 h iOS, 1–7 days Android.

### D-3 — Last-minute

- [ ] If iOS in review > 48 h, request expedited review (use sparingly, only for true emergencies).
- [ ] Verify backend prod is on the version contracted by the binary (OpenAPI sync ratchet).
- [ ] Verify monitoring : Sentry SDK keys live, Grafana dashboards green.
- [ ] Pre-write 1-pager incident plan : how to roll back if D-Day reveals crash. Mobile rollback ≠ instant (must wait for next binary).

### D-1 — Go/No-Go

- [ ] **iOS** : status = "Pending Developer Release" or "Ready for Sale". Confirm Phased Release toggled ON in App Store Connect → Pricing & Distribution.
- [ ] **Android** : status = "Approved (draft)" in Play Console.
- [ ] **Backend** : prod URL responding 200 on `/api/health`. LLM Guard sidecar green. PostgreSQL up, pgvector loaded.
- [ ] **Final smoke** : reviewer account → install, login, chat, voice, location. Take screenshots for postmortem.
- [ ] **Communications drafted** : press release, social, partner-museum email.

### D-Day — Launch (2026-06-01)

- [ ] **iOS** : in App Store Connect, click "Release This Version". Phased Release auto-starts at 1%.
- [ ] **Android** : in Play Console, promote draft to Production at 1% staged rollout.
- [ ] **Monitor** : Sentry crash-free sessions > 99%, p95 chat latency < 5s, store reviews.
- [ ] **D+1** : if metrics green, bump to 5%. If red, pause and investigate.
- [ ] **D+7** : full rollout 100% if all green.

---

## 11. Verdict (executive)

**Mobile app stores readiness : ORANGE.**

Engineering infra is solid (PrivacyInfo.xcprivacy, ATS strict, network XML, deleteAccount endpoint, in-chat report flow, AI consent modal, OTA disabled, Cert Transparency for prod, target SDK 35). The PRD-level work (R11 crash fix, AI provider naming in consent UI, store listing assets, demo account, Data Safety form, age rating questionnaire) is **not done** and represents ~12 working days of focused work — feasible by 2026-05-25 if started this week (2026-05-13).

The Apple **Guideline 5.1.2(i)** (third-party AI disclosure, in force Nov 13 2025) is the single most under-appreciated regulatory risk. Musaium routes user photos, voice, and text to OpenAI without naming the provider on the consent screen → likely **immediate rejection** until fixed.

The **R15 finding** (UIBackgroundModes=audio but no real background playback) is well-known to App Review and rejects on sight per Apple Developer Forums history. Cheapest fix : flip `expo-audio.enableBackgroundPlayback` to `false`.

**iOS 26 cold-start crash (R11)** remains the unique technical hard-blocker. No quantity of metadata fixes the rejection if the reviewer device crashes on launch.

**Recommendation** : focus all bandwidth this week on (1) fix R11, (2) update AI consent copy to name OpenAI, (3) write store listing copy and ship privacy policy URL. The remaining items are routine work for the D-7 cutoff.

---

## Sources

- [App Review Guidelines — Apple Developer](https://developer.apple.com/app-store/review/guidelines/)
- [Privacy manifest files — Apple Developer Documentation](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- [Adding a privacy manifest to your app or third-party SDK](https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk)
- [Privacy updates for App Store submissions](https://developer.apple.com/news/?id=3d8a9yyh)
- [Reminder: Privacy requirement for app submissions starts May 1](https://developer.apple.com/news/?id=pvszzano)
- [Updated age ratings in App Store Connect](https://developer.apple.com/news/?id=ks775ehf)
- [Upcoming Requirements — Apple Developer](https://developer.apple.com/news/upcoming-requirements/)
- [Release a version update in phases — App Store Connect Help](https://developer.apple.com/help/app-store-connect/update-your-app/release-a-version-update-in-phases/)
- [ITSAppUsesNonExemptEncryption — Apple Developer Docs](https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption)
- [Apple App Store Rejection Guide 2026 (OpenSpace Services)](https://www.openspaceservices.com/blog/general/apple-app-store-rejection-guide-2026-the-15-most-common-reasons-and-how-to-fix-each)
- [Apple's Guideline 5.1.2(i): The AI Data Sharing Rule (DEV.to)](https://dev.to/arshtechpro/apples-guideline-512i-the-ai-data-sharing-rule-that-will-impact-every-ios-developer-1b0p)
- [Apple tightens App Store age controls and data sharing disclosure (PPC Land)](https://ppc.land/apple-tightens-app-store-age-controls-and-data-sharing-disclosure/)
- [Apple's new App Review Guidelines clamp down on third-party AI (TechCrunch)](https://techcrunch.com/2025/11/13/apples-new-app-review-guidelines-clamp-down-on-apps-sharing-personal-data-with-third-party-ai/)
- [Review rejected app — UIBackgrounds Audio Key (Apple Forums)](https://developer.apple.com/forums/thread/95216)
- [Meet Google Play's target API level requirement](https://developer.android.com/google/play/requirements/target-sdk)
- [Provide information for Google Play's Data safety section](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [Details on Google Play's Photo and Video Permissions policy](https://support.google.com/googleplay/android-developer/answer/14115180?hl=en-GB)
- [App testing requirements for new personal developer accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [Google Play 12 Testers Requirement (PrimeTestLab)](https://primetestlab.com/blog/google-play-12-testers-closed-testing-guide)
- [Expo SDK 55 Changelog](https://expo.dev/changelog/sdk-55)
- [EAS Build docs](https://docs.expo.dev/build/introduction/)
- [EAS Submit docs](https://docs.expo.dev/submit/introduction/)
- [Audio (expo-audio) — Expo Documentation](https://docs.expo.dev/versions/latest/sdk/audio/)
- [App Store Screenshot Sizes 2026 Cheat Sheet (Medium)](https://medium.com/@AppScreenshotStudio/app-store-screenshot-sizes-2026-cheat-sheet-iphone-16-pro-max-google-play-specs-3cb210bf0756)
- [App Store Metadata Optimization Guide 2026 (Appshots)](https://appshots.dev/blog/app-store-metadata-optimization-guide)
- [iOS Distribution Guide 2026: TestFlight, App Store & Enterprise](https://foresightmobile.com/blog/ios-app-distribution-guide-2026)

---

*F3 report. Verified against source files at /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/ on 2026-05-13. Honesty UFR-013 applied — gaps stated verbatim, no minimization. Reviewer should cross-check Google Play account type and verify whether R11 iOS 26 crash root cause has been published since this audit.*
