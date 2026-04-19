# MUSAIUM — Progress Tracker

> Source de verite pour l'avancement du projet. Derive de [MASTER_ROADMAP_V2.md](MASTER_ROADMAP_V2.md).
> Mis a jour manuellement a chaque sprint. Chaque case cochee renvoie au sprint log correspondant.

**Legende**: `[x]` = termine | `[~]` = partiel | `[ ]` = a faire | `[-]` = annule/reporte

---

## Pre-Sprint — Audit de code initial

- [x] Analyse complete du codebase (13 rapports dans `docs/archive/fullcodebase-analyse/`)
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
- [ ] S3-18a: ATTrackingManager (expo-tracking-transparency NOT installed — removed from package.json; revisit if App Store requires ATT prompt)
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
| NL-5 S1 MapLibre | 20 | 20 | 100%  | 951           | 1150 (+989)    |
| **Total** | **204** | **203** | **99%** | **951**      | **1150**       |

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
- [x] RW-06: Procedure rollback production — `docs/OPS_DEPLOYMENT.md` (Docker, migration, DB restore, escalade)
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

---

## Refactor R15 — God-File Decomposition Phases 4-5 (2026-03-28)

> Decomposition systematique des fichiers > 500L identifies par audit Sentinelle (score 80/100).

### Backend — Phase 4: Service Decomposition

- [x] R15-01: Extract ImageProcessingService from chat-message.service.ts
- [x] R15-02: Extract GuardrailEvaluationService from chat-message.service.ts
- [x] R15-03: Extract LLMPromptBuilder from langchain.orchestrator.ts
- [x] R15-04: Extract LLMCircuitBreaker (3-state FSM resilience pattern)
- [x] R15-05: Extract ChatSharedTypes from chat.contracts.ts
- [x] R15-06: Cache infrastructure (ping() port + noop impl)

### Backend — Phase 5: S3 Adapter Decomposition

- [x] R15-07: Extract s3-signing.ts (SigV4 crypto utilities, 77L)
- [x] R15-08: Extract s3-path-utils.ts (path/URL encoding, 120L)

### Frontend — Phase 5: God-Route Decomposition

- [x] R15-09: conversations.tsx decomposition (644L → 322L, -50%)
- [x] R15-10: settings.tsx decomposition (662L → 334L, -50%)
- [x] R15-11: A11y ImagePreviewModal (+15 attributes)
- [x] R15-12: A11y MessageActions (+6 attributes)

---

## Production Hardening — Mars 29-31 (hors cycle /team)

> 35 commits, 55 nouveaux tests, 7 features, 20 fixes, 6 refactors.
> Travail effectue hors cycle /team — KB catchup execute 2026-03-31.
> Commits: `0864a2b` a `58066cd`

### Security (R16 GO conditions — TOUTES RESOLUES)

- [x] SEC-01: path-to-regexp pin 8.4.0 (fix ReDoS GHSA-j3q9-mxjg-w52f)
- [x] SEC-02: langsmith pin >=0.4.6 (fix SSRF GHSA-v34v-rq6j-cj6p)
- [x] SEC-03: Reset tokens SHA-256 hashed (forgotPassword + resetPassword useCases)
- [x] SEC-04: LLMCircuitBreaker wire dans orchestrator + api.router
- [x] SEC-05: Route tests (7 fichiers, 1313L — admin, auth, chat, daily-art, museum, review, support)

### Features

- [x] FT-01: Image enrichment pipeline — Wikidata + Unsplash image sources (a3d48c4)
- [x] FT-02: Leaflet map view + user position dans Museums tab (ab05961)
- [x] FT-03: Quick wins — in-app review, open maps, share, daily art (9eb8a0d)
- [x] FT-04: Chat core tests, free tier gate, Schema.org (a7408ae)
- [x] FT-05: Geolocation museum search via Overpass API (b08224d)
- [x] FT-06: Reset password page museum-web + museum seed script (9c33344)
- [x] FT-07: PgBouncer connection pooler + K6 200-VU stress test (76d567e)

### Refactors

- [x] RF-01: Migrate 9 repos raw SQL → TypeORM (6b8675a)
- [x] RF-02: ChatModule singleton encapsulation + coverage threshold increase (ab9f9c3)
- [x] RF-03: CI/CD consolidation 10 workflows → 3 parallel pipelines (995fcf9)
- [x] RF-04: DRY test infrastructure + SEC-1 magic bytes + QA-2 offline image storage (58066cd)

