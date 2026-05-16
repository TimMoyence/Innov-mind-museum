# F4 — Forensic verification of suspected critical bugs

**Audit date :** 2026-05-13
**Verifier :** F4 (critical-gap forensic agent)
**Method :** Pure source code Read / Grep / Bash. No web searches. All findings cross-checked against test files where applicable.

---

## Verdict matrix

| # | Claim | Status | Severity |
|---|-------|--------|----------|
| 1 | RoleGuard super_admin bug | **BUG (latent)** | P2 |
| 2 | chatSessionStore plaintext persist | **CONFIRMED — no allowlist exists at this layer** | P1 |
| 3 | expo-image absent, 10x react-native `<Image>` | **CONFIRMED** | P2 |
| 4 | Sharp `limitInputPixels` missing | **CONFIRMED (6 call sites)** | P1 (mitigated by 3 MB multer cap) |
| 5 | HEIC/HEIF blocked server-side | **CONFIRMED but MITIGATED by client-side JPEG conversion** | P3 |
| 6 | UIBackgroundModes=audio without expo-audio bg config | **CONFIRMED — no source uses background playback** | P1 (App Store review risk) |
| 7 | Stryker 99.75% mutation score | **NOT VERIFIED in current artifacts** | P2 (documentation drift) |

---

## Claim 1 — RoleGuard super_admin (BUG, P2)

**Evidence :**

- `museum-web/src/lib/auth.tsx:60-62` — JSDoc :

  > "UI rule: `super_admin` SHALL implicitly satisfy any `admin`-only check. Where a guard wants 'admin or above', pass both literals to `<RoleGuard allowedRoles={['admin', 'super_admin']}>`."

  Comment is contradictory : if super_admin is *implicit*, the consumer should NOT need to pass both literals. The doc actually instructs the caller-side workaround pattern (which works), so the comment is poorly worded but the BEHAVIOUR matches it.

- `museum-web/src/lib/auth.tsx:280` — Implementation :

  ```ts
  if (!user || !allowedRoles.includes(user.role)) {
  ```

  Pure `.includes()` — no implicit super_admin promotion. If a future contributor writes `<RoleGuard allowedRoles={['admin']}>` (trusting the *implicit* part of the doc), a super_admin user will be denied with 403.

- `museum-web/src/__tests__/admin/admin-auth.test.tsx` — **0 tests cover super_admin**. Tests at lines 117-281 exercise `['admin', 'moderator']` cases only.

- **Current callsites are safe** :
  - `src/components/admin/AdminShell.tsx:196` → `['admin', 'moderator', 'super_admin']` (explicit)
  - `src/app/[locale]/admin/ops/grafana/layout.tsx:16` → `['super_admin']`

  No `RoleGuard allowedRoles={['admin']}` (without super_admin) exists today.

**Severity :** P2 — Latent bug. No live regression today, but the JSDoc instruction is a future-trap. The fact that the **only** existing call site for an "admin or above" check requires both literals proves the contract is already broken (the explicit listing is a workaround, not an idiom).

**Patch suggestion :**

```ts
// auth.tsx:280
const hasRole =
  allowedRoles.includes(user.role) ||
  (user.role === 'super_admin' &&
    allowedRoles.some((r) => r === 'admin' || r === 'moderator' || r === 'museum_manager'));
if (!user || !hasRole) {
```

Or fix the JSDoc to match reality :

```ts
/**
 * Pass ALL roles you want to admit, including `super_admin` explicitly.
 * There is no implicit promotion.
 */
```

And add a test : `RoleGuard allowedRoles={['admin']}` + super_admin user → expect access granted (or removed, depending on which doctrine wins).

---

## Claim 2 — chatSessionStore plaintext persist (BUG, P1)

**Evidence :**

- `museum-frontend/features/chat/infrastructure/chatSessionStore.ts:97-101` :

  ```ts
  storage: createJSONStorage(() => AsyncStorage),
  ```

- `museum-frontend/features/chat/infrastructure/chatSessionStore.ts:8-13` — Persisted shape :

  ```ts
  interface PersistedSession {
    messages: ChatUiMessage[];
    title: string | null;
    museumName: string | null;
    updatedAt: number;
  }
  ```

  Full chat messages array → AsyncStorage (plaintext on disk, plain `NSUserDefaults` on iOS, plaintext on Android shared prefs).

