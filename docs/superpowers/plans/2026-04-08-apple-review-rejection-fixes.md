# Apple Review Rejection Fixes — v1.0 Resubmission

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three Apple App Review rejection issues (Guidelines 2.5.4, 5.1.1(ii), 2.1) to enable v1.0 resubmission.

**Architecture:** Config-only changes across `app.config.ts` (Expo source of truth), `ios/Musaium/Info.plist` (committed native plist for Xcode Cloud), and `app/_layout.tsx` (remove ATT call). No new features — only removing unused capabilities and improving privacy descriptions.

**Tech Stack:** Expo 55, React Native 0.83, Xcode Cloud builds (Pods committed)

**Important context:** iOS builds run on Xcode Cloud — `ios/` directory is committed (not gitignored). Changes to `Info.plist` must be made directly in the native file AND kept consistent with `app.config.ts` (which generates Info.plist during `expo prebuild`).

---

### Task 1: Remove UIBackgroundModes "audio" (Guideline 2.5.4)

**Why:** App declares background audio capability but only uses STT/TTS in foreground. Apple rejects unused background modes.

**Files:**
- Modify: `museum-frontend/ios/Musaium/Info.plist:94-97`

- [ ] **Step 1: Remove UIBackgroundModes from native Info.plist**

In `museum-frontend/ios/Musaium/Info.plist`, delete these 4 lines (94-97):

```xml
    <key>UIBackgroundModes</key>
    <array>
      <string>audio</string>
    </array>
```

- [ ] **Step 2: Verify no other file declares UIBackgroundModes**

Run:
```bash
grep -r "UIBackgroundModes" museum-frontend/ --include="*.plist" --include="*.ts" --include="*.json" | grep -v node_modules | grep -v Pods/ | grep -v build/
```
Expected: No output (no other declarations remain).

- [ ] **Step 3: Commit**

```bash
git add museum-frontend/ios/Musaium/Info.plist
git commit -m "fix(ios): remove UIBackgroundModes audio — app has no background audio (Guideline 2.5.4)"
```

---

### Task 2: Improve camera and location purpose strings (Guideline 5.1.1(ii))

**Why:** Apple requires purpose strings that clearly describe HOW the app uses the resource and what benefit the user gets. Current camera string is Apple's example of "what NOT to do". Location has unnecessary "Always" permission keys.

**Files:**
- Modify: `museum-frontend/app.config.ts:148-159` (infoPlist strings)
- Modify: `museum-frontend/app.config.ts:271-289` (plugin permission strings)
- Modify: `museum-frontend/ios/Musaium/Info.plist:68-79` (native plist strings)

**Approved strings:**

| Key | New value |
|-----|-----------|
| Camera | `"Musaium uses your camera so you can photograph artworks, monuments and museum exhibits — the captured image is sent to our AI assistant which identifies the piece and gives you historical and contextual information about it."` |
| Location (WhenInUse) | `"Musaium uses your location to find museums and cultural sites near you, show them on the map, and recommend nearby visits — your location is never tracked or shared with third parties."` |

- [ ] **Step 1: Update expo-camera plugin permission in app.config.ts**

In `museum-frontend/app.config.ts`, replace lines 271-277:

```typescript
      [
        'expo-camera',
        {
          cameraPermission: 'Allow $(PRODUCT_NAME) to access your camera',
          recordAudioAndroid: false,
        },
      ],
```

With:

```typescript
      [
        'expo-camera',
        {
          cameraPermission:
            'Musaium uses your camera so you can photograph artworks, monuments and museum exhibits — the captured image is sent to our AI assistant which identifies the piece and gives you historical and contextual information about it.',
          recordAudioAndroid: false,
        },
      ],
```

- [ ] **Step 2: Update expo-location plugin permission in app.config.ts**

In `museum-frontend/app.config.ts`, replace lines 285-290:

```typescript
      [
        'expo-location',
        {
          locationWhenInUsePermission: 'Allow Musaium to find museums near your location.',
        },
      ],
```

With:

```typescript
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Musaium uses your location to find museums and cultural sites near you, show them on the map, and recommend nearby visits — your location is never tracked or shared with third parties.',
        },
      ],
```

- [ ] **Step 3: Update ios.infoPlist strings in app.config.ts**

In `museum-frontend/app.config.ts`, replace lines 150-159:

```typescript
        NSCameraUsageDescription:
          'Allow $(PRODUCT_NAME) to access your camera to photograph artworks and monuments for AI analysis.',
        NSMicrophoneUsageDescription:
          'Allow $(PRODUCT_NAME) to access your microphone for voice questions about artworks.',
        NSPhotoLibraryUsageDescription:
          'Allow $(PRODUCT_NAME) to access your photo library to select artwork images for analysis.',
        NSPhotoLibraryAddUsageDescription:
          'Allow $(PRODUCT_NAME) to save images to your photo library.',
        NSFaceIDUsageDescription: 'Allow $(PRODUCT_NAME) to use Face ID to unlock the app.',
        NSLocationWhenInUseUsageDescription: 'Allow Musaium to show museums near you.',
```