### Fixes (selection)

- [x] FX-01: Production readiness audit — 14 security/infra fixes + 55 new tests (a4dffff)
- [x] FX-02: DB_SSL=false respecte en production (d566a70)
- [x] FX-03: ESLint cleanup + CI/CD pipeline fixes (e1c9562)
- [x] FX-04: FlashList 1.7.6 → 2.3.1 fix iOS launch crash (0864a2b)
- [x] FX-05: Xcode Cloud node setup (nvm → Homebrew node@22) (fdf9d56)
- [x] FX-06: Audit fixes — daily art response, map coords, Zod validation (911acf0, 89351cc, 95fb3b7)

### Verification (2026-03-31 AM)

- [x] Backend: 1433 tests passing, 0 tsc errors, 0 lint errors
- [x] Frontend: tsc PASS
- [x] Coverage: 72.86% statements, 57.61% branches
- [x] as any: 4 (ratchet maintenu)
- [x] Quality ratchet: aucune regression

---

## Chat UX + iOS Pipeline + Dependency Audit (2026-03-31 PM)

> 16 commits. Chat UX overhaul, iOS build pipeline, image enrichment, dependency audit.
> Commits: `a4dffff` to `dced522`

### Chat UX Overhaul

- [x] UX-01: WhatsApp-like instant local image preview + proactive signed URL refresh
- [x] UX-02: TTS listen button on assistant messages (expo-av + backend endpoint)
- [x] UX-03: Visit summary modal (artworks, rooms, duration, expertise)
- [x] UX-04: Thumbs up/down feedback — full-stack (migration + entity + endpoint + UI)
- [x] UX-05: Offline image failure alert + retry button on failed messages
- [x] UX-06: Memory leak fixes (Sound cleanup, stale closure, locale memo)

### Image Enrichment

- [x] IE-01: Wikidata P18 + Unsplash pipeline with scoring, caching, dedup
- [x] IE-02: Magic bytes validation for image uploads (JPEG/PNG/GIF/WebP)
- [x] IE-03: OpenAPI types regenerated for enrichment schema

### iOS Build Pipeline

- [x] IOS-01: expo-file-system downgrade 55→18.1.11 + API migration (SDK 53 compat)
- [x] IOS-02: Pod files alignment (xcconfigs, headers, codegen for Xcode Cloud)
- [x] IOS-03: Resilient Node.js install (3-tier: Homebrew → nodejs.org → system)

### Dependency Audit

- [x] DA-01: Sound memory leak fix in useAudioRecorder (ref + unmount cleanup)
- [x] DA-02: i18n permission alerts (8 languages, was hardcoded English)
- [x] DA-03: Dead deps removed (@types/axios, @anthropic-ai/sdk)
- [x] DA-04: AxiosHeaders.set() compliance (no-misused-spread fix)
- [x] DA-05: DRY test factories directive + makeMessage/makeSession factories

### Verification (2026-03-31 PM)

- [x] Backend: 1457 tests passing (+24), 0 tsc errors, 0 lint errors
- [x] Frontend: 146 tests passing (+5), 0 tsc errors, 22 warnings (0 errors)
- [x] iOS: LOCAL XCODE BUILD VERIFIED (BUILD SUCCEEDED)
- [x] as any: 1 (-3), eslint-disable: -35 net
- [x] Quality ratchet: all metrics improved

---

## Metriques globales (mise a jour 2026-03-31 PM)

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
| V3 Sprints | 8      | 8      | 100%    | 1054 (+103)   | 161            |
| R15       | 12      | 12     | 100%    | 1077 (+23)    | 161            |
| Prod Hard | 22      | 22     | 100%    | 1433 (+356)   | 146            |
| Chat UX   | 17      | 17     | 100%    | 1457 (+24)    | 146            |

---

## Hotfix — Express 5 + Map Drag + Dashboard UI (2026-04-02)

> 3 bugs prod + 17 tests enterprise-grade. Commits: `b51bf46` a `c23a4f0`.

### Backend

- [x] HF-01: Fix `validateQuery` Express 5 req.query read-only crash (prod 500)
- [x] HF-02: Add missing schema fields (`targetType`, `reason`, `dateFrom`, `dateTo`)

### Frontend