- **The claimed allowlist `(messages|session|admin|auth|user)` does not exist in the codebase.** Grep across `museum-frontend/{features,shared,app}` returns 0 hits for `sensitiveKey`, `SENSITIVE_KEY`, `allowlist`, `secureKey`, `atRestEncryption`. The store layer in `shared/infrastructure/storage.ts:1-15` is a thin AsyncStorage wrapper with zero policy.

- **Secure storage IS used selectively for credentials only** :
  - `features/auth/infrastructure/authTokenStore.ts:33` — `expo-secure-store` for `auth.refreshToken` + `auth.accessToken`
  - `features/chat/hooks/useVoiceDisclosure.ts:26` — `expo-secure-store` for voice disclosure flag
  - `features/settings/infrastructure/offlineMapsPreferences.ts:1` — SecureStore for offline map flags

  Auth credentials are protected. **Chat session messages are NOT.**

- Risk reality check :
  - Threat model = jailbroken / rooted device, or malware with `READ_EXTERNAL_STORAGE` (Android < 10) / iOS file relay tool (e.g. iMazing).
  - Content exposed : every chat message (photo metadata excluded, but artwork queries, location-context responses, user questions including personal details).

**Severity :** P1 — pre-launch GDPR / privacy exposure. iOS/Android sandboxing mitigates casual access, but the AGENTS.md doctrine + the existence of an "allowlist" in the original claim implies an intended security boundary that simply was never implemented at this layer. The original R12 claim is correct that a contract is broken — the contract was just never written, not violated.

**Patch suggestion :**

1. Either wrap chat persistence in `expo-secure-store` (size limit ~2 KB/entry → use chunked storage or only persist last N messages encrypted).
2. Or add a `partialize` filter that drops `messages[].content` before persist (keep only IDs / timestamps for resume) :

   ```ts
   partialize: (state) => ({
     sessions: Object.fromEntries(
       Object.entries(state.sessions).map(([id, s]) => [
         id,
         { ...s, messages: s.messages.map((m) => ({ id: m.id, role: m.role, timestamp: m.timestamp })) },
       ]),
     ),
   }),
   ```

3. Or document explicitly that chat history is plaintext-at-rest and that's an accepted risk for V1.

---

## Claim 3 — expo-image absent, 10x react-native Image (BUG perf/UX, P2)

**Evidence :**

- `grep -rEn "from 'expo-image'" features/ shared/ app/` → **0 matches**.
- `museum-frontend/package.json:46` — `expo-image` is **NOT** a dependency. Only `expo-image-manipulator: ~55.0.15` and `expo-image-picker: ~55.0.16` are present (neither provides cached `<Image>`).
- `grep -rEn "<Image\b" features/ shared/ app/` → **10 JSX call sites** :
  1. `features/chat/ui/ImageCarousel.tsx:72`
  2. `features/chat/ui/ChatInput.tsx:44`
  3. `features/chat/ui/bubbleSections/ImageSection.tsx:56`
  4. `features/chat/ui/ImageCompareCard.tsx:59`
  5. `features/chat/ui/ImageFullscreenModal.tsx:184`
  6. `features/chat/ui/VisitSummaryModal.tsx:76`
  7. `features/museum/ui/MuseumDetailEnrichment.tsx:88`
  8. `features/museum/ui/MuseumSheetEnrichmentBody.tsx:57`
  9. `shared/ui/LiquidScreen.tsx:64`
  10. `shared/ui/BrandMark.tsx:49`

  All imported `Image` from `'react-native'` (verified at the import line of each file).

- Performance gaps versus `expo-image` :
  - No persistent disk cache (RN `<Image>` only does memory cache).
  - No blurhash / thumbhash for low-data placeholders → blank → pop snap UX.
  - No content-fit `cover/contain` migration — RN `<Image>` uses `resizeMode` with quirks.
  - No transition fades on load (causes layout shifts on Hermes).

**Severity :** P2 — UX/perf degradation, not a security issue. Pre-launch V1 image-heavy screens (artwork carousels, museum enrichment) will exhibit thrashing on first-render and cache misses on conversation reopen, especially over the planned freemium offline-pack feature.

**Patch suggestion :**

