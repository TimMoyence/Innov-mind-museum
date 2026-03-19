# MUSAIUM — Progress Tracker

> Source de verite pour l'avancement du projet. Derive de [MASTER_ROADMAP_V2.md](MASTER_ROADMAP_V2.md).
> Mis a jour manuellement a chaque sprint. Chaque case cochee renvoie au sprint log correspondant.

**Legende**: `[x]` = termine | `[~]` = partiel | `[ ]` = a faire | `[-]` = annule/reporte

---

## Pre-Sprint — Audit de code initial

- [x] Analyse complete du codebase (13 rapports dans `docs/fullcodebase-analyse/`)
- [x] Redaction MASTER_ROADMAP_V2.md (roadmap produit + tech)

---

## Sprint 1 — Stabilisation (TERMINE)

> 37 taches, 53 fichiers modifies, 19 nouveaux, -1499 lignes, 212+8 tests green.
> Detail: voir git log commits `a808ebf` a `58b376a`.

### Backend

- [x] Password policy (`shared/validation/password.ts`)
- [x] Login rate limiter (`login-rate-limiter.ts`)
- [x] Social login email verification check
- [x] SSRF protection image URLs (17 regex patterns)
- [x] Reset token SHA-256 hashing
- [x] Session version column migration
- [x] Refresh token indexes migration
- [x] Social accounts + nullable password migration
- [x] Dead code cleanup (`password.service.ts`, old component tests)
- [x] Chat module refactoring (hooks extraction, image helpers, session access)
- [x] Email service setup (Brevo adapter in `shared/email/`)
- [x] Input validation module (`shared/validation/`)
- [x] Unit tests: 212 passing (auth, chat, contracts, integration)

### Frontend

- [x] Chat screen refactoring (~250 lignes, hooks extraits)
- [x] ChatInput, ChatMessageBubble, ChatMessageList, MessageActions components
- [x] useAudioRecorder, useImagePicker hooks
- [x] useChatSession hook refactoring
- [x] Auth flow: social login, settings, conversations
- [x] Dead code cleanup (styles/, old components/)
- [x] ErrorNotice component
- [x] Unit tests: 8 passing (contracts, error mapping, dashboard mapper)

---

## Sprint 1.5 — Remediation Post-Audit (TERMINE)

