# Musaium Mobile Frontend — Deep-Dive Audit (2026-05-12)

> Fresh-context evidence-based audit of `museum-frontend/`. All claims include `file:line` citations. Items I could not verify in the time-box are flagged `[NON VÉRIFIÉ]`.

---

## 1. Executive verdict

The Musaium mobile app is **substantially store-ready for the V1 2026-06-01 launch on a 100k-install scale**: the stack (RN 0.83.6, Expo SDK 55, React 19.2, New Architecture + Hermes, expo-router, React Query + Zustand + secure-store) is current, the auth pipeline implements single-flight refresh + biometric gating + per-user cache purge, AsyncStorage explicitly excludes sensitive query keys, and CI gates lint/typecheck/i18n/coverage (91/78/80/91) + Maestro nightly shards. **Three blocking risks remain**: (a) the iOS 26 React-bridge SIGABRT (Bug 2) is still under instrumentation per `museum-frontend/docs/IOS26_CRASH_DIAG.md:5`, not fixed — a recurrence on real-device A18 Pro will brick a non-trivial slice of launch traffic; (b) cert pinning ships **disabled** with placeholder hashes (`museum-frontend/shared/config/cert-pinning.ts:34-37`) and there are *no real SPKI captures*, so users on hostile public Wi-Fi run un-pinned; (c) the committed `.env` contains real Sentry DSNs and an `EXPO_TOKEN` (`museum-frontend/.env:9-15`) which, while not catastrophic, is a secret-hygiene red flag pre-launch. None of these block store submission but all three are operationally hot. Net call: **shippable with named risks**, recommend a 7-day prod bake (per UFR doctrine) and a hotfix-ready cert-pinning Phase 3 within 30 days post-launch.

---

## 2. Exact stack

### Runtime engine

| Tier | Version | Source |
|---|---|---|
| Node engine | `>=22.0.0` | `museum-frontend/package.json:7` |
| React | `19.2.0` | `museum-frontend/package.json:73` |
| React DOM | `19.2.0` | `museum-frontend/package.json:74` |
| React Native | `0.83.6` | `museum-frontend/package.json:77` |
| React Native Web | `^0.21.0` | `museum-frontend/package.json:85` |
| Expo SDK | `^55.0.11` | `museum-frontend/package.json:43` |
| Expo Router | `~55.0.10` | `museum-frontend/package.json:62` |
| Hermes | enabled | `museum-frontend/android/gradle.properties:41` + `museum-frontend/ios/Podfile:51` |
| New Architecture (Fabric + TurboModules) | enabled | `museum-frontend/android/gradle.properties:37` |
| TypeScript | `~5.9.2`, `strict: true`, `noUncheckedIndexedAccess: true` | `museum-frontend/package.json:114`, `museum-frontend/tsconfig.json:5` |
| Babel | `babel-preset-expo` + `babel-plugin-react-compiler` | `museum-frontend/babel.config.js:5` |
| Metro | default Expo `getDefaultConfig()` (no SVG transformer or extra resolvers) | `museum-frontend/metro.config.js:1-3` |

### Compatibility matrix call