```bash
npm install expo-image
```

Then codemod the 10 sites. Most are `<Image source={{ uri }} style={…} resizeMode="cover" />` → drop-in replace with `<Image source={{ uri }} style={…} contentFit="cover" cachePolicy="memory-disk" />`. Add `placeholder={blurhash}` where DB serves one (backend already has SigLIP-extracted features, so blurhash extraction is incremental work).

---

## Claim 4 — Sharp limitInputPixels missing (BUG, P1 — mitigated)

**Evidence :**

- `grep -rn "limitInputPixels" src/` (excluding `.stryker-tmp`) → **0 matches**.
- `grep -rn "sharp(" src/` (excluding `.stryker-tmp`) → **6 call sites** :
  1. `src/modules/chat/adapters/secondary/embeddings/image-preprocess.ts:53`
  2. `src/modules/chat/adapters/secondary/image/image-processing.service.ts:52`
  3. `src/modules/chat/adapters/secondary/image/image-processing.service.ts:60`
  4. `src/modules/chat/adapters/secondary/image/image-processing.service.ts:61`
  5. `src/modules/chat/adapters/secondary/image/image-processing.service.ts:67`
  6. `src/modules/chat/adapters/secondary/image/image-processing.service.ts:76`

  (Original claim says "3 sharp() calls" — actual count is 6. R9 undercounted.)

- **Mitigation present :** `museum-backend/src/modules/chat/adapters/primary/http/helpers/chat-route.helpers.ts:103` :

  ```ts
  limits: {
    fileSize: env.llm.maxImageBytes,  // default 3 * 1024 * 1024 = 3 MB
    files: 1,
  },
  ```

  Plus magic-byte allowlist (JPEG/PNG/GIF/WebP) at `src/modules/chat/useCase/image/image-input.ts:106-112`.

- **Attack reproduction plan :**
  - Sharp's default `limitInputPixels = 268_402_689` (~16383x16383).
  - A 3 MB highly-compressed PNG (zip-bomb : huge IDAT, all-zeros plane, palette-mode RGBA→RGB expansion) can decode to **~268M pixels = 768 MB of RGB uint8 RAM** before sharp aborts.
  - Even at 3 MB upload, a single concurrent malicious request can spike Node heap by ~1 GB before OOM-kill.
  - With `multer.memoryStorage()` (line 101), the 3 MB buffer is already pinned in RSS; sharp decode amplifies 10-100x.
  - Practical attack : 5 concurrent uploads of crafted PNGs on a 2 GB VPS (current OVH spec from `OPS_DEPLOYMENT.md`) → SIGKILL.

  **Reproduction snippet** (do NOT run in prod) :
  ```js
  // Generate a 3 MB PNG that decodes to 16000x16000 px (~768 MB RGB)
  const sharp = require('sharp');
  const buf = await sharp({ create: { width: 16000, height: 16000, channels: 3, background: '#000' }})
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  // Upload to POST /api/chat/{sessionId}/message with image field
  ```

**Severity :** P1 — DoS exploit. Multer file-size cap is *necessary but insufficient* — sharp's pixel limit is the second line of defense and it's wide open. Combined attack surface = unauthenticated chat endpoint accepting multipart with valid JWT.

**Patch suggestion :**

In all 6 sharp() call sites, add :

```ts
sharp(buffer, { animated: true, limitInputPixels: 24_000_000 })
// or for non-animated:
sharp(buffer, { limitInputPixels: 24_000_000 })
```

24M = ~6000x4000 px which is way above any legitimate mobile upload but below the 100M-pixel danger zone. Sharp will throw a typed error which is already caught by `ImageDecodeError` at line 81.

Also consider lowering `env.llm.maxImageBytes` from 3 MB → 2 MB (mobile pipeline already optimises to 2.7 MB target in `imageUploadOptimization.ts:6`, so legit traffic already fits).

---

## Claim 5 — HEIC/HEIF blocked server-side, but MITIGATED (P3)

**Evidence :**

- `museum-backend/src/modules/chat/adapters/primary/http/helpers/chat-route.helpers.ts:39` :

  ```ts
  const DEFAULT_IMAGE_MIME_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];
  ```

  HEIC (`image/heic`) and HEIF (`image/heif`) absent. Same in `src/config/env.ts:203` defaults.

