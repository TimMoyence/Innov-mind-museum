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
- [-] S2-02: Fix support page (reporte — handle Instagram pas encore cree) (placeholders removed, Telegram confirmed, Instagram handle pending)
- [x] S2-03: Creer PrivacyInfo.xcprivacy (via Expo privacyManifests config)

### Streaming (P0)

- [x] S2-04: SSE streaming endpoint backend (POST /sessions/:id/messages/stream)
- [x] S2-05: Frontend SSE streaming integration (fetch + ReadableStream + throttled renders)

### i18n (P0)

- [x] S2-06: Setup react-i18next + expo-localization + extraction strings EN+FR (~296 keys, 7 langues)

### Accessibility (P0)

- [x] S2-07: accessibilityLabel/Role/Hint sur TOUS les composants interactifs (14 ecrans, 22 fichiers, ~85 cles i18n x 7 langues)

### Infrastructure (P0)

- [x] S2-08: Setup Redis (Docker + prod) — Redis 7-alpine in docker-compose, setNx on CacheService port, cacheService injection in createApp
- [x] S2-10: Sentry backend (@sentry/node + observability module + error capture 5xx) + frontend (@sentry/react-native + Expo plugin + platform DSN) + CI source map upload
- [x] S2-11: Uptime monitoring (BetterUptime docs + health endpoint responseTimeMs + OpenAPI sync)
- [x] S2-12: Backup DB automatise (backup-db.sh pg_dump custom format, retention 7d+4w, restore docs, GDPR compliance)

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
- [x] S2-15: FlatList performance (useCallback renderItem, initialNumToRender, maxToRenderPerBatch, windowSize, React.memo OnboardingSlide)
- [x] S2-16: Consolider services/ → features/auth/infrastructure/ + shared/ (6 fichiers migres, 10 consumers maj, services/ supprime)
- [x] S2-24: Propagation x-request-id depuis frontend (Axios + SSE, AppError enrichi avec requestId backend)

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
- [x] S3-13: APM setup (Sentry Performance) — custom spans (LLM orchestrate/stream, audio transcribe, OCR, S3 upload), user identification (JWT + API key), frontend navigation instrumentation, distributed tracing (CORS + SSE trace headers)
- [x] S3-17: Log aggregation (structured fields: service, environment, version, hostname + userId in request logger + promtail config)

### Post-Sprint 3 Audit (2026-03-21)

- [x] S3-A1: Typed client alignment — migrate forgotPassword/resetPassword from httpRequest to openApiRequest + remove dead AUTH_ENDPOINTS/buildAuthUrl
- [x] S3-A2: i18n completeness — fix 3 hardcoded EN strings (useMessageActions, support.tsx) + 2 status strings + standardize backend FR→EN response
- [x] S3-A3: Dead code removal — remove deprecated persistArtworkMatch method (keep type) + clean unused artworkMatchRepo field
- [x] S3-A4: Rate limiters — add passwordResetLimiter (5/5min byIp) on /forgot-password and /reset-password
- [x] S3-A5: README update — fix stale architecture tree, paths, tech stack (Tailwind→Expo, GPT-4→Multi-provider)

> Audit results: 14 anomalies (0 CRITICAL, 0 HIGH, 7 MEDIUM, 7 LOW), 6 user-reported false positives corrected.

---

## Sprint 4 — Enterprise "Make it Scalable" (Weeks 7-12, 3 FTE)

### Admin Dashboard

- [x] S4-01: Admin dashboard web (React + Vite + Tailwind) — MVP
- [x] S4-02: RBAC (admin, moderator, museum_manager)
- [x] S4-03: Content moderation queue
- [x] S4-04: Analytics API + dashboard

### Backend

- [x] S4-05: Multi-tenancy (B2B museum scoping)
- [x] S4-07: Cross-session user memory
- [x] S4-08: Audit logging (immutable trail)

### Frontend

- [x] S4-06: Museum directory + geolocation
- [x] S4-09: Arabic RTL support
- [x] S4-10: Biometric authentication
- [x] S4-11: In-app support / ticket system

### DevOps

- [x] S4-12: CDN setup (CloudFlare)
- [x] S4-13: OpenTelemetry distributed tracing
- [x] S4-14: Load testing + horizontal scaling
- [x] S4-15: E2E test suite comprehensive
- [x] S4-16: Google Play Data Safety form

---

## Post-Sprint 3 — Enterprise Audit (2026-03-21)