- [x] HF-03: Map Leaflet refresh on drag (dragend → re-fetch with 500m threshold)
- [x] HF-04: Integrate edit button into FloatingContextMenu pill

### Tests

- [x] HF-05: validateQuery middleware — 9 tests (coercion, Express 5 compat, errors)
- [x] HF-06: useMuseumDirectory — 2 tests (jitter suppression, null→coords)
- [x] HF-07: FloatingContextMenu — 6 tests (active prop, borders, mixed state)

### Verification

- [x] Backend: tsc PASS, 1445+ tests
- [x] Frontend: tsc PASS, 422 tests (41 suites)
- [x] as any: 0, eslint-disable: 0 new

---

## Metriques globales (mise a jour 2026-04-02)

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
| V3 Sprints | 8      | 8      | 100%    | 1054 (+103)   | 161            |
| R15       | 12      | 12     | 100%    | 1077 (+23)    | 161            |
| Prod Hard | 22      | 22     | 100%    | 1433 (+356)   | 146            |
| Chat UX   | 17      | 17     | 100%    | 1457 (+24)    | 146            |
| Hotfix 04-02 | 7   | 7      | 100%    | 1445+ (+9)    | 422 (+94)      |
| **Total** | **250** | **249** | **99%** | **1445+**     | **422**        |

---

## Production Hardening & V2 Features (2026-04-03 → 2026-04-11)

> ~120 commits. Test fortress, QE refactors, iOS fixes, Apple review, museum UX, Smart Low-Data Mode, design system, web search, knowledge extraction.
> Commits: `13a37b2d` a `588262f9`

### Testing & Quality (April 3-4)

- [x] QE-01: Wave 3 final — route handler tests + hooks tests + ratchet lock
- [x] QE-02: 10 E2E golden path tests + Stryker mutation testing CI integration
- [x] QE-03: CI hardening — fix 9 audit issues across workflows
- [x] QE-04: Resolve all 37 ESLint warnings across frontend (0 warnings)
- [x] QE-05: QE sprint — quality excellence 6.9 → 10/10 across codebase
- [x] QE-06: Eliminate mock walls + low-value frontend tests refactor
- [x] QE-07: Consolidate test factories into shared helpers
- [x] QE-08: Replace 5 double-cast typing hacks with proper generics (auth module)
- [x] QE-09: Extract ImageSourceClient port, ChatModule dependency cleanup
- [x] QE-10: Split chat-message.service.ts (583 → 381L) with enrichment extraction
- [x] QE-11: Maestro E2E integration into mobile CI + tracking
- [x] QE-12: Fix 6 audit items (9/10 → 10/10) — ESLint green, dead exports cleaned

### iOS & App Store (April 4-8)

- [x] IOS-01: Expo 55 upgrade — regenerate ios/ project, new pods, restore test coverage
- [x] IOS-02: Fix Xcode Cloud build — HERMES_CLI_PATH + suppress prebuild
- [x] IOS-03: Disable expo-updates to fix SIGABRT crash on launch
- [x] IOS-04: Uncaught exception handler for crash diagnostics
- [x] IOS-05: Upgrade @sentry/react-native 8.5.0 → 8.7.0 — fix iOS native crash
- [x] IOS-06: CFBundleVersion bump for App Store resubmission

### Apple Review Fixes (April 8)

- [x] AR-01: Remove UIBackgroundModes audio (rejection 2.5.4)
- [x] AR-02: Improve camera/location permission purpose strings (rejection 5.1.1)
- [x] AR-03: Remove ATT framework (rejection 2.1)

### Session S11 — Museum Chat Context Fix (April 4)

- [x] S11-01: Fix museumName never resolved in chat session creation
- [x] S11-02: Fix museumMode overridden by settings — session mode priority
- [x] S11-03: GPS coordinates sent per-message via useLocation
- [x] S11-04: Nearby museums provider (haversine) + visitContext seeding
- [x] S11-05: Migration: coordinates jsonb column on chat_sessions
- [x] S11-06: +13 tests (nearby-museums, fixtures)

### Frontend Features (April 4-6)

- [x] FE-01: Change Email screen + API + settings link + i18n 8 langues
- [x] FE-02: Museum UX crossfade, search-area animation (Sprint B)
- [x] FE-03: OpenAPI types sync + expo-asset peer dep fix

### Privacy & Security (April 6-8)