- Magic-byte allowlist at `src/modules/chat/useCase/image/image-input.ts:107-112` — only JPEG/PNG/GIF/WebP signatures.

- **Mobile mitigation : `museum-frontend/features/chat/application/imageUploadOptimization.ts:76`** :

  ```ts
  const optimized = await ImageManipulator.manipulateAsync(workingUri, actions, {
    compress: quality,
    format: ImageManipulator.SaveFormat.JPEG,  // ← Always converts to JPEG
  });
  ```

  Every iOS HEIC photo is run through `expo-image-manipulator` and saved as JPEG **before** upload. So the "iOS upload UX broken" claim is FALSE for the supported path (gallery picker + camera capture).

- **Edge cases where HEIC could leak through** :
  - User uses a custom share extension that bypasses `useImagePicker.ts` — none today.
  - User pastes a file via desktop / web client — N/A, mobile-only V1.
  - User uses an alternative camera app outputting HEIC directly — would only matter if file-system intent picker was wired. Not the case today.

**Severity :** P3 — defensive doctrine miss, not a live UX bug. The mitigation chain is silent — if `imageUploadOptimization.ts` is ever refactored out, the bug becomes P1. No comment in either file documents the dependency.

**Patch suggestion :**

Either (a) widen server-side allowlist to include `image/heic`, `image/heif` and add magic-byte signatures (`ftyp` box at offset 4 with brand `heic`/`heif`/`mif1`), letting sharp handle decode (sharp supports HEIC via `libvips` if compiled with `libheif`), OR (b) add explicit comments at both files cross-referencing each other so future contributors know the upload optimizer is load-bearing for HEIC compatibility.

---

## Claim 6 — UIBackgroundModes=audio dangling (BUG, P1 App Store reject risk)

**Evidence :**

- `museum-frontend/ios/Musaium/Info.plist:86-89` :

  ```xml
  <key>UIBackgroundModes</key>
  <array>
      <string>audio</string>
  </array>
  ```

- `museum-frontend/app.config.ts:275-281` — the `expo-audio` config plugin block does NOT include any background mode :

  ```ts
  [
    'expo-audio',
    {
      microphonePermission: 'Allow $(PRODUCT_NAME) to access your microphone for voice questions about artworks.',
    },
  ],
  ```

  No `iosBackgroundModes` / `staysActiveInBackground` / `usesBackgroundAudio`.

- `museum-frontend/app.config.ts:127-150` — the `infoPlist` override block does NOT contain `UIBackgroundModes` either. So the key in the static `Info.plist` is the only declaration — and it is NOT regenerated by Expo prebuild because the user committed `ios/` after first prebuild.

- **No source code uses background audio :**
  - `features/chat/application/useTextToSpeech.ts` (the TTS hook) — uses `createAudioPlayer({ uri })` (line 194). No `staysActiveInBackground`, no `setAudioModeAsync({ playsInBackground: true })`.
  - `features/chat/application/useAudioRecorder.ts:118-122` — calls `setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })`. No background flag.
  - `useTextToSpeech.ts:103-120` `cleanup()` removes the player on unmount, confirming foreground-only lifecycle.

**Severity :** P1 — App Store review risk. Apple's guideline 2.5.4 :

> "Multitasking apps may only use background services for their intended purposes."

If the reviewer launches the app, plays a TTS, backgrounds the app, and detects audio stops → they may flag the entitlement as unjustified and require a binary resubmit. This is a documented recurring rejection pattern (2-3 day review cycle loss).

**Patch suggestion (choose one) :**

A. **Remove the entitlement** (preferred — no UX regression today) :

```xml
<!-- museum-frontend/ios/Musaium/Info.plist:86-89 — DELETE these 4 lines -->
```

And ensure app.config.ts does NOT add it back. Run `pnpm expo prebuild --clean` to verify.

B. **Add background audio support intentionally** (if product wants museum-walk podcast-style continuous narration) :

```ts
// useTextToSpeech.ts
import { setAudioModeAsync } from 'expo-audio';
useEffect(() => {
  void setAudioModeAsync({ playsInBackground: true, playsInSilentMode: true });
}, []);
```

And document the entitlement justification in App Store Connect "Review notes" with a screencast of the museum walk.