With:

```typescript
        NSCameraUsageDescription:
          'Musaium uses your camera so you can photograph artworks, monuments and museum exhibits — the captured image is sent to our AI assistant which identifies the piece and gives you historical and contextual information about it.',
        NSMicrophoneUsageDescription:
          'Allow $(PRODUCT_NAME) to access your microphone for voice questions about artworks.',
        NSPhotoLibraryUsageDescription:
          'Allow $(PRODUCT_NAME) to access your photo library to select artwork images for analysis.',
        NSPhotoLibraryAddUsageDescription:
          'Allow $(PRODUCT_NAME) to save images to your photo library.',
        NSFaceIDUsageDescription: 'Allow $(PRODUCT_NAME) to use Face ID to unlock the app.',
        NSLocationWhenInUseUsageDescription:
          'Musaium uses your location to find museums and cultural sites near you, show them on the map, and recommend nearby visits — your location is never tracked or shared with third parties.',
```

- [ ] **Step 4: Update native Info.plist — camera string**

In `museum-frontend/ios/Musaium/Info.plist`, replace line 69:

```xml
    <string>Allow $(PRODUCT_NAME) to access your camera</string>
```

With:

```xml
    <string>Musaium uses your camera so you can photograph artworks, monuments and museum exhibits — the captured image is sent to our AI assistant which identifies the piece and gives you historical and contextual information about it.</string>
```

- [ ] **Step 5: Update native Info.plist — location WhenInUse string**

In `museum-frontend/ios/Musaium/Info.plist`, replace line 79:

```xml
    <string>Allow Musaium to find museums near your location.</string>
```

With:

```xml
    <string>Musaium uses your location to find museums and cultural sites near you, show them on the map, and recommend nearby visits — your location is never tracked or shared with third parties.</string>
```

- [ ] **Step 6: Remove NSLocationAlways* keys from native Info.plist**

In `museum-frontend/ios/Musaium/Info.plist`, delete these 4 lines (74-77):

```xml
    <key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
    <string>Allow $(PRODUCT_NAME) to access your location</string>
    <key>NSLocationAlwaysUsageDescription</key>
    <string>Allow $(PRODUCT_NAME) to access your location</string>
```

The app only uses `requestForegroundPermissionsAsync()` — "Always" location is not needed.

- [ ] **Step 7: Verify all purpose strings are non-generic**

Run:
```bash
grep -n "to access your" museum-frontend/ios/Musaium/Info.plist
```

Expected output should only show microphone, photo library, photo save, and Face ID lines — NOT camera or location (those now have specific strings).

- [ ] **Step 8: Commit**

```bash
git add museum-frontend/app.config.ts museum-frontend/ios/Musaium/Info.plist
git commit -m "fix(ios): improve camera + location purpose strings — explicit usage descriptions (Guideline 5.1.1(ii))"
```

---

### Task 3: Remove App Tracking Transparency (Guideline 2.1)

**Why:** The app does NOT track users (no ad SDKs, no data brokers, privacy manifest declares `NSPrivacyTracking: false`, all collected data types have `tracking: false`). ATT was added as a precaution but is incorrect — Apple requires either a working ATT prompt or no tracking declaration. Removing ATT entirely is the correct path.

**Files:**
- Modify: `museum-frontend/app/_layout.tsx:107-117` (remove ATT useEffect)
- Modify: `museum-frontend/app.config.ts:295-301` (remove plugin)
- Modify: `museum-frontend/ios/Musaium/Info.plist:90-91` (remove NSUserTrackingUsageDescription)
- Modify: `museum-frontend/package.json:59` (remove dependency)
- Regenerate: `museum-frontend/package-lock.json` (npm install)
- Modify: `museum-frontend/ios/Podfile.lock` (after pod deintegrate/install)

- [ ] **Step 1: Remove ATT useEffect from app/_layout.tsx**

In `museum-frontend/app/_layout.tsx`, delete lines 107-117:

```typescript
  useEffect(() => {
    if (Platform.OS === 'ios') {
      import('expo-tracking-transparency')
        .then(({ requestTrackingPermissionsAsync }) => {
          void requestTrackingPermissionsAsync();
        })
        .catch(() => {
          /* fire-and-forget */
        });
    }
  }, []);
```

Also remove the now-unused `Platform` import IF no other code uses it. Check first:

```bash
grep -n "Platform" museum-frontend/app/_layout.tsx | grep -v "tracking"
```

If `Platform` is still used elsewhere in the file, keep the import. If not used, remove it from the import line.

- [ ] **Step 2: Remove expo-tracking-transparency plugin from app.config.ts**

In `museum-frontend/app.config.ts`, delete lines 295-301:

```typescript
      [
        'expo-tracking-transparency',
        {
          userTrackingPermission:
            '$(PRODUCT_NAME) uses tracking to improve your museum experience with personalized artwork recommendations.',
        },
      ],
```