- [x] SEC-01: PiiSanitizer + 4 audit priorities (privacy module)
- [x] SEC-02: CI security — CODEOWNERS, top-level permissions, blocking SBOM, CodeQL nightly
- [x] SEC-03: SEC-19 — reject orphan session adoption + symmetric anti-theft
- [x] SEC-04: SEC-20 — per-user rate limiter on chat + media routes
- [x] SEC-05: SSRF protection on HTML scraper
- [x] SEC-06: Prompt injection mitigation improvements
- [x] SEC-07: Review filter security fix

### Web Landing Page Redesign (April 6)

- [x] WEB-01: Sprint 1 — SEO foundations + animation fixes
- [x] WEB-02: Sprint 2 — visual sections with live components
- [x] WEB-03: Sprint 3 — premium scroll animations
- [x] WEB-04: Sprint 4-5 — 14 visual fixes from production review
- [x] WEB-05: Hero animation migrate from Remotion to Framer Motion

### Smart Low-Data Mode (April 7)

- [x] LDM-01: Backend — CachingChatOrchestrator decorator with Redis + sorted sets (zadd/ztop)
- [x] LDM-02: Backend — shared cache key builder with contract tests
- [x] LDM-03: Backend — X-Data-Mode header parsing + prompt adaptation
- [x] LDM-04: Backend — MuseumQaSeed entity + GET /museums/:id/low-data-pack endpoint
- [x] LDM-05: Backend — invalidate LLM cache on negative feedback
- [x] LDM-06: Backend — migrate KnowledgeBaseService cache from in-memory to Redis
- [x] LDM-07: Frontend — DataModeProvider with NetInfo auto-detect + manual override
- [x] LDM-08: Frontend — chatLocalCache Zustand store with LRU eviction
- [x] LDM-09: Frontend — computeLocalCacheKey matching backend contract
- [x] LDM-10: Frontend — DataMode settings section with i18n (8 langues)
- [x] LDM-11: Frontend — cached response badge + low-data banner
- [x] LDM-12: Frontend — cache-first logic in useChatSession with X-Data-Mode header
- [x] LDM-13: Frontend — useMuseumPrefetch hook + lowDataPackApi

### Chat UX Improvements (April 8)

- [x] CUX-01: In-app browser for links + intercept markdown taps
- [x] CUX-02: Tavily web search enrichment block in chat pipeline
- [x] CUX-03: Code review fixes — skip cache for dynamic enrichment + abort timeout
- [x] CUX-04: Critical link interception bug fix (Sprint 2 review)
- [x] CUX-05: inAppBrowser.openSystem i18n key for all 8 locales

### Design System (April 9)

- [x] DS-01: 3-layer design token system (primitives + functional + semantic)
- [x] DS-02: Migrate themes.ts + shared/ui components to design tokens
- [x] DS-03: Migrate 22 chat/auth files to design tokens
- [x] DS-04: Migrate remaining feature modules to design tokens
- [x] DS-05: Migrate all 21 stack/tab screens to design tokens
- [x] DS-06: Migrate museum-web to design system tokens
- [x] DS-07: V2 enterprise — extend typography + semantic tokens, zero hex debt
- [x] DS-08: Centralize — prune dead tokens + single barrel export

### Web Landing Page Redesign (April 9)

- [x] WEB-06: "App Mirror" redesign — align with mobile design system

### Overpass / Museum Fixes (April 10)

- [x] OV-01: Cache empty Overpass results + in-memory cache fallback
- [x] OV-02: nwr shortcut query + User-Agent + mirror fallback chain
- [x] OV-03: Use [timeout:180] admission budget — fixes 504 on dense areas
- [x] OV-04: Lower client timeout to 8s — avoid VPS nginx 502
- [x] OV-05: Add Private Coffee as 3rd fallback mirror
- [x] OV-06: Include seed-museums.ts in Docker build context
- [x] OV-07: Handle undefined identifiers in seed when all rows exist

### Web Search Multi-Provider (April 10)

- [x] WS-01: Google Custom Search client with tests
- [x] WS-02: Brave Search client with tests
- [x] WS-03: SearXNG multi-instance client with tests
- [x] WS-04: DuckDuckGo Instant Answer client with tests
- [x] WS-05: FallbackSearchProvider with sequential failover
- [x] WS-06: Wire multi-provider fallback chain (Tavily → Google → Brave → SearXNG → DuckDuckGo)