Given V1 launch in 19 days (2026-06-01), option A is the safer choice.

---

## Claim 7 — Stryker 99.75% mutation score (NOT VERIFIED, P2 doc drift)

**Evidence :**

- Source claim : `docs/PHASE_HISTORY.md:34` says :

  > "Final autonomous night run 2026-05-10 → 2026-05-11 produced **0 survivors / 4999 mutants / 99.75% official mutation score**"

- Verification :
  - `reports/stryker-incremental.json` (mtime 2026-05-11 09:06:51) — recomputed totals :
    ```
    total      = 4999
    killed     =  896
    timeout    = 3171
    survived   =    0     ← matches claim
    NoCoverage =  481
    runtimeError = 10
    ignored    =  441
    ```
  - Standard Stryker mutation score formula : `(Killed + Timeout) / (Killed + Timeout + Survived + NoCoverage) = (896 + 3171) / (896 + 3171 + 0 + 481) = 4067 / 4548 = 89.42%`.
  - Mutation score on covered code (excluding NoCoverage) : `4067 / (4067 + 0) = 100.00%`.
  - **Neither computation matches 99.75%.**

- `reports/mutation/mutation.json` (mtime 2026-05-10 06:22:10 — older) gives 82.26% classical.

- `grep -rn "99.75" museum-backend/` → 0 matches anywhere (docs, logs, configs, source). The number appears ONLY in `docs/PHASE_HISTORY.md`.

- Possible interpretations :
  - "99.75%" could be a derived metric (e.g. Killed / (Killed+Survived) ignoring Timeout) = `896 / 896 = 100%` — also doesn't match.
  - Could be from a previous report file that no longer exists.
  - Could be a transcription error or rounding from a now-stale calculation.

**Severity :** P2 — documentation drift / unverifiable claim. The substantive achievement (0 survivors on 4067 covered mutants → 100% covered mutation score) is real. The "99.75%" specific number is **NOT REPRODUCIBLE** from current artifacts.

**Patch suggestion :**

Update `docs/PHASE_HISTORY.md:34` to the verified number :

> "Final autonomous night run 2026-05-10 → 2026-05-11 : **0 survivors / 4067 covered mutants / 100% mutation score on covered code** (4999 mutants total ; 481 NoCoverage carried as next-sprint backlog ; 89.42% if NoCoverage counted as undetected)."

And consider adding a CI step that asserts `reports/stryker-incremental.json` survivor count = 0, so the number stays self-documenting.

---

## Quick-reference patch ordering for V1 launch (19 days)

| # | Severity | Effort | When |
|---|---------|--------|------|
| 6 | P1 (App Store reject) | 5 min | Before next EAS build |
| 4 | P1 (DoS) | 30 min + tests | Before next prod deploy |
| 2 | P1 (privacy) | 2-4 h + tests | Before V1 launch |
| 1 | P2 (latent) | 30 min + 1 test | Before V1 launch |
| 3 | P2 (perf) | 4-8 h + visual QA | Post-launch hotfix OK |
| 5 | P3 (defensive doctrine) | 15 min comment OR 2 h widen allowlist | Post-launch |
| 7 | P2 (docs only) | 5 min | When convenient |

---

## Files cited (absolute paths)

- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/src/lib/auth.tsx`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/src/__tests__/admin/admin-auth.test.tsx`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-web/src/components/admin/AdminShell.tsx`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/features/chat/infrastructure/chatSessionStore.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/features/auth/infrastructure/authTokenStore.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/shared/infrastructure/storage.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/features/chat/application/imageUploadOptimization.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/features/chat/application/useImagePicker.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/features/chat/application/useTextToSpeech.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/features/chat/application/useAudioRecorder.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/ios/Musaium/Info.plist`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/app.config.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/package.json`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/modules/chat/adapters/secondary/image/image-processing.service.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/modules/chat/adapters/secondary/embeddings/image-preprocess.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/modules/chat/adapters/primary/http/helpers/chat-route.helpers.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/modules/chat/useCase/image/image-input.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src/config/env.ts`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/stryker/baseline.config.mjs`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/reports/stryker-incremental.json`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/reports/mutation/mutation.json`
- `/Users/Tim/Desktop/all/dev/Pro/InnovMind/docs/PHASE_HISTORY.md`