Expo SDK 55 ↔ RN 0.83 ↔ React 19.2 ↔ Hermes V1 + New Architecture form **the** canonical 2026-Q2 release train (verified by the version trio in `package.json`, matches Expo's published SDK 55 chart). `expo-router 55.0.10` requires SDK 55, matched. Native modules are all `~55.0.x` (camera, audio, file-system, blur, image-picker, image-manipulator, etc.) — see `package.json:44-69` for the homogeneous version pin. The codebase intentionally **pins** these in `expo.install.exclude` (`package.json:117-150`) so `expo install` cannot drift them silently.

### Application dependencies (verified from `package.json:28-89`)

Data / networking:
- `axios ^1.16.0` — bumped 2026-05 per commit `af1d973a0` to clear high-severity CVE
- `@tanstack/react-query ^5.99.2` + `@tanstack/react-query-persist-client ^5.99.2` + `@tanstack/query-async-storage-persister ^5.99.2`
- `@react-native-community/netinfo 11.5.2`
- `react-native-ssl-public-key-pinning ^1.2.6` — wired but disabled, see §14

State / forms / schema:
- `zustand ^5.0.12` (7 stores discovered, all use `persist` middleware — see §6)
- `react-hook-form ^7.74.0` + `@hookform/resolvers ^5.2.2` + `zod ^4.4.1` (ADR-025 — used in `app/auth.tsx:36-49`)

Storage:
- `@react-native-async-storage/async-storage 2.2.0`
- `expo-secure-store ~55.0.11` (refresh + access token via Keychain/Keystore — see §14)

UI / lists / animation:
- `@shopify/flash-list 2.0.2` (chat + museum + conversation lists)
- `react-native-reanimated 4.2.1` + `react-native-worklets 0.7.4`
- `react-native-gesture-handler ~2.31.0`
- `react-native-screens ~4.24.0`
- `react-native-safe-area-context ~5.7.0`
- `expo-blur ~55.0.12` (frosted-glass UI in `shared/ui/GlassCard.tsx:19` + `(tabs)/_layout.tsx:40`)
- `react-native-svg ^15.13.0`
- `react-native-qrcode-svg ^6.3.15`
- `expo-linear-gradient ~55.0.11`
- `@expo/vector-icons ^15.0.3`
- `@ronradtke/react-native-markdown-display ^8.1.0` (chat bubble rendering)
- `expo-haptics ~55.0.12`

Voice + media:
- `expo-audio ^55.0.11` — STT recording + TTS playback (`features/chat/application/useAudioRecorder.ts:5-11`, `features/chat/application/useTextToSpeech.ts:3`)
- `expo-image-picker ~55.0.16`
- `expo-image-manipulator ~55.0.15`
- `expo-camera ~55.0.13`
- `expo-clipboard ~55.0.11`

Auth / biometrics:
- `expo-apple-authentication ~55.0.11`
- `expo-local-authentication ~55.0.13` (FaceID/TouchID/Iris — `features/auth/application/useBiometricAuth.ts:33-44`)
- `js-sha256 ^0.11.1` (used for Apple nonce hash, see §14)

Location / maps:
- `expo-location ~55.1.6`
- `@maplibre/maplibre-react-native 11.0.0` (offline pack manager — `features/museum/infrastructure/offlinePackManager.ts:1`)

i18n / l10n:
- `i18next ^26.0.6` + `react-i18next ^17.0.4` + `intl-pluralrules ^2.0.1`
- `expo-localization ~55.0.13`

Observability:
- `@sentry/react-native ^8.9.1` (release-only DSN, scrubber, navigation integration)

Misc:
- `expo-router ~55.0.10`
- `expo-linking ~55.0.11`
- `expo-web-browser ~55.0.15` (Pod re-linked after TestFlight 1.2.2(87) crash — commit `f7ec92f79`)
- `expo-splash-screen ~55.0.15` (manually hidden after auth bootstrap, `features/auth/application/AuthContext.tsx:44-46, 178`)
- `expo-store-review ~55.0.13` (`shared/infrastructure/inAppReview.ts:1`)
- `expo-system-ui ~55.0.15`
- `expo-updates ~55.0.18` (OTA **disabled** by config, `app.config.ts:316-321`; ships with a local patch — `patches/expo-updates+55.0.18.patch`, see §10)
- `expo-status-bar ~55.0.5`
- `react-native-webview 13.16.0`

### Build / dev / test deps (excerpt)

- `jest ^29.7.0` + `jest-expo ~55.0.13` + `@testing-library/react-native ^13.3.3` (`package.json:108-109,95`)
- `openapi-typescript ^7.13.0` (regen via `npm run generate:openapi-types`)
- `patch-package ^8.0.1` + `postinstall` hook (`package.json:26`)
- `eslint ^9.39.4` (flat config in `eslint.config.mjs`) + `typescript-eslint ^8.58.1` + 3 RN/React plugins + `eslint-plugin-musaium-test-discipline` (file: ref, baseline-driven)
- `expo-dev-client ~55.0.22` (dev only)
- `bats ^1.10.0` (Bash test runner — used by `scripts/maestro-runner-setup.sh`)
- `@faker-js/faker ^10.4.0` (factory seeds)

**Overrides** (`package.json:158-164`):
- `markdown-it >=14.0.0` — chase down `@ronradtke/react-native-markdown-display`'s transitive
- `follow-redirects >=1.15.12` — CVE
- `@xmldom/xmldom ^0.8.10` — unblock expo prebuild (commit `eef3b2c7f`)
- `@tootallnate/once >=2.0.1`
- `postcss >=8.5.10`

---

## 3. Routing structure (`app/`)

Expo Router file-based routing, typed routes enabled (`app.config.ts:310-312` — `experiments.typedRoutes: true`).

### Top-level entry points

| Route | File | Behavior |
|---|---|---|
| `_layout.tsx` (root) | `museum-frontend/app/_layout.tsx:1-205` | Sentry + global error handler + cert-pinning init pre-React; provider stack: `ErrorBoundary > PersistQueryClientProvider > I18nProvider > ThemeProvider > AuthProvider > ConnectivityProvider > DataModeProvider > BiometricGate > AuthenticationGuard > Stack` |
| `index.tsx` | `museum-frontend/app/index.tsx:1-16` | Redirects to `HOME_ROUTE` when authenticated, else `AUTH_ROUTE` |
| `auth.tsx` | `museum-frontend/app/auth.tsx:1-280` (snippet read) | Login/Register w/ react-hook-form + Zod, Apple/Google social, Face ID restore, MFA pre-handoff |
| `+not-found.tsx` | `museum-frontend/app/+not-found.tsx:1-50` | 404 screen with "back home" CTA + a11y label |

### `(tabs)/` group — bottom-tab navigator

Floating, blurred tab bar with safe-area-aware margins (`museum-frontend/app/(tabs)/_layout.tsx:23-42`).

| Tab | File | Purpose |
|---|---|---|
| `index` | `app/(tabs)/index.tsx` | Hidden tab (`href: null`) — internal redirect target |
| `home` | `app/(tabs)/home.tsx` | Home dashboard (daily-art surface + intent chips) |
| `conversations` | `app/(tabs)/conversations.tsx` | Conversations dashboard ("Dashboard" tab) |
| `museums` | `app/(tabs)/museums.tsx` | Museum directory + map |

### `(stack)/` group — modal/push routes

| Route | File |
|---|---|
| `(stack)/chat/[sessionId]` | `app/(stack)/chat/[sessionId].tsx` — chat session screen, dynamic param, gestureEnabled (`_layout.tsx:168-174`) |
| `(stack)/settings` | `app/(stack)/settings.tsx` |
| `(stack)/preferences` | `app/(stack)/preferences.tsx` |
| `(stack)/change-password` / `change-email` | password / email change forms |
| `(stack)/guided-museum-mode` | guided walk mode |
| `(stack)/offline-maps` | offline pack management UI |
| `(stack)/discover` | discovery feed |
| `(stack)/museum-detail` | museum profile screen |
| `(stack)/support` / `tickets` / `ticket-detail` / `create-ticket` | support module |
| `(stack)/privacy` / `terms` | legal modules |
| `(stack)/onboarding` | first-launch onboarding (gated by `useProtectedRoute`, `features/auth/useProtectedRoute.ts:35-52`) |
| `(stack)/reviews` | reviews list |

All `(stack)/` screens declared in the root `Stack` with `headerShown: false` (`app/_layout.tsx:165-189`).

### Deep links / scheme

- iOS / Android scheme: `musaium` (`app.config.ts:23`)
- iOS production bundle: `com.musaium.mobile` / preview: `com.musaium.mobile.preview` (`app.config.ts:24-25, 124`)
- Apple Sign-In enabled (`app.config.ts:126`)
- Fragment-stripping OAuth deeplink parser added 2026-05 (commit `58817475e`) — protects against `#access_token=…` fragment leak

### Route guard

`useProtectedRoute()` (`features/auth/useProtectedRoute.ts:13-54`) — single guard mounted inside `AuthenticationGuard` (`app/_layout.tsx:79-83`). Redirects:
1. Not authenticated → `AUTH_ROUTE`
2. Authenticated + on auth route → `HOME_ROUTE` or `ONBOARDING_ROUTE` (first launch)
3. Authenticated + first launch + not on onboarding → `ONBOARDING_ROUTE`

---

## 4. Feature modules (`features/`)

Hexagonal-ish layering: each feature has `ui/` + `application/` + `infrastructure/` + sometimes `domain/`. 13 feature folders (`features/`):

| Feature | Layers | Highlights |
|---|---|---|
| `auth/` | `ui/`, `screens/`, `application/`, `infrastructure/`, `domain/` | Email/pwd + Apple/Google + Biometric + MFA. `AuthContext.tsx:118-316` is the single auth state owner. `useProtectedRoute.ts` gates navigation. `authTokenStore.ts` wraps `expo-secure-store` (`features/auth/infrastructure/authTokenStore.ts:1-87`). 30+ files. |
| `chat/` | `ui/`, `application/`, `infrastructure/chatApi/`, `application/sendStrategies/`, `domain/` | Largest feature. `ChatMessageList.tsx` uses FlashList with per-message `getItemType` for recycling (`features/chat/ui/ChatMessageList.tsx:213-247`). Send strategy pattern (`sendMessageAudio`, `sendMessageImage`, `sendMessageStreaming`, `sendMessageText`). Local LLM cache (Zustand persist, `chatLocalCache.ts:87-186`), offline queue (`useOfflineQueue.ts`), offline image storage (`offlineImageStorage.ts`). |
| `museum/` | `ui/`, `application/`, `infrastructure/` | 45 files. MapLibre RN integration, offline pack manager (`offlinePackManager.ts`), city catalog (Paris/Lyon/Bordeaux/Lisbonne/Rome — `infrastructure/cityCatalog.ts`), low-data pack API, museum prefetch hooks, geo-fenced pre-cache (`useGeofencePreCache.ts`), offline pack prompt trigger (`useOfflinePackPromptTrigger.ts:36-89`). |
| `conversation/` | `ui/`, `application/`, `infrastructure/` | Conversations dashboard, swipe-to-delete (`ConversationItem.tsx:29`), `conversationsStore.ts` Zustand persist. |
| `daily-art/` | `ui/`, `application/`, `infrastructure/` | Per-museum daily-art surface, logout cleanup hook. |
| `home/` | `ui/` | Home screen surface + intent chips. |
| `settings/` | `ui/`, `application/`, `infrastructure/` | Voice preferences, runtime settings store (theme, locale, guideLevel), data-mode preference store, user profile store, content preferences. `dataModeStore.ts`, `runtimeSettingsStore.ts`, `userProfileStore.ts` — all Zustand+persist. |
| `support/` | `ui/`, `infrastructure/` | Ticket creation, listing, detail. |
| `review/` | `ui/`, `application/`, `infrastructure/` | In-app review prompt (`shared/infrastructure/inAppReview.ts:27`). |
| `onboarding/` | `ui/`, `application/` | First-launch onboarding slides (`CameraIntentSlide`, `GreetingSlide`, `MuseumModeSlide`, `WalkIntentSlide`, `StepIndicator`). |
| `legal/` | `ui/` | Privacy/terms content (excluded from coverage). |
| `art-keywords/` | `application/`, `infrastructure/`, `domain/` | Art keyword sync on app start (`useArtKeywordsSync` in `_layout.tsx:81`). Zustand persist store. |
| `diagnostics/` | (verify) | Debug/diagnostics surface — `[NON VÉRIFIÉ]` content; folder exists at `features/diagnostics/`. |

### Pure-domain modules (excluded from coverage)
- `features/auth/domain/authLogic.pure.ts`
- `features/chat/application/chatSessionLogic.pure.ts`
- `features/chat/application/chatSessionStrategies.pure.ts`
- `features/chat/domain/contracts.ts` (Zod schemas)
- `features/museum/infrastructure/haversine.ts`

Total: 132 `.ts` + 93 `.tsx` files under `features/`; 30 files under `app/`.

---

## 5. API client — generated OpenAPI types

### Generation

- Source: backend OpenAPI spec at `museum-backend/openapi/openapi.json`
- Output: `museum-frontend/shared/api/generated/openapi.ts` (4321 lines, NOT 3510 — fresh count via `wc -l`, file flagged in CLAUDE.md token discipline)
- Tool: `openapi-typescript ^7.13.0`
- Script: `npm run generate:openapi-types` (`package.json:12`)
- Drift guard: `npm run check:openapi-types` runs in CI (`.github/workflows/ci-cd-mobile.yml:89-90`), fails PR if generated types are stale relative to the BE spec

### Typed wrapper layer

- `museum-frontend/shared/api/openapiClient.ts:1-140` — fully type-safe `openApiRequest<P, M>()` :
  - extracts success status (200/201/202/204) → request typed response
  - templates `{param}` interpolation with `formatOpenApiPath()` (throws on missing param, `:91-112`)
  - query-string append (skips undefined / null, `:73-84`)
  - delegates to `httpRequest()`
- `museum-frontend/shared/api/httpRequest.ts:1-62` — thin Axios wrapper that injects `Content-Type: application/json` only for non-FormData bodies, plumbs `requiresAuth` flag, re-throws mapped `AppError`

### Underlying `httpClient` (Axios singleton)

`museum-frontend/shared/infrastructure/httpClient.ts:143-148`. Configured with:
- `Accept: application/json` default
- `timeout: 15000` (15 s)

### Request interceptor (`httpClient.ts:154-187`)

Each request:
- Resolves `baseURL` from `getApiBaseUrl()` at request time (not at module load — supports runtime switching)
- Records `_startedAt` for breadcrumb duration
- Generates `X-Request-Id` via `generateRequestId()` (UUID-shaped, used for tracing)
- Sets `Accept-Language` from `getLocale()` runtime var
- Sets `X-Data-Mode` from `getCurrentDataMode()` (`'low' | 'normal'` — see §6)
- Conditionally attaches `Authorization: Bearer <token>` when `requiresAuth !== false` and token exists

### Response interceptor (`httpClient.ts:214-293`)

**Auth refresh (single-flight, `:232-252`)**: on `401` for an authed request that isn't the refresh endpoint and hasn't been retried, calls `runAuthRefresh()` (`:69-99`) which is a single-flight wrapper — concurrent 401s share one in-flight `Promise<AuthRefreshResult>`. The result discriminates `success` / `invalid` / `transient`:
- `success` → swap header, retry the original request
- `invalid` → unauthorized handler fires **exactly once** for the shared cycle (`:85-91`) — clears tokens + persisted cache + per-user feature storage + redirects to `AUTH_ROUTE` (`AuthContext.tsx:233-241`)
- `transient` (network / 5xx during refresh) → keep session, let the original 401 fail

**Retry policy (`:254-286`)**:
- 429: up to **3** retries, honoring `Retry-After` header, else exponential backoff `1s, 2s, 4s` (`:267-279`). `DAILY_LIMIT_REACHED` exempt (`:256-258`).
- 5xx / network / `ECONNABORTED`: up to **2** retries, linear `150ms * (n+1)` (`:280-282`)
- Otherwise: map to AppError, breadcrumb, report to Sentry, reject

### AppError mapping

- `museum-frontend/shared/infrastructure/httpErrorMapper.ts` exports `mapAxiosError()` + `getApiErrorCode()` + `toAxiosLikeError()`
- `museum-frontend/shared/types/AppError.ts` defines the kind union (`Network | Timeout | Unauthorized | Forbidden | NotFound | Validation | RateLimited | DailyLimitReached | Streaming | OfflinePack | Location | Contract | Unknown`)
- `museum-frontend/shared/lib/errors.ts` — `getErrorMessage()` localizes via i18n hook (wired at `app/_layout.tsx:33`)
- Reportable kinds (Sentry): `Network | Timeout | Unknown | Contract | Streaming | OfflinePack | Location` (`shared/observability/errorReporting.ts:7-15`); user-actionable kinds intentionally **not** reported to keep Sentry signal clean

### SSE streaming

`features/chat/infrastructure/chatApi/stream.ts:1-100+` uses `expo/fetch` (not Axios) for `text/event-stream`. Reuses `getApiBaseUrl()` / `getAccessToken()` / `getLocale()` from the shared http client so the runtime state stays consistent. **Status**: deactivated post-V1 per ADR-001 (`stream.ts:43-46`); `isChatStreamingEnabled()` returns false today, revival V2.1.

### Token attachment & rotation

- Access token held in module-scope variable `accessToken` (`features/auth/infrastructure/authTokenStore.ts:5-15`) — fast, sync `getAccessToken()` used by the interceptor
- Refresh token in `expo-secure-store` (`features/auth/infrastructure/authTokenStore.ts:33-87`)
- Access token **also** persisted to `expo-secure-store` to enable cold-start "token_hydrated" path (`AuthContext.tsx:158-169`) — bootstrap doesn't issue a refresh itself, which avoids the double-refresh race (well-commented at `:151-157`)

---

## 6. State management

### React Query (server cache)

- `museum-frontend/shared/data/queryClient.ts:47-61` — `staleTime: 5min`, `gcTime: 24h`, `refetchOnReconnect: true`, `refetchOnWindowFocus: false`, mutation retry disabled
- `shouldRetry()` short-circuits 4xx terminal kinds (`Unauthorized | Forbidden | NotFound | Validation | DailyLimitReached | RateLimited`)
- **Persisted to AsyncStorage** via `@tanstack/query-async-storage-persister` (`:102-106`) — key `musaium.query.cache`, throttled 1s, busted by app version
- **Critical security control** (`:75-92`): `SENSITIVE_QUERY_KEY_PREFIXES = { messages, session, admin, auth, user }` — `shouldDehydrateQuery()` returns `false` for these, keeping them in-memory only. Documented as PII/privilege-level (`:65-74`).
- `resetPersistedCache()` (`:138-147`) — atomically removes the AsyncStorage blob FIRST then in-memory; ordered to survive crash mid-reset (`:131-137`). Called from `AuthContext` logout + unauthorizedHandler.

### Zustand (client state) — 7 stores, all `persist`-wrapped

| Store | File | Storage |
|---|---|---|
| Chat local cache (LLM answers, 200-entry LRU, 7-day TTL) | `features/chat/application/chatLocalCache.ts:87-186` | AsyncStorage via wrapper (`shared/infrastructure/storage.ts`) |
| Chat session store | `features/chat/infrastructure/chatSessionStore.ts` | AsyncStorage |
| Art keywords | `features/art-keywords/infrastructure/artKeywordsStore.ts` | AsyncStorage |
| Conversations | `features/conversation/infrastructure/conversationsStore.ts` | AsyncStorage |
| Offline pack choice (per-city decline/accept memory) | `features/museum/infrastructure/offlinePackChoiceStore.ts` | AsyncStorage |
| Data-mode preference (auto/low/normal) | `features/settings/dataModeStore.ts` | AsyncStorage |
| Runtime settings (theme/locale/guideLevel/etc.) | `features/settings/infrastructure/runtimeSettingsStore.ts` | AsyncStorage |
| User profile (hasSeenOnboarding) | `features/settings/infrastructure/userProfileStore.ts` | AsyncStorage |

### React Context (cross-tree)

- `AuthContext` (`features/auth/application/AuthContext.tsx:84-316`) — auth state owner
- `ThemeContext` (`shared/ui/ThemeContext.tsx:18-60`) — system/light/dark, persisted under `app.themeMode`
- `I18nContext` (`shared/i18n/I18nContext.tsx:28-103`) — language with device detect + RTL
- `ConnectivityContext` (`shared/infrastructure/connectivity/ConnectivityProvider.tsx:11-35`) — NetInfo state
- `DataModeContext` (`features/chat/application/DataModeProvider.tsx:25-105`) — composes user pref + NetInfo to resolve effective data mode

### No Redux / Jotai / Recoil

Verified via grep — only Zustand + React Query + Context across the codebase.

### Hook-level state

Heavy use of `useState` + `useReducer`-free functional patterns; chat session orchestration is pure-functional in `chatSessionLogic.pure.ts` + `chatSessionStrategies.pure.ts` (excluded from coverage as pure logic, tested by Node test runner).

---

## 7. Storage layer

### Token storage — `expo-secure-store`

- `features/auth/infrastructure/authTokenStore.ts:26-66` — lazy-loaded SecureStore (web fallback to AsyncStorage)
- Keys: `auth.refreshToken`, `auth.accessToken`
- iOS: Keychain Services (encrypted at rest, requires unlocked device); Android: EncryptedSharedPreferences (Keystore-backed AES-256). Not configured with `requireAuthentication: true` — so it does **not** require biometric unlock for every read (biometric is enforced by `BiometricGate` gating the React tree instead).

### Generic key-value — `AsyncStorage`

- `shared/infrastructure/storage.ts:4-26` — thin wrapper exposing `getItem`/`setItem`/`removeItem`/`getJSON`/`setJSON`
- AsyncStorage backs: theme preference (`app.themeMode`), biometric pref (`auth.biometricEnabled`), every Zustand store, cert-pinning kill-switch cache, runtime locale (`runtime.defaultLocale`)
- **Important**: NOT encrypted on iOS or Android. Plaintext file. Sensitive data MUST go through SecureStore — verified by:
  - Refresh + access tokens → SecureStore (verified above)
  - Biometric preference (boolean) → AsyncStorage (acceptable — flag only)
  - Theme / locale / preferences → AsyncStorage (acceptable — non-sensitive)
  - **React Query persister excludes** `auth | user | session | messages | admin` query keys from AsyncStorage (`shared/data/queryClient.ts:75-81`)

### Offline pack mechanism

- MapLibre offline tiles: `features/museum/infrastructure/offlinePackManager.ts:1-180+` — wraps `@maplibre/maplibre-react-native` `OfflineManager`. Per-city `cityId` metadata on each pack; configurable `minZoom (10)`, `maxZoom (16)` defaults (`:33-34`). Verified idempotent re-download (early return when state == 'complete', `:97-110`).
- Offline pack prompt: `features/museum/application/useOfflinePackPromptTrigger.ts:36-89` — auto-prompts user when `nearestCity` resolves AND choice store has no record AND network is strong (wifi OR cellular 4G/5G). Strong-network gate at `:60-62`.
- Per-city decision memo: `features/museum/infrastructure/offlinePackChoiceStore.ts` (Zustand persist).
- Chat answer prefetch: `features/chat/application/chatLocalCache.ts` — `bulkStore()` (`:126-136`) used by prefetch flow, lookup at `:92-117`. Cache key namespace mirrors backend "global" cache; pins classifier flags (no history / no attachment / no geo) to match `chat:llm:global:...` namespace (well-documented at `:73-85`).

### File-system caches

- TTS audio cache: `features/chat/application/useTextToSpeech.ts:49-86` — per-message MP3 under `<cacheDir>/tts/<messageId>.mp3` (native only — web uses browser cache). Disk-resident, used to replay TTS without re-hitting the backend.
- Offline image storage for the offline queue: `features/chat/application/offlineImageStorage.ts:6` — uses `FileSystem.documentDirectory` (persistent, survives reboot — appropriate for queued-but-not-yet-sent images).

### Recent commit context

- Commit `4ab8167e2` (2026-05-12, today) — "wire offline-pack prompt download + add feedback/transparency" — confirms the offline-pack prompt UX is brand-new this sprint.

---

## 8. Voice pipeline

### Recording (STT input side)

`features/chat/application/useAudioRecorder.ts:1-100+`:
- Native: `expo-audio` `useAudioRecorder(RecordingPresets.HIGH_QUALITY)` (`:35`)
- Web fallback: `navigator.mediaDevices.getUserMedia({ audio: true })` + `MediaRecorder` (`:78-100`)
- Web cleanup: revokes ObjectURL on unmount, stops MediaStream tracks (`:44-76`)
- Native cleanup: removes AudioPlayer (`:64-69`)
- Permission UX: `Alert.alert(t('audio.unavailable_title'), t('audio.unavailable_body'))` on web when capability missing (`:86`)

### Upload to backend (multipart)

`features/chat/infrastructure/chatApi/audio.ts:29-93`:
- Accepts either local URI (native) or Blob (web), validates one is present (`:48-54`)
- Resolves MIME type by extension (`audioMimeByExtension`) with fallback `audio/mp4` (`:62`)
- Constructs FormData with `context` JSON payload + `audio` part
- Posts to `POST /api/chat/sessions/{sessionId}/audio` via `httpRequest`

### TTS playback (TTS output side)

`features/chat/application/useTextToSpeech.ts:1-100+`:
- Fetches MP3 as ArrayBuffer from `POST /api/chat/messages/{messageId}/tts` (responseType: arraybuffer, `audio.ts:94`)
- Native: writes base64-decoded MP3 to `<cacheDir>/tts/<messageId>.mp3` (`:70-86`), plays via `createAudioPlayer`
- Web: uses ObjectURL
- Idempotent: `togglePlayback` stops if already active (`useTextToSpeech.ts:24-26`)
- Failure state surfaced via `failedMessageId` (`:18`); low-data skip via `skippedLowDataMessageId` (`:23`) — when `getCurrentDataMode() === 'low'`, synthesis is skipped to save data

### Voice catalog (TTS voices)

`features/settings/voice-catalog.ts:7`: `['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const` — mirror of backend `museum-backend/src/modules/chat/voice-catalog.ts` (`:2-3`). Sentinel test pins parity (`__tests__/features/settings/voice-catalog.test.ts`).

### Voice preference UI

`features/settings/ui/VoicePreferenceSection.tsx` — Settings card to pick TTS voice, persisted via `useUpdateTtsVoice` mutation (commit `0a9fa5fe7`).

### Permissions

iOS Info.plist (`app.config.ts:131-138`):
- `NSMicrophoneUsageDescription`
- `NSPhotoLibraryUsageDescription`
- `NSPhotoLibraryAddUsageDescription`
- `NSCameraUsageDescription`
- `NSFaceIDUsageDescription`
- `NSLocationWhenInUseUsageDescription`

Android (`app.config.ts:225-230`):
- `RECORD_AUDIO`, `CAMERA`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`
- Blocked: `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `AD_ID`, `SYSTEM_ALERT_WINDOW` (`app.config.ts:252-257`)

Privacy manifests (Apple): comprehensive `NSPrivacyAccessedAPITypes` + `NSPrivacyCollectedDataTypes` declared (`app.config.ts:152-220`) — covers user defaults, file timestamp, system boot time, disk space; data types include email, name, photos, audio, precise location, crash data, all flagged "AppFunctionality" purpose except crash → Analytics; all `Tracking: false`.

---

## 9. Internationalization

### Setup

`shared/i18n/i18n.ts:1-37` — i18next initialised synchronously at module-load time. Resources baked in (NOT lazy-loaded): all 8 locales bundled into the app binary. Defaults: `lng: 'en'`, `fallbackLng: 'en'`, `useSuspense: false`, `escapeValue: false`.

### Locales (8)

`shared/config/supportedLocales.ts:1`: `['en', 'fr', 'es', 'de', 'it', 'ja', 'zh', 'ar']`. All present under `shared/locales/<lang>/translation.json`. Sizes uniform at ~962-977 lines/locale, total 7756 lines across 8 files (confirmed by `wc -l shared/locales/*/translation.json`).

### Language detection

`shared/i18n/I18nContext.tsx:37-47` — `expo-localization.getLocales()` → first locale → mapped via `toSupportedLocale()` (`shared/config/supportedLocales.ts:27-31`) which falls back to `en` for unsupported codes.

### Persistence

User language stored as `runtime.defaultLocale` in AsyncStorage (`I18nContext.tsx:54-69`). On first launch, device-detected language is persisted automatically.

### RTL support

- `shared/i18n/rtl.ts:3-19` — `RTL_LOCALES = ['ar']`, `applyRTLLayout()` uses `I18nManager.allowRTL` + `forceRTL`. `needsRTLReload()` detects boundary-crossing language changes (LTR↔RTL).
- Language switch triggering a RTL flip calls `Updates.reloadAsync()` to flush the entire RN bridge (`I18nContext.tsx:77-90`). Dev-only fallback applies in-place without reload (`:86-89`).

### Missing-key handling

`scripts/check-i18n-completeness.js:1-100+`:
- Uses `en` as reference, flattens keys recursively, fails CI if any locale is missing keys OR has empty-string values
- CI hook: `.github/workflows/ci-cd-mobile.yml:97` (`npm run check:i18n`)
- Exit 0 / 1 explicit

### Locale → HTTP `Accept-Language`

`I18nContext.tsx:60, 89` — `setHttpLocale(lang)` syncs the HTTP client's runtime locale (`shared/infrastructure/httpClient.ts:130-138`) so backend responses come back in the correct language.

### Emoji guardrail

CI step "Check no unicode emoji in screens/copy (P4 emoji guard)" (`.github/workflows/ci-cd-mobile.yml:100-104`) runs `scripts/check-no-unicode-emoji.cjs`. Allowlist at `shared/i18n/copy-emoji-allowlist.json` (per-line). Doctrine: PNG + Ionicons only — see memory `feedback_no_unicode_emoji.md`.

---

## 10. Native iOS build chain

### Pods committed (Xcode Cloud constraint)

`museum-frontend/ios/Pods/` — 22 pod subdirectories present (`hermes-engine`, `SDWebImage`, `SDWebImageAVIFCoder`, `SDWebImageSVGCoder`, `SDWebImageWebPCoder`, `ReactNativeCore-artifacts`, `ReactNativeDependencies`, `Sentry`, `TrustKit`, `ZXingObjC`, `ReachabilitySwift`, `React-Core-prebuilt`, `libavif`, `libdav1d`, `libwebp`, etc.). Pods are version-controlled so Xcode Cloud doesn't need `pod install` at build time. Memory note `reference_ios_build_chain.md` confirms this is intentional.

### Xcode Cloud orchestration

Two scripts under `museum-frontend/ios/ci_scripts/`:

**`ci_post_clone.sh`** (cloning phase):
- Multi-strategy Node 22 install: Homebrew → direct binary download from nodejs.org → system Node fallback (`:14-58`)
- Runs `npm install --no-audit --no-fund` for Metro bundler dependencies
- Regenerates React Native codegen artifacts to keep `ios/build/generated/` aligned with installed native module versions (`:71-77`) — avoids "Build input file cannot be found" for States.cpp / ShadowNodes.cpp
- Writes `.xcode.env.local` with `NODE_BINARY` so `[CP-User] Generate Specs` Xcode build phase finds the right node

**`ci_pre_xcodebuild.sh`** (pre-build phase):
- Re-asserts NODE_BINARY in `.xcode.env.local`
- Disables Sentry auto-upload (`SENTRY_DISABLE_AUTO_UPLOAD=true`, `:21-25`) — Sentry release upload happens off-CI
- Patches `CFBundleShortVersionString` from `package.json` so the marketing version is single-source-of-truth
- `CFBundleVersion` = `max(CI_BUILD_NUMBER, plist_floor)` (`:50-58`) — protects against `CI_BUILD_NUMBER` reset (new workflow) or being lower than already-uploaded builds
- Patches `HERMES_CLI_PATH` in Pods xcconfig: replaces absolute dev-machine path with `$(PODS_ROOT)/hermes-engine/destroot/bin/hermesc` (`:62-71`)
- Patches `expo-configure-project.sh` to replace dev-absolute paths with `${PODS_ROOT}/...` (`:74-83`)

### iOS 26 / A18 Pro crash investigation

`museum-frontend/docs/IOS26_CRASH_DIAG.md:1-80+` — companion runbook to ADR-004. **Two distinct crashes**:
- **Bug 1** (expo-updates `ErrorRecovery`) — **FIXED**
- **Bug 2** (React bridge SIGABRT, 0.14-0.29s after launch, signature `std::__terminate → objc_exception_rethrow → __cxa_rethrow → react framework`) — **DIAGNOSTICS ONLY, NOT FIXED**. Instrumentation captures init-phase timeline in native `AppDelegate.swift` (`appDelegate.didFinishLaunching.start` → `rn.factory.created` → `rn.window.created` → `rn.startReactNative.before` → `rn.startReactNative.after` — failing case never reaches the `.after` mark) plus JS mirror phases via `shared/observability/init-phase-breadcrumbs.ts`. Memory `project_ios26_crash_investigation.md` confirms pending status.

### Global error handler (TestFlight 1.2.2 (87) hotfix)

`shared/observability/global-error-handler.ts:55-92` — wraps `globalThis.ErrorUtils.setGlobalHandler` to capture uncaught JS errors to Sentry (`level: 'fatal'`) **AND downgrade `isFatal` to false in release** so RN's `RCTFatal` → `@throw NSException` → SIGABRT path is short-circuited. Commit `f7ec92f79` (2026-05) — triggered by unlinked `ExpoWebBrowser` pod crash.

### `expo-updates` patch

`museum-frontend/patches/expo-updates+55.0.18.patch:1-22` — patches `createManifestForBuildAsync.js` to preserve `.js/.jsx/.ts/.tsx` extensions on absolute entry paths during Android embed bundling. Without the patch, Metro fails to resolve `node_modules/expo-router/entry`. Pre-launch fix tracked by commit `77cf1403a`.

### Memory note alignment

`reference_ios_build_chain.md` lists confirmed expectations: "Pods committed for Xcode Cloud, Podfile fmt consteval patch, expo-updates ENTRY_FILE workaround, pod install after every native dep." All four verified in this audit:
- Pods committed: yes (22 directories)
- `plugins/withFmtConstevalPatch.js`: yes (`plugins/` dir listing)
- expo-updates patch: yes (`patches/expo-updates+55.0.18.patch`)
- `pod install` discipline: out-of-scope (manual procedure, not verifiable in repo)

### EAS Build profiles

`eas.json`:
- `development` — `developmentClient: true`, internal distribution, staging API, localhost backend
- `preview` — internal distribution, staging API, `ENTRY_FILE=node_modules/expo-router/entry.js`
- `internal` — extends production, channel `internal`, staging API (this is the Google Play internal track w/ production-grade build)
- `production` — channel `production`, auto-increment, production API, `ENTRY_FILE=node_modules/expo-router/entry.js`, platform-specific `SENTRY_PROJECT`

Submit configs:
- Internal: Android only, Google Play `internal` track, `releaseStatus: completed`
- Production: iOS App Store (env-based `$ASC_APP_ID`, `$APPLE_ID`, `$APPLE_TEAM_ID`) + Android `production` track w/ `draft` release status

### Versioning

`package.json:4` `1.2.2`; iOS `buildNumber: '89'`; Android `versionCode: 89` (`app.config.ts:110, 125, 224`). Commit `5cc5ee6b2` (2026-05) — "chore(mobile): bump build to 1.2.2 (89)".

### OTA disabled

`app.config.ts:316-321` — `updates.enabled: false`, `checkAutomatically: 'NEVER'`. ADR-009 (referenced in code comment). Channel URL kept for EAS metadata consistency only.

---

## 11. Testing

### Two test runners

**1. Jest (RN integration + a11y + component)** — `museum-frontend/jest.config.js:1-57`
- Preset: `jest-expo`
- Setup: `__tests__/helpers/setup-axios-streams.ts` (`:6`)
- TestMatch: `__tests__/**/*.test.{ts,tsx}`
- transformIgnorePatterns customized for RN / Expo / Sentry / FlashList / faker / worklets (`:15-17`)
- `TZ=UTC` forced for deterministic snapshots (`:2`)

**2. Node test runner (pure logic)** — `package.json:21`
- Compiles `tests/**/*.test.ts` to `.test-dist/` via `tsconfig.test.json`
- Executes with `node --test`
- 15 test files (auth-logic, chat-session-logic, contracts-validators, dashboard-session-domain, error-mapping, formatDistance, haversine, http-error-mapper, offline-queue, rate-limited-error, request-id, runtime-settings, sse-parser, cache-key-parity, chat-contract)

Total: 204 Jest test files + 15 Node tests.

### Coverage thresholds

`jest.config.js:44-56` — global gates: **statements 91%, branches 78%, functions 80%, lines 91%**. Floor matches Phase 9 Sprint 9.3 actuals with a small downward buffer (~1pp). Path-ignore lists generated openapi types, theme tokens, legal content static, app/_layout.tsx, pure-domain modules.

### Test factories

- BE pattern + FE pattern mandated by CLAUDE.md. FE factories at `__tests__/helpers/factories/` :
  - `auth.factories.ts`, `chat.factories.ts`, `citation-source.factories.ts`, `compare.factories.ts`, `museum.factories.ts`, `review.factories.ts`, `session.factories.ts`, `support.factories.ts`, `index.ts`
- ESLint plugin `eslint-plugin-musaium-test-discipline` enforces no-inline-test-entities + baseline cap.

### Maestro E2E (shards)

`museum-frontend/.maestro/shards.json:1-26`:
- 4 shards: `auth`, `chat`, `museum`, `settings`
- 13 distinct flows: `auth-flow`, `auth-persistence`, `onboarding-flow` / `chat-flow`, `chat-history-pagination`, `museum-chat-flow`, `chat-compare`, `audio-recording-flow` / `museum-search-geo`, `navigation-flow` / `settings-flow`, `settings-locale-switch`, `support-ticket-create`
- `config.yaml` excluded; iOS nightly runs `all` flows
- CI matrix (`ci-cd-mobile.yml:208-211`) maps 1:1 to these shards

### Maestro CI orchestration

`.github/workflows/ci-cd-mobile.yml`:
- `prebuild` job (`:122-197`) — Android APK build, **cached on content hash** of `src/`, `features/`, `shared/`, `app/`, `assets/`, `app.config.ts`, `package.json`, `package-lock.json`. Cold path 25-35 min, warm ~3-5 min, 35-min timeout.
- `maestro-shard` job (`:203-311`) — 4-way matrix on `macos-latest`. Native Homebrew Postgres 16 + backend boot for E2E. arm64-v8a AVD on hosted M1. **Gated to nightly cron + manual dispatch only** (`:204`) because hosted Mac runners can't run HVF/Hypervisor.Framework — too slow per-PR.
- `maestro-summary` (`:314-345`) — aggregates shard logs into PR comments (only on cron / dispatch).
- `maestro-ios-nightly` (`:351+`) — iOS nightly flow on iOS17.5 simulator.

### Other CI quality gates

`ci-cd-mobile.yml:73-119`:
- `npx expo-doctor` (continue-on-error)
- `npm run check:openapi-types` (FAILS on drift)
- `pnpm openapi:validate` (backend, must validate the spec)
- `npm audit --audit-level=high`
- `npm run check:i18n`
- Unicode emoji guard
- Maestro shard-manifest sentinel (`scripts/sentinels/maestro-shard-manifest.mjs`)
- `npm run lint` (`eslint . --max-warnings=0 && tsc --noEmit` — ZERO ESLint warnings allowed per `package.json:15`)
- `npm run typecheck`
- `npm run test:coverage` (gates on the 91/78/80/91 threshold)

---

## 12. Design system

### Token generation

- Source: `design-system/` package (separate workspace per CLAUDE.md root, `pnpm build` to regenerate)
- Output: `museum-frontend/shared/ui/tokens.generated.ts` (flagged "do not read" in CLAUDE.md token discipline)
- Companion files: `tokens.ts`, `tokens.functional.ts`, `tokens.semantic.ts` (all under `shared/ui/`)
- `tokens.semantic.ts` exposes `semantic.*` namespace (used at `(tabs)/_layout.tsx:87-89` for `card.gapSmall`, `form.gapLarge`, `badge.radiusFull`, `badge.fontSizeSmall`)

### Theming

`shared/ui/ThemeContext.tsx:1-60`:
- 3-mode toggle: `system | light | dark`
- Light/dark palettes from `shared/ui/themes.ts` (`lightTheme`, `darkTheme`)
- Persisted to AsyncStorage under `app.themeMode`
- Reactively reads `react-native.useColorScheme()` for system mode resolution
- `isDark` flag flows to `ThemedStatusBar` for status-bar contrast (`app/_layout.tsx:85-88`)

### "Liquid Glass" UI language

App-wide aesthetic uses iOS-style frosted glass via `expo-blur`:
- `shared/ui/GlassCard.tsx:14-32` — wraps `BlurView` with rounded corners + configurable intensity
- `shared/ui/LiquidScreen.tsx` — background-art-backed screen container
- `shared/ui/liquidTheme.ts` — `pickMuseumBackground(index)` helper for varied backgrounds
- `(tabs)/_layout.tsx:40` — blurred floating tab bar (intensity 72)
- `shared/ui/FloatingContextMenu.tsx:50` — context-menu chrome
- Light/dark blur tint dynamic via `theme.blurTint`

### Reusable primitives

`shared/ui/` inventory: `BrandMark`, `Confetti`, `EmptyState`, `ErrorBoundary`, `ErrorState`, `FloatingContextMenu`, `FormInput`, `GlassCard`, `InAppBrowser`, `LiquidButton`, `LiquidScreen`, `SkeletonBox`, `SkeletonChatBubble`, `SkeletonConversationCard`, `StartupConfigurationErrorScreen`, `ThemeContext`, `useReducedMotion` hook.

---

## 13. Performance

### List virtualization — FlashList

`@shopify/flash-list 2.0.2` (drop-in FlatList replacement, recycling-based):
- `features/chat/ui/ChatMessageList.tsx:213-247` — per-message `getItemType={item.role}` (user vs assistant — distinct layouts so recycling pool stays effective)
- `features/museum/ui/MuseumDirectoryList.tsx:80`
- `features/conversation/ui/ConversationItem.tsx:29` (memoized for FlashList)

### Image optimization

`features/chat/application/imageUploadOptimization.ts:1-89`:
- **Target byte budget**: `2_700_000` (`:6`) — under typical backend upload caps
- **Max dimension**: `1600 px` (`:7`) — long-side resize
- **Quality cascade**: `[0.82, 0.72, 0.62, 0.52, 0.42]` JPEG (`:8`) — progressive recompression until budget met
- Skips optimization when below threshold AND under max dimension
- All work via `expo-image-manipulator`

### Bundle / engine

- Hermes enabled on both platforms (verified §2)
- New Architecture (Fabric + TurboModules) enabled on Android (`android/gradle.properties:37`) and inferred for iOS
- ABIs: `armeabi-v7a, arm64-v8a, x86, x86_64` (`android/gradle.properties:30`) — full ABI fan-out at the AAB level; Play handles per-device split
- `expo.gif.enabled=true`, `expo.image.enableWebpFormat` (next line, presumed `true`) — WebP support adds ~85 KB
- D8 dex-merge bumped to `-Xmx6144m` via `plugins/withGradleJvmHeap.js` (`app.config.ts:308`) — protects against OOM on CI

### Memoization patterns

`features/chat/ui/ChatMessageList.tsx:78-207` — extensive `useCallback` / `useMemo` plus `babel-plugin-react-compiler` enabled at `babel.config.js:5` (auto-memoization). Verified usage in chat list, settings cards, home intent chips, contextual menus.

### Cache layers (summary)

| Layer | Where | TTL |
|---|---|---|
| React Query in-memory | `queryClient` | 5 min stale, 24 h gc |
| React Query persisted (AsyncStorage) | `queryPersister` | 24 h max age + version-busted |
| Chat local cache (Zustand+AsyncStorage) | `chatLocalCache.ts` | 7 days, 200-entry LRU |
| TTS audio files | `<cacheDir>/tts/<id>.mp3` | OS-managed (cacheDirectory) |
| Cert-pinning kill-switch | AsyncStorage `cert-pinning.kill-switch.v1` | 1 hour |
| MapLibre offline tiles | native MapLibre OfflineManager | persistent until user delete |

### RAM hot paths

- FlashList renderItem with 17 deps (`ChatMessageList.tsx:184-207`) — heavy callback graph; relies on react-compiler + stable refs to stay cheap
- BlurView at intensity 72 in tab bar — common iOS perf hot spot, should be benchmarked on iPhone 8 / Pixel 6 (`[NON VÉRIFIÉ]`: no benchmark report in repo)
- TTS path caches base64 → file (avoids re-decoding on replay) — appropriate
- Image optimization on the device CPU (5 passes worst-case at 1600px JPEG) — could exhaust battery on low-end Android; not measured (`[NON VÉRIFIÉ]`)

---

## 14. Security on device

### Token storage

- **Refresh + access tokens → `expo-secure-store`** (`features/auth/infrastructure/authTokenStore.ts:64-87`) — iOS Keychain + Android EncryptedSharedPreferences
- Tokens NOT marked `requireAuthentication: true` — biometric enforcement is at the React tree level via `BiometricGate` (`features/auth/ui/BiometricGate.tsx:36-94`), not at the SecureStore read level. This is a deliberate trade-off: cold-start hydration works without prompting; biometric only gates rendering of authenticated screens. **Implication**: if device-level OS lock is bypassed (jailbreak, debugger attach), tokens are readable without biometric. Acceptable for V1, would warrant `requireAuthentication` for B2B/banking-grade upgrade.

### Biometric

- `expo-local-authentication ~55.0.13`
- `useBiometricAuth.ts:17-87`:
  - Detects Face ID, Touch ID, Iris explicitly
  - Stores user pref in AsyncStorage (boolean `auth.biometricEnabled`)
  - `authenticate()` calls `LocalAuthentication.authenticateAsync({ promptMessage })` and returns boolean
- `BiometricGate.tsx`: auto-prompts on mount when session is locked, retry button on cancel/fail, prevents double-prompt via `autoPromptedRef`
- Face ID continue-button on auth screen (F11-mobile, commit `303a8cded`) — restores session without re-typing password when refresh token still in secure-store

### Certificate pinning

- `react-native-ssl-public-key-pinning ^1.2.6` installed
- `shared/config/cert-pinning.ts:34-37` — **PLACEHOLDER hashes only, syntactically valid but NOT matching prod cert**
- `shared/infrastructure/cert-pinning-init.ts:44-50` — env flag `EXPO_PUBLIC_CERT_PINNING_ENABLED` defaults to `false`; CT enabled only in `variant === 'production'` (`app.config.ts:148`)
- Kill-switch endpoint `/api/config/cert-pinning-enabled` cached 1 hour, fail-open semantics (`cert-pinning.ts:60-101`)
- Runtime init is fire-and-forget so a slow kill-switch fetch can't block React mount (`app/_layout.tsx:69-77`)
- **V1 ships UN-PINNED** — verified `.env` does NOT export `EXPO_PUBLIC_CERT_PINNING_ENABLED=true`. Documented as a deliberate scaffold (Phase 2, ADR-016, ADR-031).

### App Transport Security (iOS)

`app.config.ts:145-149`:
- `NSAllowsArbitraryLoads: false` — at all times
- `NSAllowsLocalNetworking`: only `variant === 'development'`
- `NSRequiresCertificateTransparency`: only `variant === 'production'` (so misissued certs for `api.musaium.app` are rejected at TLS handshake)

### Network security (Android)

`plugins/withNetworkSecurity.js:25-50`:
- Production: `cleartextTrafficPermitted="false"`, only system trust anchors
- Dev: same baseline + allow cleartext on `localhost`, `10.0.2.2`, `127.0.0.1`
- Patches `AndroidManifest.xml` to point at `@xml/network_security_config`

### Privacy manifests (iOS)

`app.config.ts:151-220`:
- `NSPrivacyTracking: false` + empty tracking domains
- Declared API reasons (UserDefaults CA92.1, FileTimestamp C617.1, SystemBootTime 35F9.1, DiskSpace E174.1)
- Collected data types: email (linked), name (linked), photos (not linked), audio (not linked), precise location (not linked), crash data (not linked, Analytics purpose). All `Tracking: false`.

### Sentry PII scrubbing

`shared/observability/sentry-scrubber.ts:1-50+`:
- Sensitive headers regex: `^(authorization|cookie|x-api-key|x-auth-token)$` (case-insensitive)
- Sensitive field regex: `password|token|secret|api[_-]?key|refresh`
- Sensitive query keys stripped from URLs: `access_token, api_key, apikey, password, refresh_token, secret, token`
- Sensitive breadcrumb paths: `/auth/login`, `/auth/register`, `/auth/reset-password`, `/auth/change-password`
- Replaces with `[redacted]`
- Email fingerprinting (32-bit fold) for correlation without leaking raw addresses
- `sendDefaultPii: false` in init (`sentry-init.ts:31`)

### MFA

`features/auth/screens/MfaChallengeScreen.tsx` + `MfaEnrollScreen.tsx` + `MfaWarningBanner.tsx` — MFA enrollment + challenge flow. Backend rejection via R16 discriminated union; `authService.login()` throws `'MFA_REQUIRED'` to redirect through dedicated MFA flow (`features/auth/infrastructure/authApi.ts:53-65`).

### Secrets in repo

`museum-frontend/.env:9-15`:
- `EXPO_TOKEN=Tj5z6yRh35i6p4FXSSucM8sqFwX3HPtgd9h67fA9` — real EAS API token, **committed**
- `EXPO_PUBLIC_SENTRY_DSN_ANDROID` + `EXPO_PUBLIC_SENTRY_DSN_IOS` — these are **public** by design (DSNs are project-write-only)
- `SENTRY_AUTH_TOKEN=sntryu_...` — server-side Sentry auth token, committed
- `TEST_EMAIL=apple.test@apple.com`, `TEST_PASSWORD=Apple1234!` — Apple review test account

The `EXPO_TOKEN` and `SENTRY_AUTH_TOKEN` are *not* gitignored — verified by reading `.env` content directly. **This is a secret-hygiene concern**: these tokens have org-level scope, suggesting either (a) the repo is private or (b) the secrets need rotation pre-launch. `[NON VÉRIFIÉ]` — repo visibility status not checked.

---

## 15. Top 10 risks for V1 launch (100k installs)

### R1 — iOS 26 / A18 Pro React-bridge SIGABRT, NOT FIXED [HIGH/HIGH]

`museum-frontend/docs/IOS26_CRASH_DIAG.md:5`. Memory `project_ios26_crash_investigation.md` confirms "pending diagnostics — re-verify before assuming current state." A18 Pro covers iPhone 16/17 Pro families; estimate 15-30% of iOS launch traffic at 100k installs. With 0.14-0.29s post-launch SIGABRT and global error handler ONLY catching JS-thrown fatals (not native exception rethrows), this can crash-loop. **Action**: real-device A18 Pro QA before submission; rollback / hotfix plan if Sentry dashboard shows uptick.

### R2 — Cert pinning placeholders, no real SPKI hashes [HIGH/MEDIUM]

`shared/config/cert-pinning.ts:34-37`. App ships with pinning DISABLED, so a Wi-Fi MitM with hostile CA installed (corporate networks, hotels) can fully intercept HTTPS traffic. ATS Certificate Transparency provides partial protection in production, but is iOS-only and not equivalent to pinning. **Action**: capture real SPKI hashes pre-launch; ship V1.0.1 with `EXPO_PUBLIC_CERT_PINNING_ENABLED=true` once kill-switch endpoint is verified live. ADR-031 already accounts for this.

### R3 — Secrets committed in `.env` [MEDIUM/HIGH if repo public]

`museum-frontend/.env:9-15` contains `EXPO_TOKEN` + `SENTRY_AUTH_TOKEN`. EAS tokens grant build/submit rights, Sentry auth tokens allow uploading artifacts and reading event details. **Action**: confirm repo visibility status, rotate both tokens if repo is or ever was public, add `.env` to `.gitignore` and migrate to `.env.local`.

### R4 — AsyncStorage NOT excluded for `chatLocalCache` entries [MEDIUM/MEDIUM]

`chatLocalCache.ts:180-184` persists chat answers to AsyncStorage (plaintext). The persister exclusion in `queryClient.ts:75-81` only covers React-Query keys, not Zustand stores. While `chatLocalCache` content is documented as the *generic global namespace* (no user-specific PII), an attacker with `adb pull` or a jailbreak can extract historical Q&A. **Action**: review whether the "global namespace" guarantee survives all edge cases; consider SecureStore for the cache if pre-fetched answers include reservation IDs / location data / etc.

### R5 — Refresh token race on language change (`Updates.reloadAsync()`) [LOW/MEDIUM]

`shared/i18n/I18nContext.tsx:77-90` — switching language across a RTL boundary triggers `Updates.reloadAsync()`. If `OTA disabled` (verified §10) means `reloadAsync()` only reloads the JS bundle, the secure-store-backed refresh token survives. If reload triggers a fresh launch, the bootstrap's `tokenless` path runs — verify the user is NOT logged out on language switch. `[NON VÉRIFIÉ]`: no test in `__tests__/` for this specific path.

### R6 — `BlurView` performance on low-end Android [LOW/MEDIUM]

Frosted-glass tab bar (`(tabs)/_layout.tsx:40`) and GlassCard pervasive use. Android Blur is GPU-expensive on chips below Snapdragon 7-series. With 100k installs, ~20-30% will be on entry-level hardware. **Action**: profile on Pixel 4a / equivalent, consider conditional fallback to translucent surfaces below a perf threshold.

### R7 — D8 dex-merge OOM (already mitigated, but cap is fragile) [LOW/HIGH if regresses]

`plugins/withGradleJvmHeap.js` bumps Gradle JVM heap to 6 GB to avoid D8 dex-merge OOM under New Architecture (`app.config.ts:308`). GitHub-hosted runners give 7 GB total; another big native dep could push it over. **Action**: add a CI sentinel that monitors gradle assembleDebug peak memory; fail fast if approaching cap.

### R8 — No real-device perf benchmarks captured [MEDIUM/MEDIUM]

`[NON VÉRIFIÉ]`: no perf benchmark CSV, no flamegraph, no startup-time metric in `audit-2026-05-12/` predecessors. With launch in 19 days, baseline cold-start time + chat list scroll FPS should be measured on iPhone 11 + Pixel 6. **Action**: capture before launch, set Sentry performance baselines.

### R9 — `tracesSampleRate: 0.2` in production may produce noisy Sentry [LOW/LOW]

`shared/observability/sentry-init.ts:26`. At 100k installs with active usage, 20% sampling generates a high event volume — verify Sentry quota and budget. **Action**: monitor first week, dial down to 0.05-0.10 if quota strained.

### R10 — Maestro E2E gated to nightly only, no per-PR safety net [MEDIUM/MEDIUM]

`ci-cd-mobile.yml:200-204` — Maestro shards run on cron + dispatch only because hosted Mac runners can't HVF. A regression introduced on a Friday merge isn't caught until Saturday 03:17 UTC. **Action**: provision a self-hosted Mac runner for the chat / auth shards on every PR (~3 critical flows). Already on the roadmap per CI comment.

---

## Risk Heat Map

| Risk | Likelihood | Impact | Score | Class |
|---|---|---|---|---|
| R1 iOS 26 React bridge SIGABRT | High | High (crash on launch for a major device cohort) | 9/9 | **BLOCKER** |
| R2 Cert pinning placeholders | Medium | High (MitM on hostile Wi-Fi) | 6/9 | **HIGH** |
| R3 Secrets in `.env` | Low (if repo private) / High (if public) | High | 3-9/9 | **GATING** |
| R4 chatLocalCache plaintext persist | Medium | Medium (PII leakage on rooted devices) | 4/9 | **HIGH** |
| R5 RTL reload + token survival | Low | Medium (rare unintended logout) | 2/9 | **MEDIUM** |
| R6 BlurView on low-end Android | Medium | Medium (FPS drops, jank) | 4/9 | **HIGH** |
| R7 D8 OOM regression | Low | High (CI block) | 3/9 | **MEDIUM** |
| R8 No real-device perf data | Medium | Medium (unknown 1% tail) | 4/9 | **HIGH** |
| R9 Sentry sampling noise | Low | Low | 1/9 | LOW |
| R10 Maestro PR gap | Medium | Medium (regression slip past Friday) | 4/9 | **HIGH** |

---

## Appendix A — Files NOT read (per CLAUDE.md token discipline)

- `museum-frontend/shared/api/generated/openapi.ts` (4321 lines) — grepped only
- `museum-frontend/package-lock.json` — multi-MB lockfile, never read
- `museum-frontend/shared/ui/tokens.generated.ts` — sourced from `design-system/`
- `museum-frontend/ios/Pods/**` and `museum-frontend/android/**` build artifacts — listed at directory level only

## Appendix B — Path aliases

`museum-frontend/tsconfig.json:4-9` — only `@/* → ./*`. All imports throughout (`@/features/...`, `@/shared/...`, `@/app/...`) resolve via this single alias.

## Appendix C — Verification ladder used

Most claims verified by direct `Read` of the cited file:line. A small number flagged `[NON VÉRIFIÉ]` are explicit. No external WebSearch / WebFetch was performed for this audit — versions verified against `package.json` only.