### Knowledge Extraction Module (April 10)

- [x] KE-01: Entities, ports, and test factories (3 entities: ExtractedContent, ContentClassification, ExtractionJob)
- [x] KE-02: HTML scraper with Readability + Cheerio
- [x] KE-03: LangChain content classifier with structured output
- [x] KE-04: TypeORM repos with upsert + partial update
- [x] KE-05: Extraction job service (scrape → classify → store)
- [x] KE-06: BullMQ extraction worker with rate limiting
- [x] KE-07: DB lookup service with LOCAL KNOWLEDGE prompt block
- [x] KE-08: Wire module + enrichment loop integration
- [x] KE-09: DB migration for 3 extraction tables

### Misc (April 8-10)

- [x] MISC-01: Comprehensive security + quality hardening sprint (audit)
- [x] MISC-02: Vite 8.0.7 pinned as direct devDependency (CVE GHSA-4w7w-66w2-5vf9)
- [x] MISC-03: Replace jsdom with linkedom for ESM compat in Jest
- [x] MISC-04: Quality ratchet updated (1091 FE tests)
- [x] MISC-05: App icon, favicon, feature graphic refresh

### Verification (2026-04-11)

- [x] Backend: tsc PASS
- [x] Frontend: tsc PASS
- [x] Quality ratchet: maintained

### Bugfix — Museum Distance Unit (April 15)

- [x] BF-01: Fix distance unit mismatch — backend returns meters, frontend displayed as km
- [x] BF-02: Rename `haversineDistance` → `haversineDistanceMeters` (return meters, align with backend)
- [x] BF-03: Rename `MuseumWithDistance.distance` → `distanceMeters` (type-level unit safety)
- [x] BF-04: New `formatDistance()` smart formatter (< 1 km → "450 m", ≥ 1 km → "2.3 km")
- [x] BF-05: Add `distance_m` i18n key to all 8 locales
- [x] BF-06: Update nav params, MuseumCard, museum-detail, MuseumMapView
- [x] BF-07: Update tests — haversine, formatDistance, MuseumCard, useMuseumDirectory, museum-detail

---

## Next Level Roadmap — Plans Modulaires (2026-04-17)

> Audit approfondi backend + mobile + docs + /team + GitNexus. 12 plans d'execution produits dans [docs/plans/](../plans/README.md).
> Session 2026-04-17 (plan maitre issu de la conversation, resumé integré dans les plans).

### Phase 1 — Quick Wins (TERMINEE 2026-04-17)

- [x] [P01](../plans/PLAN_01_DOCS_CLEANUP.md) — Docs Cleanup (commit f2c68305, 25 files)
- [x] [P02](../plans/PLAN_02_TEAM_HARDENING.md) — /team Skill Hardening (commit bc93c5f2, 13 files)
- [x] [P03](../plans/PLAN_03_GITNEXUS_CARTOGRAPHY.md) — GitNexus Cartography Refresh (commit 12d95b28)

### Phase 2 — Refactors Structurels (TERMINEE 2026-04-17)

- [x] [P04](../plans/PLAN_04_BACKEND_CHAT_SLIM.md) — DRY refactor chat-message (457->429 LOC, audit sur-prescriptif: fichier deja facade)
- [x] [P05](../plans/PLAN_05_BACKEND_SHARED_TESTS.md) — MemoryCacheService tests (62.93% -> 93.7%, +18 tests)
- [x] [P06](../plans/PLAN_06_BACKEND_WEBSEARCH_UNIFY.md) — Doc SEARCH_PROVIDERS.md (archi deja unifiee avant session)
- [x] [P07](../plans/PLAN_07_MOBILE_TESTS_SETUP.md) — **DONE** 1120 tests, 132 suites (audit erronne, deja en place)
- [x] [P08](../plans/PLAN_08_MOBILE_CHAT_SPLIT.md) — **DONE** NL-1.1 DRY chat session: 3 helpers pure + fix offline image fallback (commit 5c374013)
- [x] [P09](../plans/PLAN_09_MOBILE_I18N_A11Y.md) — **DONE** NL-1.2 i18n 100% + a11y 60/60 (commit 6b768dd9) + Pass 1 fix optimistic placeholders i18n (commit TBD)
- [x] [P10](../plans/PLAN_10_ART_KEYWORDS_R15_FINALIZE.md) — **DONE** NL-1.3 closure report (commit 5f0705e5), architecture verifiee