> 5 bugs trouves par audit adversarial (3 agents paralleles). 1 corrige pendant audit (rate limiter timer).
> Detail: voir [SPRINT_LOG.md](SPRINT_LOG.md#sprint-15--remediation-post-audit-2026-03-19)

### Item 1 — S3 `deleteByPrefix` (RGPD) `HIGH`

- [x] Refactoring `httpPut` → `httpRequest` generique (GET/POST/PUT)
- [x] `buildS3SignedHeaders` — signature SigV4 generique
- [x] `listObjectsByPrefix` — GET ListObjectsV2 avec pagination
- [x] `deleteObjectsBatch` — POST DeleteObjects avec Content-MD5
- [x] `S3CompatibleImageStorage.deleteByPrefix` — implementation complete (list + filter + delete)
- [x] `deleteAccount.useCase.ts` — pattern simplifie (`user-${userId}` au lieu de glob)
- [x] `LocalImageStorage.deleteByPrefix` — JSDoc clarifie (no-op intentionnel)
- [x] Tests: 5 nouveaux (XML parsing, truncation, delete body, empty keys, integration)

### Item 2 — Email case-sensitivity `HIGH`

- [x] `authSession.service.ts` — `email.trim().toLowerCase()` dans login
- [x] `forgotPassword.useCase.ts` — normalisation + early return si vide
- [x] `socialLogin.useCase.ts` — `normalizedEmail` pour lookup, linking, creation
- [x] Migration `1774100000000-NormalizeEmailCase.ts` — UPDATE + index LOWER(email)

### Item 3 — DNS rebinding documentation `MEDIUM`

- [x] JSDoc sur `isSafeImageUrl` — risque accepte documente (URL jamais fetchee server-side)

### Item 4 — Frontend `useCallback` stabilisation `MEDIUM`

- [x] `useAudioRecorder.ts` — refs synces + useCallback sur startRecording, stopRecording, toggleRecording, playRecordedAudio
- [x] `useImagePicker.ts` — useCallback sur onPickImage, onTakePicture

### Item 5 — Frontend tests `P2`

- [x] Extraction `runtimeSettings.pure.ts` (logique pure sans deps AsyncStorage)
- [x] `tests/runtime-settings.test.ts` — 3 tests (defaults, normalizeGuideLevel)
- [x] Nettoyage variable morte `suffix` dans `chatApi.ts`
- [x] `tsconfig.test.json` mis a jour

### Verification

- [x] Backend: 217 tests passing, 24 suites green
- [x] Frontend: 11 tests passing (8 → 11)
- [x] Typecheck backend: OK
- [x] Typecheck frontend: OK

---

## Sprint 2 — Foundation "Make it Shippable" (Weeks 1-3, 3 FTE)

> Objectif: Store review OK, GDPR compliant, streaming chat, i18n EN+FR, securite renforcee.

### Store Blockers (P0)

- [x] S2-01: Fix iOS permissions (photosPermission string, android CAMERA)
- [~] S2-02: Fix support page (placeholders removed, Telegram confirmed, Instagram handle pending)
- [x] S2-03: Creer PrivacyInfo.xcprivacy (via Expo privacyManifests config)

### Streaming (P0)

- [x] S2-04: SSE streaming endpoint backend (POST /sessions/:id/messages/stream)
- [x] S2-05: Frontend SSE streaming integration (fetch + ReadableStream + throttled renders)

### i18n (P0)

- [x] S2-06: Setup react-i18next + expo-localization + extraction strings EN+FR (~296 keys, 7 langues)

### Accessibility (P0)

- [ ] S2-07: accessibilityLabel/Role/Hint sur TOUS les composants interactifs (14 ecrans)

### Infrastructure (P0)

- [x] S2-08: Setup Redis (Docker + prod) — Redis 7-alpine in docker-compose, setNx on CacheService port, cacheService injection in createApp
- [ ] S2-10: Sentry backend + frontend
- [ ] S2-11: Uptime monitoring (BetterUptime)
- [ ] S2-12: Backup DB automatise

### Backend Security

- [x] S2-09: OpenAPI spec complete — 5 new endpoints (forgot-password, reset-password, change-password, verify-email, export-data), register 201 response schema, 20 paths / 22 operations
- [x] S2-13: Email verification in register flow — 3 new User columns, migration + partial index, VerifyEmailUseCase, RegisterUseCase sends verification email (non-blocking), social users auto-verified
- [x] S2-17: Cron cleanup expired tokens — TokenCleanupService with distributed lock via setNx, 6h scheduler in index.ts
- [x] S2-18: Endpoint change password — ChangePasswordUseCase (verify → validate → check same → update → revoke all), PUT /change-password, revokeAllForUser on RefreshTokenRepositoryPg
- [x] S2-20: Fixes securite (rate limit bypass, login oracle, report length, register response)
- [x] S2-21: Bcrypt cost 10 → 12 (extracted to shared/security/bcrypt.ts)
- [x] S2-22: Strip PII des JWT claims — UserJwtPayload reduced to {id}, GetProfileUseCase for DB lookup, /me + /export-data fixed, verifyAccessToken returns {id} only
- [x] S2-23: Hard-code includeDiagnostics=false en production

### Frontend

- [x] S2-14: GDPR consent checkbox register — checkbox + Terms/Privacy links, disables sign-up + social buttons when unchecked, login mode keeps legal text
- [ ] S2-15: FlatList performance (getItemLayout, memoized renderItem)
- [ ] S2-16: Consolider services/ → features/auth/infrastructure/
- [ ] S2-24: Propagation x-request-id depuis frontend

### DevOps

- [x] S2-19: npm audit dans CI (pnpm audit / npm audit --audit-level=critical, continue-on-error)
- [x] S2-25: Documenter EXPO_PUBLIC_EAS_PROJECT_ID (.env.example)

---

## Sprint 3 — Polish "Make it Delightful" (Weeks 4-6, 3 FTE)

> 17/17 tasks implemented + 3 deferred completed. 360 backend tests + 13 frontend tests green. 3 audits (27 fixes total).
> Blocked on S2: S3-13 (Sentry APM) — requires S2-10; S3-14 (+5 languages) — requires S2-06.

### Frontend

- [x] S3-01: Dark mode (ThemeContext + useTheme hook + light/dark palettes + full migration: 15 files migrated from liquidColors → useTheme)
- [x] S3-02: Offline support (ConnectivityProvider + OfflineQueue + useOfflineQueue + OfflineBanner + useChatSession integration)
- [x] S3-03: Onboarding carousel (swipeable FlatList + StepIndicator + OnboardingSlide + Reanimated animations + first-launch detection)
- [x] S3-05: Image preview + crop (ImagePreviewModal + useImageManipulation + pendingImage flow)
- [x] S3-06: Message context menu (MessageContextMenu bottom-sheet + useMessageActions: copy/share/report)
- [x] S3-07: Skeleton loading (SkeletonBox shimmer + SkeletonConversationCard + SkeletonChatBubble, replacing ActivityIndicator)
- [x] S3-08: Conversation search + infinite scroll (ConversationSearchBar + cursor pagination + onEndReached)
- [x] S3-14: +5 langues (ES, DE, IT, JA, ZH) — 296 keys x 7 langues, CI completeness check
- [x] S3-15: Haptic feedback (expo-haptics on 5 callsites: send, long-press, menu, capture, error)
- [x] S3-18a: ATTrackingManager (expo-tracking-transparency + iOS permission prompt + app.config.ts plugin)
- [x] S3-18b: Dashboard title museum name priority (deriveSessionTitle + dashboard-session.ts dedup fix + 5 new tests)

### Backend

- [x] S3-04: Voice mode TTS (OpenAI TTS service + POST /messages/:messageId/tts + synthesizeSpeech method + cache integration)
- [x] S3-09: Redis cache layer (CacheService port + Redis/Noop impls + ChatService options object refactor + session/list caching + invalidation on writes)
- [x] S3-10: Image prompt injection detection (OCR guard: OcrService port + TesseractOcrService + fail-open in postMessage + feature-flagged)
- [x] S3-11: GDPR data export (GET /api/auth/export-data + ChatDataExportPort lazy-binding + exportUserData method)
- [x] S3-16: B2B API key authentication (ApiKey entity + HMAC-SHA256 + timing-safe validation + dual auth middleware + CRUD endpoints + migration)

### DevOps

- [x] S3-12: Feature flags (StaticFeatureFlagService + env-var parsing + 3 flags: voice-mode, ocr-guard, api-keys)
- [ ] S3-13: APM setup (Sentry Performance) — blocked on S2-10 Sentry
- [x] S3-17: Log aggregation (structured fields: service, environment, version, hostname + userId in request logger + promtail config)

---

## Sprint 4 — Enterprise "Make it Scalable" (Weeks 7-12, 3 FTE)

### Admin Dashboard

- [ ] S4-01: Admin dashboard web (React + Vite + Tailwind) — MVP
- [ ] S4-02: RBAC (admin, moderator, museum_manager)
- [ ] S4-03: Content moderation queue
- [ ] S4-04: Analytics API + dashboard

### Backend

- [ ] S4-05: Multi-tenancy (B2B museum scoping)
- [ ] S4-07: Cross-session user memory
- [ ] S4-08: Audit logging (immutable trail)

### Frontend

- [ ] S4-06: Museum directory + geolocation
- [ ] S4-09: Arabic RTL support
- [ ] S4-10: Biometric authentication
- [ ] S4-11: In-app support / ticket system

### DevOps

- [ ] S4-12: CDN setup (CloudFlare)
- [ ] S4-13: OpenTelemetry distributed tracing
- [ ] S4-14: Load testing + horizontal scaling
- [ ] S4-15: E2E test suite comprehensive
- [ ] S4-16: Google Play Data Safety form

---

## Metriques globales

| Sprint    | Taches  | Faites | %       | Tests backend | Tests frontend |
| --------- | ------- | ------ | ------- | ------------- | -------------- |
| S1        | 37      | 37     | 100%    | 212           | 8              |
| S1.5      | 5       | 5      | 100%    | 217 (+5)      | 11 (+3)        |
| S2        | 25      | 18     | 72%     | 360 (+93)     | 22 (+9)        |
| S3        | 18      | 17     | 94%     | 360 (+93)     | 22             |
| S4        | 16      | 0      | 0%      | -             | -              |
| **Total** | **101** | **77** | **76%** | **360**       | **22**         |