> Forensic audit: 3 explore agents + 2 plan agents + 4 review teams. 0 CRITICAL, 2 HIGH, 10 MEDIUM, 6 LOW findings.
> Detail: voir [SPRINT_LOG.md](SPRINT_LOG.md#enterprise-audit--post-sprint-3-forensic-review-2026-03-21)

### Runtime Fixes

- [x] A-01: Rate limiter bucket eviction (sweep timer + MAX_MAP_SIZE cap)
- [x] A-09: OCR Tesseract timeout (30s Promise.race, fail-open)
- [x] A-04: GDPR export pagination (REPEATABLE READ transaction)
- [x] A-03: Logger consistency (console.error → logger.error in app.ts)

### Frontend Observability

- [x] F-06: Sentry error reporting wrapper (kind whitelist + dedup guard)
- [x] F-05: RateLimited error kind (429 mapping + getErrorMessage)
- [x] F-08: SSE requestId propagation in error callback

### API Contract

- [x] A-02: OpenAPI query params + request body documentation
- [x] A-06: Feature flag x-extension markers

### Frontend Quality

- [x] F-03: Google OAuth client IDs externalized to env vars
- [x] F-07: Accessibility gaps (OfflineBanner, OnboardingSlide, ChatMessageBubble)

### Verification

- [x] Backend: tsc --noEmit OK, 364+ tests (41 suites)
- [x] Frontend: tsc --noEmit OK, 29+ tests
- [x] Sprint log + progress tracker updated

---

## Sprint S5 — Hotfix (2026-03-24) (TERMINE)

> Hotfix post-audit: unification DB pool, DRY rate limiting, injection userMemoryBlock.
> Commit: `3298b2f`

- [x] Unification double pool DB (pg natif + TypeORM) via wrapper AppDataSource
- [x] DRY rate limiting — InMemoryBucketStore partage
- [x] Injection userMemoryBlock dans le pipeline LLM
- [x] Typecheck: PASS, Tests: +114

---

## Sprint S6 — Refactor Architecture (2026-03-24) (TERMINE)

> Split chat God Service, DRY orchestrator, +163 tests, fix architecture.
> Commit: `2d79f7d`

- [x] Split chat.service.ts (1002 lignes) en facade + 3 services (chat-message, chat-session, chat-media)
- [x] DRY langchain orchestrator (generate/generateStream)
- [x] Fix shared/ importations features/ (setTokenProvider/setOnLanguageChange)
- [x] +105 tests backend (museum, support, admin modules 80-85% couverture)
- [x] +58 tests frontend (pure logic extraction)
- [x] Typecheck: PASS, Tests: +163

---

## Sprint S7 — Test Fortress (2026-03-24) (TERMINE)

> +93 tests, SSE timeout 60s, coverage baseline.
> Commit: `a6d341d`

- [x] +93 tests backend (integration + unit)
- [x] SSE timeout configurable (60s)
- [x] Coverage baseline: 62.9% statements
- [x] 4 recommandations S6 appliquees et verifiees
- [x] Typecheck: PASS

---

## Sprint S8 — Coverage Branches (2026-03-24) (TERMINE)

> Coverage branches +8.4pp, Jest hooks setup, Wikidata spec.
> Commits: `17c8a94`, `c10e362`

- [x] Coverage branches: 46.5% → 54.9% (+8.4pp)
- [x] Jest hooks setup (useProtectedRoute, useOfflineQueue)
- [x] Wikidata spec
- [x] Fix TS2556 spread argument in AuthContext test
- [x] Typecheck: PASS

---

## Phase 0 — Store Readiness Fixes (2026-03-24) (TERMINE)

> Audit full codebase + fixes bloquants pour publication stores.
> Commit: `e855174`

- [x] Ajout *.aab/apk/ipa a .gitignore (root + frontend)
- [x] Suppression 2 fichiers .aab (178MB)
- [x] NSPrivacyCollectedDataTypes renseigne (6 types donnees)
- [x] Suppression 4 console.* non-`__DEV__` en frontend
- [x] Simplification Dockerfile.prod (double mkdir)
- [x] Correction email sender Brevo (no-reply@musaium.com)
- [x] Ajout nginx config production
- [x] Ajout release checklist (654 lignes)
- [x] Typecheck: PASS, Tests: 0 regression

---

## Sprint W1 — Web Presence Foundations (2026-03-25) (TERMINE)

> Nouveau package museum-web/ (Next.js 15). Landing, support, admin, privacy. i18n FR/EN.
> Commit: `b37ed6e`

### museum-web (nouveau)

- [x] W1-01: Next.js 15 App Router + Tailwind 4 + TypeScript (standalone output)
- [x] W1-02: i18n middleware (FR/EN, path-based /[locale]/)
- [x] W1-03: Dictionnaires FR + EN complets (nav, hero, features, support, admin)
- [x] W1-04: Marketing landing page (hero, features, app showcase, CTA)
- [x] W1-05: Support page (FAQ accordion, contact form)
- [x] W1-06: Privacy policy page (scaffold)
- [x] W1-07: Admin layout (sidebar responsive, AuthGuard, hamburger mobile)
- [x] W1-08: Admin login page (JWT, types alignes sur backend)
- [x] W1-09: Admin pages scaffold (dashboard, users, audit-logs, reports, analytics, tickets, support)
- [x] W1-10: Shared components (Header, Footer, LanguageSwitcher, Button)
- [x] W1-11: Auth system (AuthProvider, AuthGuard, useAuth, UserRole matching backend)
- [x] W1-12: API client (fetch-based, SSR/CSR aware)

### Deployment pipeline

- [x] W1-13: Dockerfile.prod (multi-stage standalone, non-root, healthcheck)
- [x] W1-14: CI workflow (ci-web.yml — typecheck + build)
- [x] W1-15: Deploy workflow (deploy-web.yml — GHCR + VPS SSH)
- [x] W1-16: Nginx updated (musaium.conf + site.conf.production — /api/ + / separation)

### Verification

- [x] museum-web typecheck: PASS (0 errors)
- [x] museum-web build: PASS (13 routes, 102 kB First Load JS)
- [x] Backend: 0 regression (941 tests, tsc PASS)
- [x] Sentinelle: GO (0 bloqueurs, 7 findings mineurs)

---

## Sprint W2 — Web Enrichment (2026-03-25) (TERMINE)

> Landing page riche avec Framer Motion. Admin panel connecte au backend API. Refresh token, i18n, public assets.
> Commit: `d6c77f1`

### museum-web (enrichissement)

- [x] W2-01: Landing page 6 sections (hero anime, how-it-works, feature grid, app showcase, testimonials, download CTA)
- [x] W2-02: 5 composants marketing (AnimatedSection, PhoneMockup, FeatureCard, TestimonialCard, StoreButton)
- [x] W2-03: Dictionnaires marketing FR+EN (showcase, testimonials, download, grid)
- [x] W2-04: Admin dashboard connecte a /api/admin/stats
- [x] W2-05: Admin users table paginee + recherche + filtre role (/api/admin/users)
- [x] W2-06: Admin audit-logs table paginee (/api/admin/audit-logs)
- [x] W2-07: Types admin backend (User, DashboardStats, AuditLog, PaginatedResponse)
- [x] W2-08: AdminDictProvider + useAdminDict() hook i18n

### W1 Findings resolus

- [x] F2: Refresh token interceptor (port museum-admin pattern)
- [x] F3: ContactForm i18n (dict.contact.success)
- [x] F4: Admin sidebar labels i18n (AdminShell + AdminDictProvider)
- [x] F5: Admin login i18n (LoginForm component + dict props)
- [x] F6: Public assets (robots.txt, sitemap.xml)

### Verification

- [x] museum-web typecheck: PASS (0 errors)
- [x] museum-web build: PASS (13 routes, 147 kB First Load JS)
- [x] Backend: 0 regression (951 tests, tsc PASS)
- [x] Sentinelle: GO (0 bloqueurs, 0 boucles correctives)

---

## Metriques globales

| Sprint    | Taches  | Faites | %       | Tests backend | Tests frontend |
| --------- | ------- | ------ | ------- | ------------- | -------------- |
| S1        | 37      | 37     | 100%    | 212           | 8              |
| S1.5      | 5       | 5      | 100%    | 217 (+5)      | 11 (+3)        |
| S2        | 25      | 24     | 96%     | 360 (+93)     | 26 (+13)       |
| S3        | 18      | 18     | 100%    | 360           | 26             |
| Audit     | 11      | 11     | 100%    | 364 (+4)      | 29 (+3)        |
| S4        | 16      | 16     | 100%    | 416 (+52)     | 29             |
| S5        | 3       | 3      | 100%    | 530 (+114)    | 29             |
| S6        | 5       | 5      | 100%    | 693 (+163)    | 87 (+58)       |
| S7        | 4       | 4      | 100%    | 786 (+93)     | 87             |
| S8        | 4       | 4      | 100%    | 913 (+127)    | 106 (+19)      |
| Phase 0   | 8       | 8      | 100%    | 909 (-4)      | 106            |
| W1        | 16      | 16     | 100%    | 941 (+32)     | 106            |
| W2        | 13      | 13     | 100%    | 951 (+10)     | 106            |
---

## Store Submission Polish (2026-03-26, R11)

> Mode: chore | 7 fichiers crees, 1 modifie | 0 regression | Sentinelle: R11

### Store Metadata

- [x] SS-01: App Store description + keywords + What's New (EN, FR, ES, DE)
- [x] SS-02: Google Play short + full description (EN, FR, ES, DE)
- [x] SS-03: Feature Graphic HTML template (1024x500)

### Privacy Policy

- [x] SS-04: Privacy policy page museum-web — real GDPR content (was scaffold)
- [x] SS-05: Privacy content i18n (FR + EN) — server-side data

### Screenshot & Submission Automation

- [x] SS-06: Maestro screenshot automation flows (10 screens)
- [x] SS-07: STORE_SUBMISSION_GUIDE.md — complete submission checklist

### Verification

- [x] museum-web typecheck: PASS (0 errors)
- [x] museum-web build: PASS
- [x] Backend: 0 regression (951 tests, tsc PASS)
- [x] Frontend: 0 regression (47 tests, tsc PASS)

---

## Technical Polish — Component Tests + FlashList + React Compiler + Theme SSOT (2026-03-26, R11)

> Mode: refactor | 27+ fichiers (7 crees, 20+ modifies) | +24 tests | 0 regression | Sentinelle: R11
> Commits: `700d056`, `dab537c`

### FlashList Migration

- [x] TP-01: FlatList → FlashList v2 dans ChatMessageList (ItemSeparator, FlashListRef)
- [x] TP-02: FlatList → FlashList v2 dans MuseumDirectoryList (ItemSeparator, removed removeClippedSubviews)
- [x] TP-03: FlatList → FlashList v2 dans ConversationsScreen (ItemSeparator, removed removeClippedSubviews/Platform)

### Component Render Tests (L3)

- [x] TP-04: WelcomeCard.test.tsx — 6 tests (title, museum/standard icons, onCamera, onSuggestion, disabled)
- [x] TP-05: ErrorBoundary.test.tsx — 5 tests (render children, error fallback, reload, Sentry, reset)
- [x] TP-06: ChatMessageList.test.tsx — 5 tests (render bubbles, empty WelcomeCard, typing indicator, streaming)
- [x] TP-07: AuthScreen.test.tsx — 5 tests (login form, register toggle, GDPR, submit text, forgot password)
- [x] TP-08: ConversationsScreen.test.tsx — 3 tests (loading, cards, empty state)
- [x] TP-09: test-utils.tsx — 17 module mocks shared (i18n, theme, router, icons, blur, haptics, etc.)

### React Compiler

- [x] TP-10: babel.config.js — babel-preset-expo + babel-plugin-react-compiler (auto-memoization)

### SSOT Colors

- [x] TP-11: 8 new theme properties (primaryContrast, textTertiary, placeholderText, successBackground, danger, warningText, warningBackground, shadowColor)
- [x] TP-12: Hardcoded colors → theme refs in 27 files (all app/ screens, features/chat/*, features/conversation/*, features/auth/*, shared/ui/ErrorBoundary). ~109 hardcoded hex → 9 intentional (92% reduction). Dark mode warning badge bug fixed.

### Verification

- [x] Frontend typecheck: PASS (0 errors)
- [x] Frontend tests: 161 pass (90 node + 71 jest) — was 137, +24
- [x] Backend: 0 regression (951 tests, tsc PASS)
- [x] as any: 0
- [x] Sentinelle: PASS (0 boucles correctives)

---

## Metriques globales

| Sprint    | Taches  | Faites | %       | Tests backend | Tests frontend |
| --------- | ------- | ------ | ------- | ------------- | -------------- |
| S1        | 37      | 37     | 100%    | 212           | 8              |
| S1.5      | 5       | 5      | 100%    | 217 (+5)      | 11 (+3)        |
| S2        | 25      | 24     | 96%     | 360 (+93)     | 26 (+13)       |
| S3        | 18      | 18     | 100%    | 360           | 26             |
| Audit     | 11      | 11     | 100%    | 364 (+4)      | 29 (+3)        |
| S4        | 16      | 16     | 100%    | 416 (+52)     | 29             |
| S5        | 3       | 3      | 100%    | 530 (+114)    | 29             |
| S6        | 5       | 5      | 100%    | 693 (+163)    | 87 (+58)       |
| S7        | 4       | 4      | 100%    | 786 (+93)     | 87             |
| S8        | 4       | 4      | 100%    | 913 (+127)    | 106 (+19)      |
| Phase 0   | 8       | 8      | 100%    | 909 (-4)      | 106            |
| W1        | 16      | 16     | 100%    | 941 (+32)     | 106            |
| W2        | 13      | 13     | 100%    | 951 (+10)     | 106            |
| Store Sub | 7       | 7      | 100%    | 951           | 106            |
| Tech Polish | 12    | 12     | 100%    | 951           | 161 (+55)      |
| **Total** | **184** | **183** | **99%** | **951**       | **161**        |

---

## V3 Sprints (2026-03-26 a 2026-03-27) — Post V3_REVIEW_AND_PLAN

> V3.0 Pre-requis + V3.1 Sprints 2-4 + V3.2 Sprint 5 executes. Commits `75b8e70` a `5b3fb88`.

### V3.1 Sprint 2 — Admin Web Complet

- [x] 4 pages admin web connectees (analytics, reports, tickets, support) — Recharts, i18n dictionnaire
- [x] i18n admin web migre vers fichier dictionnaire structure

### V3.1 Sprint 3 — Support Mobile + UX Polish

- [x] Tickets support in-app (creer, lister, detail, repondre) — 3 ecrans
- [x] UX polish (haptic, onboarding, i18n)

### V3.1 Sprint 4 — Wikidata Knowledge Enrichment

- [x] Wikidata knowledge enrichment integre dans le pipeline LLM
- [x] Art-topic classifier integration

### V3.2 Sprint 5 — Tests Backend Core

- [x] +40 tests chat core services + guardrail async fix

### R13 — Liquid Glass Redesign + Review Module

- [x] Museum-web liquid glass redesign
- [x] Review module backend + frontend

### Metriques post-V3

- [x] Backend: 1054 tests, 98 suites, tsc PASS, 0 as-any
- [x] Frontend: tsc PASS (10 warnings ESLint)
- [x] Coverage: 68.6% stmts, 53.1% branches

---

## Audit Complet 2026-03-27 — Remaining Work

> Audit 4 agents paralleles (backend, frontend, tests, devops). Score global: 84/100.
> Rapport detaille: `.claude/team-reports/2026-03-27_full-audit.md`

### TIER 0 — Store (PO tasks, pas de code)

- [ ] RW-01: Remplir Google Play Data Safety Form dans Play Console (ref: `docs/GOOGLE_PLAY_DATA_SAFETY.md`)
- [-] ~~RW-02: Instagram handle~~ — reporte volontairement, pas prioritaire

### TIER 1 — CRITIQUE (avant launch public) — TERMINE 2026-03-27

- [x] RW-03: Fixer Frontend Jest — `transformIgnorePatterns` + `.pnpm` (12 suites, 72 tests restored)
- [x] RW-04: UI "Change Password" dans Settings — `app/(stack)/change-password.tsx` + authApi + i18n 8 langues
- [x] RW-05: UI "Export My Data" dans Settings — bouton + Share.share() + authApi + i18n 8 langues
- [x] RW-06: Procedure rollback production — `docs/RUNBOOK.md` (Docker, migration, DB restore, escalade)
- [x] RW-07: Politique rotation secrets — section ajoutee dans `docs/CI_CD_SECRETS.md` (15 secrets, dual-key JWT)

### TIER 2 — IMPORTANT — TERMINE 2026-03-27

- [x] RW-08: Change Email endpoint backend — `PUT /change-email` + `POST /confirm-email-change` + migration + 13 tests
- [-] RW-09: CAPTCHA (hCaptcha) — defere (necessite compte hCaptcha)
- [x] RW-10: Trivy staging unifie (0.28.0 → 0.35.0)
- [x] RW-11: Coverage thresholds ratchet (63/49/55/63 → 66/51/58/65)
- [x] RW-12: Infrastructure tests museum-web — vitest + 51 tests (API, i18n, components, admin)
- [x] RW-13: OpenAPI validation ajoutee dans mobile-release.yml
- [-] RW-14: Network Security Config Android — defere (Expo managed ne supporte pas directement)

### TIER 3 — Backlog v1.1+ — TERMINE 2026-03-27

- [-] RW-15: Map view musees — defere (react-native-maps = gros chantier, v1.1)
- [x] RW-16: Crop image UI — bouton crop dans ImagePreviewModal (crop carre centre)
- [x] RW-17: Swipe-to-delete conversations — SwipeableConversationCard + gesture-handler
- [x] RW-18: Bulk delete conversations — mode edit + checkboxes + barre actions + confirmation
- [-] RW-19: PostHog analytics — defere (necessite compte)
- [x] RW-20: Tests accessibilite — 19 tests frontend (a11y audit) + 10 tests museum-web
- [x] RW-21: Tests snapshots — 8 snapshots frontend + 10 snapshots museum-web
- [x] RW-22: Lighthouse CI museum-web — workflow + lighthouserc.json (perf 85, a11y 90, SEO 90)