### Sprint NL-1 — Phase 2 Closure (2026-04-17)

- [x] NL-1.1 P08 DRY chat session (commit 5c374013) — rapport `docs/plans/reports/NL-1.1-chat-dry-audit.md`
- [x] NL-1.2 P09 i18n + a11y (commit 6b768dd9) — rapports `NL-1.2-i18n-a11y-audit.md`
- [x] NL-1.3 P10 art-keywords verify (commit 5f0705e5) — rapport `NL-1.3-art-keywords-closure.md`
- [x] Tech Lead Review NL-1 + 2x challenge — Pass 1 fix optimistic placeholders i18n

### Phase 3 — V2 Next Level (TERMINEE code-possible 2026-04-17)

- [x] [P11](../plans/PLAN_11_AI_GUARDRAILS_V2.md) — AI Guardrails Layer V2 (commits 254c4644 + bda27e89). Scaffold + LLMGuardAdapter + wiring + 220-prompts dataset + benchmark script + docker-compose overlay. **Execution on-sidecar hors session** (requires Python sidecar infra + API keys for NL-3.4 benchmark run + NL-3.5 go/no-go decision).
- [x] [P12](../plans/PLAN_12_MOBILE_PERF_V2.md) — Mobile Perf V2 (commits d305d3d2 + a365cfdb). FlashList migration (3 screens), getItemType (3 lists), renderItem stabilization, baseline protocol documented. **On-device baseline hors session** (requires iPhone 12 + Pixel 6 for NL-2.1 / NL-2.5).

### Sprint NL-2 — Mobile Perf V2 code-possible (2026-04-17)

- [x] NL-2 FlashList migration tickets.tsx + reviews.tsx + ticket-detail.tsx
- [x] getItemType recycling hint on ChatMessageList + ticket-detail
- [x] Reanimated audit (0 migration — useNativeDriver already on UI thread, ROI <2%)
- [x] Expo Router v7 Stack.Screen compliance verified (0 legacy navigation.setOptions)
- [x] React Compiler actif verified (babel.config.js)
- [x] Tech Lead Review NL-2 + 2x challenge

### Sprint NL-3 — AI Guardrails V2 POC scaffold (2026-04-17)

- [x] NL-3.1 current guardrails cartography (7 defense layers + estimated metrics)
- [x] NL-3.2 frameworks comparison (NeMo / LLM Guard / Prompt Armor + recommendation LLM Guard first)
- [x] NL-3.3 AdvancedGuardrail hexagonal port + noopAdvancedGuardrail + 7 contract tests (100% coverage)
- [x] NL-3.3 benchmark dataset scaffold (45 prompts, 8 locales, 5 categories) — étendu à 220 en NL-4
- [x] NL-3.3 LLMGuardAdapter (commit bda27e89, 14 tests fail-CLOSED + 10 intégration service)
- [x] NL-3.4 benchmark 220 prompts exécuté — 3 itérations locales (v1 default / v2 sans BanTopics / v3 Anonymize PII-only). Artefacts : `museum-backend/reports/p11-bench{,-no-bantopics,-v3}.json`
- [x] NL-3.5 go/no-go décision — **CONDITIONAL GO Phase A (observe-only) avec config v3** (doc: `docs/plans/reports/P11-decision.md`, 2026-04-18). v3 : FP 5%, injection 96.7%, P95 375 ms sur MPS local
- [x] NL-3.6 sidecar POC `museum-backend/ops/llm-guard-sidecar/` (app.py FastAPI + requirements + README) — exécutable via venv Python local, pas besoin de Docker pour le benchmark
- [x] NL-3.7 docker-compose.guardrails.yml aligné sur config v3 (scanners + ANONYMIZE_ENTITIES + timeout 500 ms + start_period 240 s pour cold-start HF)
- [x] NL-3.8 Dockerfile sidecar prod + docker-compose.prod.yml service + .env.production.example vars + CI workflow GHCR (scaffold prêt à merger, build/deploy hors session)
- [ ] NL-3.9 Phase A observe-only — déploiement VPS + 30j télémétrie (hors session — ops)
- [ ] NL-3.10 Phase B décision post-télémétrie (block si confidence ≥ 0.95)
- [x] Tech Lead Review NL-3 + 2x challenge

### Sprint S6 — Home v2 refactor (2026-04-19, challenge-roadmap 2026-04-18)