- [ ] **Step 3: Remove NSUserTrackingUsageDescription from native Info.plist**

In `museum-frontend/ios/Musaium/Info.plist`, delete lines 90-91:

```xml
    <key>NSUserTrackingUsageDescription</key>
    <string>$(PRODUCT_NAME) uses tracking to improve your museum experience with personalized artwork recommendations.</string>
```

- [ ] **Step 4: Remove expo-tracking-transparency from package.json**

In `museum-frontend/package.json`, delete line 59:

```json
    "expo-tracking-transparency": "~55.0.11",
```

- [ ] **Step 5: Regenerate lockfile**

```bash
cd museum-frontend && npm install
```

Expected: `package-lock.json` updated, `expo-tracking-transparency` no longer listed.

- [ ] **Step 6: Regenerate Podfile.lock (iOS native deps)**

Since Pods are committed for Xcode Cloud:

```bash
cd museum-frontend/ios && pod install
```

Expected: `Podfile.lock` no longer lists `ExpoTrackingTransparency`. The `Pods/` directory updates.

- [ ] **Step 7: Verify no remaining ATT references**

```bash
grep -rn "tracking-transparency\|requestTrackingPermissions\|NSUserTracking\|TrackingTransparency" museum-frontend/ --include="*.ts" --include="*.tsx" --include="*.plist" --include="*.json" | grep -v node_modules | grep -v Pods/ | grep -v build/ | grep -v package-lock
```

Expected: No output.

- [ ] **Step 8: Run lint + tests**

```bash
cd museum-frontend && npm run lint && npm test
```

Expected: All pass. No test references ATT (confirmed during investigation).

- [ ] **Step 9: Commit**

```bash
git add museum-frontend/app/_layout.tsx museum-frontend/app.config.ts museum-frontend/ios/Musaium/Info.plist museum-frontend/package.json museum-frontend/package-lock.json museum-frontend/ios/Podfile.lock museum-frontend/ios/Pods/
git commit -m "fix(ios): remove App Tracking Transparency — app does not track users (Guideline 2.1)"
```

---

### Task 4: Bump CFBundleVersion for resubmission

**Why:** Apple requires a new build number for each submission, even if the version string stays the same.

**Files:**
- Modify: `museum-frontend/ios/Musaium/Info.plist:49`

- [ ] **Step 1: Bump CFBundleVersion**

In `museum-frontend/ios/Musaium/Info.plist`, replace line 49:

```xml
    <string>1</string>
```

With:

```xml
    <string>2</string>
```

(This is the `<string>` immediately after `<key>CFBundleVersion</key>` on line 48.)

- [ ] **Step 2: Commit**

```bash
git add museum-frontend/ios/Musaium/Info.plist
git commit -m "chore(ios): bump CFBundleVersion 1→2 for App Store resubmission"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run full frontend lint + tests**

```bash
cd museum-frontend && npm run lint && npm test
```

Expected: All pass.

- [ ] **Step 2: Verify Info.plist has no remaining issues**

Validate that:
1. No `UIBackgroundModes` key exists
2. No `NSUserTrackingUsageDescription` key exists
3. No `NSLocationAlways*` keys exist
4. `NSCameraUsageDescription` contains "photograph artworks"
5. `NSLocationWhenInUseUsageDescription` contains "museums and cultural sites"
6. `CFBundleVersion` is `2`

```bash
grep -E "UIBackgroundModes|NSUserTracking|NSLocationAlways" museum-frontend/ios/Musaium/Info.plist
```

Expected: No output.

```bash
grep -A1 "NSCameraUsageDescription\|NSLocationWhenInUseUsageDescription\|CFBundleVersion" museum-frontend/ios/Musaium/Info.plist
```

Expected: Camera string mentions "photograph artworks", location mentions "museums and cultural sites", version is `2`.

---

### Post-Implementation: App Store Connect Checklist (manual)

After the code changes are committed and a new build is submitted:

1. **App Store Connect > App Privacy:**
   - Navigate to: App Store Connect > Your App > App Privacy
   - Change "Does your app or any third-party SDKs collect data?" response to reflect no tracking
   - Specifically: for any data type previously marked as "Used for tracking" → uncheck "Yes, ... is used for tracking purposes"
   - Confirm `NSPrivacyTracking: false` matches the App Store Connect declaration

2. **App Store Connect > App Review Information:**
   - In the "Notes" field, add: "This build removes UIBackgroundModes audio (not used), improves privacy purpose strings with explicit usage descriptions, and removes App Tracking Transparency (app does not track users). Privacy manifest confirms NSPrivacyTracking: false."

3. **Verify before submitting:**
   - The new build number (2) appears in TestFlight
   - Test on a physical device that the app launches correctly (crash fix from `762060ac` is included)
   - Verify camera permission dialog shows the new descriptive string
   - Verify location permission dialog shows the new descriptive string
   - Verify NO ATT popup appears on first launch