- [x] S6.1 `features/home/ui/HomeIntentChips.tsx` (vertical 3 chips vocal/camera/walk, haptic + a11y + testIDs)
- [x] S6.2 `features/home/ui/HeroSettingsButton.tsx` (gear icon top-right hero, 44×44 hit area)
- [x] S6.3 `app/(stack)/walk-composer.tsx` (NL-5 placeholder screen + back)
- [x] S6.4 `useStartConversation` walk intent — pure navigation, no session
- [x] S6.5 `app/(tabs)/home.tsx` rewrite — 240L → 147L (−39%), FCM + menuStatus + secondaryRow removed
- [x] S6.6 i18n sync 8 locales — `home.chips.*`, `a11y.home.settings_gear`, `walkComposer.*`; obsolete `home.menu/messages/onboarding` dropped
- [x] S6.7 Tests — 3 suites (home, HomeIntentChips, walk-composer), 1146 tests green (+13 tests vs baseline)
- [x] Commit `07b613b8` refactor(mobile): Home v2 — 3 intent chips + hero gear + walk stub
- [x] Tech Lead Review S6 + 2x challenge (DDD/KISS/DRY/clean archi PASS)

### Feature Flags Audit (2026-04-19)

> Décision produit : Musaium en Phase 1 prod = utilisateur reçoit toutes les features, pas la moitié. Flags résiduels bloquent l'effet wahoo V1.
> Document : [`docs/plans/FEATURE_FLAGS_AUDIT.md`](../plans/FEATURE_FLAGS_AUDIT.md)

- [x] Inventaire 11 flags (10 consommés, 1 mort `multiTenancy`)
- [x] Découvertes : `multiTenancy` zombie, `FEATURE_ART_TOPIC_CLASSIFIER` nommage hors-convention, `.env.*.example` désynchronisés
- [x] **LOT 1 dans NL-4** — `voiceMode` + `streaming` supprimés (commit `91c7faa2`)
- [x] **LOT 2 post-voice-V1** — 7 flags retirés/activés (commit `9fde1972`): `ocrGuard`, `apiKeys`, `knowledgeBase`, `imageEnrichment`, `webSearch`, `knowledgeExtraction` activés ; `multiTenancy` zombie retiré

> **Master plan** : [`docs/plans/NL_MASTER_PLAN.md`](../plans/NL_MASTER_PLAN.md) (Phase 2 closure + Phase 3 launch)
> **Bilan session 2026-04-17 (P01-P06)** : 7 commits, 2655 -> 2673 tests BE (+18), 0 regression.
> **Bilan sprints NL-1/NL-2/NL-3 (même date)** : 9 commits supplémentaires, BE 2673 -> 2680 (+7), FE 1120 jest stable + node 277 -> 293 (+16), i18n 610 -> 617 keys × 8 locales.
> **Total session 2026-04-17** : 16 commits, 0 régression, Phase 2 close à 100%, Phase 3 launch en place (code-possible done, reste execution benchmark/devices).

### Sprint NL-4 — Onboarding v2 show don't tell (2026-04-19)

> FE | challenge-roadmap 2026-04-18. Remplacement du carousel "tell" (3 slides bullets) par un parcours "show" : démo chat animée, value prop visuelle, chips d'entrée directe dans le chat.

- [x] NL-4.1 `useTypewriter.ts` — reveal char-by-char (setTimeout), enabled=false → texte complet instantané, reset via runToken
- [x] NL-4.2 `ChatDemoSlide.tsx` — machine à états user→typing→assistant→rest→loop, bubbles visuels dédiés (pas ChatMessageBubble), TypingIndicator réutilisé, reduced-motion aware
- [x] NL-4.3 `ValuePropSlide.tsx` — 3 piliers Ionicons (camera/mic/map) avec entrée staggered (120ms), as const satisfies pattern
- [x] NL-4.4 `FirstPromptChipsSlide.tsx` — 3 chips full-width (museum/masterpiece/tour), skip CTA, disabled state, testIDs
- [x] NL-4.5 `onboarding.tsx` rewrite — SlideKey[] switch, Next masqué sur slide chips, wiring handleChip→completeOnboarding+startConversation
- [x] NL-4.6 `chat/[sessionId].tsx` — param initialPrompt, isPromptHandled guard, auto-send onMount (attend !isLoading)
- [x] NL-4.7 i18n — clés onboarding.v2.slide{1,2,3}.* dans 8 locales, anciennes clés slide{0,1,2} supprimées
- [x] NL-4.8 Suppression `OnboardingSlide.tsx` (175L) + `OnboardingSlide.test.tsx` (45L) — `git rm`
- [x] NL-4.9 Tests — 4 suites (useTypewriter + 3 composants), onboarding.test.tsx réécrit (9 tests), 1146 tests green, 0 lint error

---

## CTO Audit Enterprise 2026-04-19 (TERMINÉ)

> Audit CTO entreprise-grade : 5 phases, 4 agents scan parallèles, 2 passes challenge DDD/KISS/DRY/hexagonal.
> Rapport complet : [`team-reports/2026-04-19.md`](../../team-reports/2026-04-19.md)
> Commits : `e2fc6d57` (Sprint 1), `4b1c2a56` (Sprint 2)

### Sprint 1 — Dead code + port types + migration safety + ESLint discipline

- [x] Supprimer `precompute-tts.service.ts` (120L, 0 callers, 0 tests — NL-10 prématuré)
- [x] Fix `chat-module.ts` : `buildAudioStorage()` retourne `AudioStorage` port (pas le concret)
- [x] Fix migration `1776593907869-Check.ts` JSDoc : warning data-safety DROP+ADD sur `user_memories`
- [x] Supprimer `env.tts.enabled` (champ toujours `true`, 0 consumers post-V1)
- [x] Fix `text-to-speech.test.ts` : fixture model `'tts-1'` → `'gpt-4o-mini-tts'`
- [x] Fix `feature-flags.test.ts` : remplacer flag retiré `USER_MEMORY` par `OCR_GUARD` actif
- [x] Fix `env.test.ts` : supprimer assertion sur `env.tts.enabled` disparu
- [x] Ajouter `-- reason` aux 5 `eslint-disable` sans justification (ports + middleware)
- [x] Fix `useMuseumPrefetch.ts` : ref assignment dans `useEffect` (concurrent-safe)
- [x] Fix `InAppBrowser.tsx` : wirer `onNavigationStateChange` → `setCanGoBack`/`setCurrentUrl` (back + URL bar fonctionnellement cassés)
- [x] Fix `useTypewriter.ts` : supprimer `setState` dans branche `!enabled`, dériver valeurs de retour

### Sprint 2 — S3 adapter decoupling (Challenge Loop #2)

- [x] Déplacer `S3ImageStorageConfig` de `image-storage.s3.ts` vers `s3-operations.ts` (couche infra neutre)
- [x] Déplacer `buildS3PresignedReadUrl` vers `s3-operations.ts`
- [x] Fix `audio-storage.s3.ts` : import depuis `s3-operations` (élimine coupling adapter→adapter)
- [x] Re-export `buildS3PresignedReadUrl` depuis `image-storage.s3.ts` (compat consommateurs existants)
- [x] tsc PASS (0 erreurs), 2717 tests green, 0 regression

### Vérification finale

| Check | Résultat |
|---|---|
| BE `tsc --noEmit` | PASS (0 erreurs) |
| BE tests | 2717 passed |
| BE as-any | 0 |
| FE `tsc --noEmit` | PASS (0 erreurs) |
| FE tests | 1162 passed |
| GitNexus re-index | DONE (5812 nodes / 14989 edges) |
| Sentinelle gate | **PASS** |

---

## Metriques globales (mise a jour 2026-04-19)

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
| V3 Sprints | 8      | 8      | 100%    | 1054 (+103)   | 161            |
| R15       | 12      | 12     | 100%    | 1077 (+23)    | 161            |
| Prod Hard | 22      | 22     | 100%    | 1433 (+356)   | 146            |
| Chat UX   | 17      | 17     | 100%    | 1457 (+24)    | 146            |
| Hotfix 04-02 | 7   | 7      | 100%    | 1445+ (+9)    | 422 (+94)      |
| V2 Features | 96    | 96     | 100%    | 2294+         | 1091+          |
| CTO Audit 04-19 | 13 | 13  | 100%    | 2717 (+2)     | 1162 (+71)     |
| i18n Email EOD 04-19 | 6 | 6 | 100% | 2748 (+31)    | 1162           |
| **Total** | **365** | **364** | **99%** | **2748**     | **1162**       |
