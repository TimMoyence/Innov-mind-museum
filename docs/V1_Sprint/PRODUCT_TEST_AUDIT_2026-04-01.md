# Musaium -- Product & Process Test Audit

> **Date**: 2026-04-01 | **Auditor**: Product Manager + Process Audit Team
> **Scope**: museum-backend (1457 tests), museum-frontend (146 tests), museum-web (12 tests)
> **Total**: ~1615 automated tests across 3 packages
> **Coverage**: Backend 72.86% stmts / 57.61% branches | Frontend 25% stmts / 13% branches

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Business Rule Coverage Audit](#2-business-rule-coverage-audit)
3. [Product Requirement Traceability](#3-product-requirement-traceability)
4. [Process Gaps -- Regression Prevention](#4-process-gaps--regression-prevention)
5. [Feature-Test Coupling Analysis](#5-feature-test-coupling-analysis)
6. [Industry Best Practices](#6-industry-best-practices)
7. [Recommended Quality Gates](#7-recommended-quality-gates)
8. [Action Items Summary](#8-action-items-summary)

---

## 1. Executive Summary

### Strengths

The Musaium project has an **unusually mature test infrastructure** for a startup-phase product:

- **Layered test pyramid**: Unit (80+), integration (20+), contract (3), E2E (4), AI (4), performance (4 k6 scripts) -- all categories represented
- **Coverage ratcheting enforced in CI**: Backend thresholds at 71/55/62/71 (stmts/branches/functions/lines) with a clear upward trend from 62.9% to 72.86%
- **OpenAPI contract tests**: Response payloads validated against the spec -- catches API drift automatically
- **E2E with Testcontainers**: Real Postgres in CI, no mocking at the integration boundary
- **Post-deploy smoke tests**: Both staging and prod run `smoke-api.cjs` after deployment
- **DB_SYNCHRONIZE guard**: CI grep-blocks any `DB_SYNCHRONIZE=true` in env files -- production safety net
- **Trivy image scanning**: CRITICAL/HIGH severity fails the build
- **Shared test factories**: `makeUser()`, `makeMessage()`, `makeSession()`, `buildChatTestService()` prevent drift
- **Nightly E2E schedule**: `cron: '17 3 * * *'` ensures daily regression detection

### Critical Gaps

| # | Gap | Severity | Impact |
|---|-----|----------|--------|
| G1 | **No CODEOWNERS file** -- anyone can modify any test without required approval | HIGH | Test weakening goes unreviewed |
| G2 | **No branch protection rules** documented in repo | HIGH | Direct pushes to main bypass CI |
| G3 | **Frontend coverage thresholds are negligibly low** (25/13/23/25) | HIGH | Frontend regressions undetected |
| G4 | **No mutation testing** -- coverage is a vanity metric without it | MEDIUM | False confidence in test quality |
| G5 | **AI tests are manual-only** -- never run in CI automatically | MEDIUM | LLM behavior drift undetected |
| G6 | **museum-web has zero coverage thresholds** | MEDIUM | Web tests are advisory only |
| G7 | **No E2E mobile tests** (Maestro flows exist for screenshots but not regression) | HIGH | Most user-facing flows are untested end-to-end |

### Verdict

**Backend: STRONG (B+)** -- comprehensive business rule coverage, real integration tests, enforced thresholds.
**Frontend: WEAK (D+)** -- critical UI flows like chat streaming, offline queue, and GDPR consent have no functional tests. Coverage thresholds are set below meaningful levels.
**museum-web: MINIMAL (D)** -- 12 tests covering basic rendering. No functional tests for admin panel logic.
**Process: INCOMPLETE (C)** -- CI blocks on test failure but no governance prevents test weakening. No branch protection, no CODEOWNERS, no test review process.

---

## 2. Business Rule Coverage Audit

### 2.1 Authentication Module

| Business Rule | Test File(s) | Verdict |
|--------------|-------------|---------|
| Email/password registration with validation | `auth.route.test.ts`, `auth.e2e.test.ts` | COVERED -- Zod validation (400s), E2E full lifecycle |
| Login with rate limiting | `authSession.service.test.ts`, `login-rate-limiter.test.ts` | COVERED -- 10-attempt threshold, case insensitivity, TTL expiry |
| JWT token issuance (access + refresh) | `authSession.service.test.ts`, `auth.e2e.test.ts` | COVERED -- token generation, rotation, family revocation |
| Token refresh with rotation | `authSession.service.test.ts` | COVERED -- refresh rotation, reuse detection, family revocation |
| Role-based access (visitor/admin/moderator/museum_manager) | `require-role.test.ts`, `rbac.e2e.test.ts` | COVERED -- middleware unit test + E2E role promotion |
| Social login (Google/Apple) | `socialLogin.useCase.test.ts` | COVERED -- existing link, email match, new registration |
| Email verification | `verify-email.test.ts` | COVERED -- valid token, expired token, empty token |
| Forgot/reset password | `forgotPassword.useCase.test.ts`, `resetPassword.useCase.test.ts` | COVERED -- SHA-256 hashing, token expiry |
| Change password | `change-password.test.ts`, `auth.e2e.test.ts` | COVERED -- verify current, reject same, E2E old password rejected |
| Change email | `changeEmail.useCase.test.ts` | COVERED -- token generation, confirmation |
| Account deletion (GDPR) | `deleteAccount.useCase.test.ts`, `auth.e2e.test.ts` | COVERED -- S3 cleanup, resilience when S3 fails |
| PII stripped from JWT | `jwt-pii-strip.test.ts` | COVERED -- verifies only `{id}` in token payload |
| Password policy (8+ chars, uppercase, digit) | `password-validation.test.ts`, `input-validation.test.ts` | COVERED |
| Token cleanup (expired) | `token-cleanup.test.ts` | COVERED -- distributed lock, batch delete |
| Export user data (GDPR) | `export-user-data.test.ts` | COVERED |
| API key authentication (B2B) | `api-key-auth.test.ts`, `apiKey.test.ts` | COVERED -- HMAC-SHA256, timing-safe |

**Auth verdict: EXCELLENT** -- every auth business rule has at least unit + some have integration/E2E coverage. The layered defense is well-tested.

### 2.2 Chat Module

| Business Rule | Test File(s) | Verdict |
|--------------|-------------|---------|
| Session creation | `chat-service-validation.test.ts`, `chat.e2e.test.ts` | COVERED -- userId validation, E2E lifecycle |
| Message posting (text) | `chat-service-validation.test.ts`, `chat.e2e.test.ts` | COVERED -- empty check, max length, E2E |
| Image upload validation | `chat-service-validation.test.ts` | COVERED -- HTTPS-only, MIME whitelist, max size, magic bytes |
| SSE streaming | `chat-service-stream.test.ts` | COVERED -- token callbacks, guardrail block, error fallback |
| Art-topic guardrail (input) | `art-topic-guardrail.test.ts` | COVERED -- insults, injection, off-topic, greetings |
| Art-topic guardrail (output) | `art-topic-guardrail.test.ts` | COVERED -- empty output, insult leak, injection leak |
| Art-topic classifier (LLM) | `art-topic-classifier.test.ts` | COVERED -- yes/no/error/empty (fail-open) |
| Guardrail refusals (i18n) | `guardrail-refusals.test.ts` | COVERED -- 7 locales x 2 variants = 14 strings |
| LLM section prompts | `llm-sections.test.ts` | COVERED -- image guidance, locale, guide level |
| Assistant response parsing | `assistant-response.test.ts` | COVERED -- JSON, plain text, metadata fields |
| Session ownership (cross-user isolation) | `chat-service-ownership.test.ts` | COVERED |
| Session pagination (cursor) | `chat-service-pagination.test.ts`, `session-list-cursors.test.ts` | COVERED |
| Daily chat limit (free tier) | `daily-chat-limit.test.ts` | COVERED -- 100/day limit, 429 response |
| TTS synthesis | `chat-service-tts.test.ts` | COVERED |
| Image prompt injection (OCR) | `chat-message-service.test.ts` (guardrail section) | PARTIAL -- feature-flagged, unit tested but no E2E |
| Cross-session user memory | `user-memory.service.test.ts`, `user-memory-prompt.test.ts` | COVERED |
| Stream buffer (chunking) | `stream-buffer.test.ts` | COVERED |
| History window (conversation context) | `history-window.test.ts` | COVERED |
| Circuit breaker (LLM resilience) | `llm-circuit-breaker.test.ts` | COVERED -- 3-state FSM |
| Chat response contracts | `chat-response.contract.test.ts`, `chat-contract.test.ts` (FE) | COVERED -- both sides validate |
| SSE helpers (event formatting) | `sse-helpers.test.ts` | COVERED |
| Session deletion (soft/hard) | `chat.e2e.test.ts` | COVERED -- empty=hard delete, with messages=soft |
| Knowledge base prompt enrichment | `knowledge-base-prompt.test.ts`, `knowledge-base-service.test.ts` | COVERED |
| Image scoring (Wikidata/Unsplash) | `image-scoring.test.ts` | COVERED |
| Wikidata client | `wikidata-client.test.ts` | COVERED |

**Chat verdict: EXCELLENT** -- the core AI pipeline is comprehensively tested including guardrails, streaming, resilience, and the contract layer.

### 2.3 Museum Module

| Business Rule | Test File(s) | Verdict |
|--------------|-------------|---------|
| Create museum (validation) | `createMuseum.useCase.test.ts` | COVERED -- name/slug validation, geolocation |
| Update museum | `updateMuseum.useCase.test.ts` | COVERED |
| Get museum by ID | `getMuseum.useCase.test.ts` | COVERED |
| List museums | `listMuseums.useCase.test.ts` | COVERED |
| Museum route RBAC | `museum.route.test.ts` | COVERED -- 401/403 enforcement |
| Geolocation search (Overpass) | `overpass-client.test.ts` | COVERED |
| Nominatim reverse geocoding | `nominatim-client.test.ts` | COVERED |
| Museum search (combined) | `search-museums.test.ts` | COVERED |

**Museum verdict: GOOD** -- CRUD and geolocation well tested. Missing: multi-tenancy scoping tests (B2B isolation).

### 2.4 Support Module

| Business Rule | Test File(s) | Verdict |
|--------------|-------------|---------|
| Create ticket | `createTicket.useCase.test.ts` | COVERED -- validation, trimming, priority |
| Add ticket message | `addTicketMessage.useCase.test.ts` | COVERED |
| List user tickets | `listUserTickets.useCase.test.ts` | COVERED |
| List all tickets (admin) | `listAllTickets.useCase.test.ts` | COVERED |
| Get ticket detail | `getTicketDetail.useCase.test.ts` | COVERED |
| Update ticket status | `updateTicketStatus.useCase.test.ts` | COVERED |
| Support route RBAC | `support.route.test.ts` | COVERED |

**Support verdict: GOOD**

### 2.5 Admin Module

| Business Rule | Test File(s) | Verdict |
|--------------|-------------|---------|
| List users (paginated) | `listUsers.useCase.test.ts`, `admin.route.test.ts` | COVERED |
| Change user role | `changeUserRole.useCase.test.ts`, `rbac.e2e.test.ts` | COVERED -- unit + E2E |
| List audit logs | `listAuditLogs.useCase.test.ts` | COVERED |
| List reports | `listReports.useCase.test.ts` | COVERED |
| Resolve report | `resolveReport.useCase.test.ts` | COVERED |
| Admin RBAC (all endpoints) | `admin.route.test.ts` | COVERED -- 401 + 403 for visitor |
| Audit trail immutability | `audit.service.test.ts` | PARTIAL -- tests insert but not immutability |

**Admin verdict: GOOD** -- RBAC enforcement is thorough. Gap: no test verifies audit logs cannot be deleted/modified.

### 2.6 Review Module

| Business Rule | Test File(s) | Verdict |
|--------------|-------------|---------|
| Create review (validation) | `review.useCase.test.ts` | COVERED -- rating bounds, comment length, userName |
| List approved reviews | `review.useCase.test.ts` | COVERED |
| List all reviews (admin) | `review.useCase.test.ts` | COVERED |
| Moderate review | `review.useCase.test.ts` | COVERED |
| Review stats | `review.useCase.test.ts` | COVERED |
| Review route RBAC | `review.route.test.ts` | COVERED |

**Review verdict: GOOD**

### 2.7 Cross-Cutting Concerns

| Business Rule | Test File(s) | Verdict |
|--------------|-------------|---------|
| Health check | `health-check.test.ts`, `health.contract.test.ts` | COVERED |
| Rate limiting (sweep, Redis) | `rate-limit.test.ts`, `rate-limit-sweep.test.ts`, `redis-rate-limit-store.test.ts` | COVERED |
| Request ID propagation | `request-id.test.ts` | COVERED |
| Request logging | `request-logger.test.ts` | COVERED |
| Accept-Language parsing | `accept-language.test.ts` | COVERED |
| Body validation middleware | `validate-body.test.ts` | COVERED |
| Authenticated middleware | `authenticated.test.ts` | COVERED |
| App error hierarchy | `app-error.test.ts` | COVERED |
| Sentry integration | `sentry.test.ts` | COVERED |
| Feature flags | `feature-flags.test.ts` | COVERED |
| Cache services | `cache-services.test.ts` | COVERED |
| Cursor codec | `cursor-codec.test.ts` | COVERED |
| Logger | `logger.test.ts` | COVERED |
| With-retry utility | `with-retry.test.ts` | COVERED |
| Env helpers | `env-helpers.test.ts`, `config/env-helpers.test.ts` | COVERED |
| Fallback messages | `fallback-messages.test.ts` | COVERED |
| Input sanitization | `shared/input-validation.test.ts` | COVERED |
| Daily art | `daily-art.test.ts`, `daily-art.route.test.ts` | COVERED |
| DB resilience | `db-resilience.test.ts` | COVERED (E2E-gated) |
| OpenAPI response validation | `openapi-response.contract.test.ts` | COVERED -- validates all endpoint shapes |

---

## 3. Product Requirement Traceability

### 3.1 Roadmap Feature to Test Mapping

| Roadmap Feature | Sprint | Status | Has Tests? | Gap Assessment |
|----------------|--------|--------|-----------|---------------|
| Email/password auth | S1 | DONE | YES -- extensive | None |
| Social login (Google/Apple) | S1 | DONE | YES | None |
| Chat with LLM | S1 | DONE | YES -- extensive | None |
| Art-topic guardrail | S1 | DONE | YES | None |
| Login rate limiting | S1 | DONE | YES | None |
| SSRF protection | S1 | DONE | YES | None |
| Email verification | S2 | DONE | YES | None |
| SSE streaming | S2 | DONE | YES (backend) | **GAP: No frontend SSE test** |
| i18n EN+FR (+5 languages) | S2-S3 | DONE | YES (backend refusals, CI check) | **GAP: No frontend i18n rendering test** |
| Accessibility (a11y) | S2 | DONE | YES (19 a11y audit tests FE) | Moderate coverage |
| Redis cache layer | S3 | DONE | YES | None |
| Dark mode | S3 | DONE | NO functional test | **GAP: No test verifies theme switching** |
| Offline support | S3 | DONE | YES (`useOfflineQueue.test.ts`) | Unit only, no integration |
| Image preview + crop | S3 | DONE | NO | **GAP: No test for crop/preview flow** |
| Voice TTS | S3 | DONE | YES (backend) | **GAP: No frontend TTS playback test** |
| OCR guard | S3 | DONE | YES (feature-flagged) | None |
| GDPR data export | S3 | DONE | YES | None |
| B2B API keys | S3 | DONE | YES | None |
| Feature flags | S3 | DONE | YES | None |
| Multi-tenancy (B2B) | S4 | DONE | NO dedicated test | **GAP: No test verifies museum scoping** |
| Biometric auth | S4 | DONE | NO | **GAP: No test for Face ID/fingerprint flow** |
| In-app support tickets | S4 | DONE | YES (backend) | **GAP: No frontend ticket creation test** |
| Museum geolocation | S4 | DONE | YES | None |
| Audit logging | S4 | DONE | YES | Immutability not tested |
| GDPR consent checkbox | S2 | DONE | YES (AuthScreen.test.tsx) | Render test only |
| Change password | S2 | DONE | YES (E2E) | None |
| Export data | Audit | DONE | YES (backend) | **GAP: No frontend Share.share test** |
| Swipe-to-delete conversations | Audit | DONE | NO | **GAP: No gesture test** |
| Bulk delete conversations | Audit | DONE | NO | **GAP: No bulk selection test** |
| Review module (thumbs up/down) | R13 | DONE | YES (backend) | **GAP: No frontend feedback test** |
| Image enrichment (Wikidata/Unsplash) | Prod Hard | DONE | YES | None |
| Museum map (Leaflet) | Prod Hard | DONE | NO | **GAP: No map rendering test** |
| In-app review prompt | Prod Hard | DONE | YES (`inAppReview.test.ts`) | None |
| Visit summary modal | Chat UX | DONE | NO | **GAP: No test for summary calculation** |

### 3.2 Features Completed WITHOUT Tests

These features shipped and were marked DONE in the progress tracker but have **zero automated tests**:

1. **Dark mode theme switching** -- ThemeContext + useTheme hook exists, colors migrated, but no test verifies the toggle or that dark palette applies
2. **Image preview + crop modal** -- ImagePreviewModal component, no test
3. **Biometric authentication** -- `useBiometricAuth` hook, no test
4. **Swipe-to-delete conversations** -- SwipeableConversationCard + gesture-handler, no test
5. **Bulk delete conversations** -- Multi-select flow, no test
6. **Visit summary modal** -- Artworks, rooms, duration aggregation, no test
7. **Museum map view** -- Leaflet integration, no test
8. **Multi-tenancy scoping** -- B2B museum isolation, no dedicated test
9. **Frontend SSE streaming** -- fetch + ReadableStream, no test for the client-side streaming hook
10. **Frontend TTS playback** -- expo-av Sound integration, no test

### 3.3 Test-to-Feature Ratio

| Package | Features Shipped | Features with Tests | Ratio |
|---------|-----------------|-------------------|-------|
| Backend | ~45 | ~42 | **93%** |
| Frontend | ~30 | ~14 | **47%** |
| museum-web | ~15 | ~5 | **33%** |

**The frontend is the weakest link.** Nearly half of shipped frontend features have no automated test coverage.

---

## 4. Process Gaps -- Regression Prevention

### 4.1 CI Pipeline Analysis

| Pipeline | Triggers | Quality Gates | Blocks Merge? |
|----------|----------|--------------|--------------|
| `ci-cd-backend.yml` | PR + push to main/staging + nightly | Lint + typecheck + OpenAPI validate + contract tests + unit/integration + coverage threshold + DB_SYNCHRONIZE guard | YES (quality job) |
| `ci-cd-mobile.yml` | PR + push to main | Lint + typecheck + OpenAPI sync check + i18n completeness + tests | YES (quality job) |
| `ci-cd-web.yml` | PR + push to main | Lint + build + test + Lighthouse CI (PR only) | YES (quality job) |

**Strengths:**
- All three packages have CI quality gates
- Backend runs E2E on PR + nightly schedule
- AI tests available via manual `workflow_dispatch`
- Trivy image scanning on deploy
- Post-deploy smoke tests in both staging and production
- i18n completeness check in mobile pipeline
- OpenAPI spec validation in both backend and mobile pipelines

**Weaknesses:**

| # | Gap | Risk |
|---|-----|------|
| P1 | **No branch protection rules in repo** -- no evidence of required reviewers, status checks, or force-push prevention | A developer can push directly to main, bypassing all CI |
| P2 | **No CODEOWNERS file** -- no file-level review requirements | Security-critical tests (guardrail, auth, RBAC) can be modified without security review |
| P3 | **No test review process** -- no separate approval for test modifications | Tests can be weakened (assertions removed, skipped) in the same PR as the feature |
| P4 | **No "protected test" concept** -- all tests have equal governance weight | Guardrail, auth, and RBAC tests should require elevated approval |
| P5 | **Frontend coverage thresholds are performative** -- 25% statements / 13% branches is effectively no gate | Frontend quality degrades silently |
| P6 | **E2E tests gated behind env var** -- `describe.skip` when `RUN_E2E` is not set. PRs do run E2E, but local dev never does | E2E regressions only caught at PR time |
| P7 | **AI tests never run automatically** -- `workflow_dispatch` only | LLM prompt changes go untested until manual trigger |
| P8 | **No test change diff review** -- when a PR modifies a test file, there is no flag or label to draw attention | Test weakening hides in large PRs |

### 4.2 Git History Analysis -- Test Weakening Patterns

Searched the last 50 commits for patterns of test weakening (`fix.*test`, `relax`, `weaken`, `skip.*test`):

- `7141ab8 fix(stream-buffer): clear classifier timeout handle, add timeout test` -- **HEALTHY** -- adds test
- `a014d23 fix: remove async without await in useImagePicker test mock` -- **HEALTHY** -- fixes test correctness
- `01c6bac fix: address challenger findings -- memory leak, perf, memo, facade test` -- **HEALTHY** -- adds test
- `58066cd refactor: DRY test infrastructure + fix SEC-1 magic bytes` -- **HEALTHY** -- infrastructure improvement
- `a4dffff fix: production readiness audit -- 14 security/infra fixes + 55 new tests` -- **HEALTHY** -- adds 55 tests

**No evidence of test weakening in recent history.** This is a strong signal -- the team has discipline. However, this is enforced by culture, not by process, which is fragile as the team scales.

### 4.3 Coverage Threshold Evolution

| Sprint | Backend Stmts | Backend Branches | Frontend Stmts | Frontend Branches |
|--------|--------------|-----------------|----------------|-------------------|
| S7 | 62.9% | ~46% | -- | -- |
| S8 | -- | 54.9% | -- | -- |
| RW-11 | 66% | 51% | -- | -- |
| Prod Hard | 72.86% | 57.61% | 25% | 13% |
| Current threshold | **71%** | **55%** | **25%** | **13%** |

The backend ratchet is **working well** -- thresholds have risen consistently. The frontend threshold has **never been raised** and is set at a level that provides no regression protection.

---

## 5. Feature-Test Coupling Analysis

### 5.1 Cases Where Feature Changes SHOULD Break Tests But MIGHT NOT

| Scenario | Risk | Why Tests Might Not Catch It |
|----------|------|------------------------------|
| Guardrail keyword list modified (add/remove patterns) | HIGH | Unit tests check specific known patterns but no fuzzing or comprehensive boundary test |
| LLM prompt template changed | HIGH | Tests mock the orchestrator -- prompt changes pass through untested |
| JWT claims structure modified | HIGH | `jwt-pii-strip.test.ts` verifies `{id}` only, but other code might read additional fields |
| Frontend API contract drift | MEDIUM | OpenAPI types are auto-generated, but frontend tests mock API calls -- real HTTP shape never tested on FE |
| Rate limit thresholds changed | MEDIUM | Tests use hardcoded values (10 attempts, 100 daily) -- if config changes, tests pass even if behavior is wrong |
| Dark mode palette colors changed | LOW | No tests verify visual correctness -- only theme hook exists |
| i18n translation keys renamed | LOW | CI `check:i18n` validates completeness but not key naming changes |
| SSE event format changed | MEDIUM | Backend `sse-helpers.test.ts` validates format, but frontend has no SSE parsing test |

### 5.2 Critical Blind Spots

**1. LLM Prompt Regression**
The AI tests (`tests/ai/`) are manual-only (`workflow_dispatch`). If a prompt template in `llm-sections.ts` is modified, the unit test checks structure but not semantic output quality. The only protection is manual `AI Integration Tests` trigger, which is easy to forget.

**Recommendation**: Run AI tests as a nightly job (similar to E2E), not just on manual dispatch.

**2. Frontend-Backend Contract Gap**
Frontend tests mock all API calls. Backend OpenAPI contract tests validate response shapes. But there is no test that exercises the actual frontend->backend HTTP path. If a frontend type diverges from the OpenAPI spec, the auto-generation (`npm run check:openapi-types`) catches it, but only if the check is run.

**Strength**: The mobile CI does run `check:openapi-types` -- this is a good safety net.

**3. Guardrail Bypass**
The guardrail tests check known patterns but do not test for adversarial evasion techniques (Unicode homoglyphs, zero-width characters in insults, base64-encoded injection). The `sanitizePromptInput()` function strips zero-width chars, but no test verifies the guardrail + sanitizer work together end-to-end.

**4. Multi-Tenancy Isolation**
S4-05 (multi-tenancy) is marked DONE but there is no test that verifies: User A from Museum X cannot access data from Museum Y. This is a critical B2B business rule with no automated verification.

---

## 6. Industry Best Practices

Based on current industry guidance (2025-2026):

### 6.1 Quality Gates (Sonar, InfoQ)
Modern CI/CD pipelines use **layered quality gates**: code quality (lint/typecheck), security (dependency audit + SAST), test quality (coverage + mutation score), and deployment quality (smoke + canary). Musaium has all four layers except mutation testing.

### 6.2 AI-Assisted Testing (DORA 2025)
Google's 2025 DORA report on AI-assisted development found that AI-generated tests reduce regression cycle time by ~50%, but require **human-in-the-loop review** to ensure assertion quality. The risk of AI weakening tests (generating assertions that pass but don't validate) is a known concern.

### 6.3 Coverage Ratcheting (Goldbergyoni JS Testing Best Practices)
The recommended approach is to detect coverage decrease on each build and never allow it to drop -- Musaium already does this for the backend. The gap is that the ratchet thresholds are **manually updated** rather than auto-computed from the previous build.

### 6.4 Mutation Testing (Stryker, Codecov)
Coverage alone is a vanity metric. A codebase with 72% statement coverage could still have tests that never assert anything meaningful. Mutation testing (Stryker for JS/TS) would verify that tests actually **detect** code changes. Industry recommendation: start with critical modules (auth, guardrail) at 80%+ mutation score.

### 6.5 Protected Tests (Testomat.io, Agile Quality Gates)
Security-critical tests should require elevated approval to modify. This concept maps to CODEOWNERS + branch protection rules in GitHub.

---

## 7. Recommended Quality Gates

### 7.1 Mandatory Before Merge (PR)

| Gate | Currently Enforced? | Recommendation |
|------|---------------------|----------------|
| Backend lint + typecheck | YES | Keep |
| Backend unit/integration tests | YES | Keep |
| Backend coverage threshold | YES (71/55/62/71) | **Raise to 75/60/65/75 by Q3** |
| Frontend lint + typecheck | YES | Keep |
| Frontend tests | YES | Keep |
| Frontend coverage threshold | YES (25/13/23/25) | **RAISE to 40/20/35/40 immediately, 50/30/45/50 by Q3** |
| OpenAPI contract tests | YES | Keep |
| OpenAPI type sync check | YES | Keep |
| i18n completeness | YES | Keep |
| Dependency audit | YES (continue-on-error) | **Change to exit-code: 1 for CRITICAL** |
| E2E tests on PR | YES | Keep |
| Lighthouse CI (web) | YES (PR only) | Keep |

### 7.2 Require PM/Security Sign-Off to Modify

These test files protect business-critical rules and should require CODEOWNERS approval:

```
# .github/CODEOWNERS (proposed)

# Auth security tests -- require security reviewer
museum-backend/tests/unit/auth/                     @security-reviewer
museum-backend/tests/e2e/auth.e2e.test.ts           @security-reviewer
museum-backend/tests/e2e/rbac.e2e.test.ts           @security-reviewer

# Guardrail tests -- require PM + security
museum-backend/tests/unit/chat/art-topic-guardrail.test.ts    @pm @security-reviewer
museum-backend/tests/unit/chat/art-topic-classifier.test.ts   @pm @security-reviewer
museum-backend/tests/unit/shared/i18n/guardrail-refusals.test.ts  @pm

# Contract tests -- require tech lead
museum-backend/tests/contract/                      @tech-lead
museum-frontend/tests/chat-contract.test.ts         @tech-lead

# Coverage config -- require tech lead
museum-backend/jest.config.ts                       @tech-lead
museum-frontend/jest.config.js                      @tech-lead

# CI pipelines -- require tech lead
.github/workflows/                                  @tech-lead
```

### 7.3 Metrics to Track

| Metric | Current | Target (Q2 2026) | Target (Q3 2026) |
|--------|---------|-------------------|-------------------|
| Backend statement coverage | 72.86% | 75% | 80% |
| Backend branch coverage | 57.61% | 60% | 65% |
| Frontend statement coverage | ~25% | 40% | 50% |
| Frontend branch coverage | ~13% | 20% | 30% |
| Backend mutation score (Stryker) | -- | 70% (auth + guardrail) | 75% (all modules) |
| E2E test count | 4 suites | 6 suites (add museum, support) | 8 suites |
| Frontend functional test count | ~18 Jest files | 25 files | 35 files |
| Test-to-feature ratio (FE) | 47% | 70% | 85% |
| AI test cadence | Manual only | Nightly + manual | Nightly + PR (critical paths) |

### 7.4 New Process Recommendations

**1. CODEOWNERS + Branch Protection (IMMEDIATE)**
- Create `.github/CODEOWNERS` file per 7.2
- Enable branch protection on `main`: require 1 review, require status checks (quality job), prevent force push

**2. Test Change Review Label (IMMEDIATE)**
- Add a GitHub Action that labels PRs modifying `tests/` or `__tests__/` dirs with `test-change` label
- CI bot comment: "This PR modifies test files. Reviewer: please verify no assertions were weakened."

**3. Mutation Testing (Q2 2026)**
- Add Stryker Mutator to backend for `modules/auth/` and `modules/chat/application/art-topic-guardrail.ts`
- Set initial mutation score threshold at 70%
- Run as nightly job (mutation testing is slow)

**4. Frontend Coverage Ratchet (IMMEDIATE)**
- Raise frontend thresholds to 40/20/35/40 -- the current 25/13 is below the minimum useful threshold
- Add the 10 missing feature tests identified in Section 3.2

**5. AI Test Nightly Schedule (Q2 2026)**
- Add `schedule` trigger to `ai-tests` job in `ci-cd-backend.yml`: `cron: '30 4 * * *'`
- Notify on failure via Slack/email (AI drift detection)

**6. Mobile E2E Tests (Q2 2026)**
- Convert existing Maestro screenshot flows to regression test flows
- Add to `ci-cd-mobile.yml` as a separate job on `workflow_dispatch`

**7. Multi-Tenancy Isolation Test (IMMEDIATE)**
- Add E2E test: create two users with different `museumId`, verify data isolation
- This is a B2B-critical business rule with zero coverage

---

## 8. Action Items Summary

### Tier 0 -- Do This Week

| # | Action | Owner | Effort |
|---|--------|-------|--------|
| A1 | Create `.github/CODEOWNERS` protecting auth/guardrail/contract/CI tests | Tech Lead | 1h |
| A2 | Enable GitHub branch protection on `main` (1 review, status checks required) | Tech Lead | 30min |
| A3 | Raise frontend coverage thresholds to 40/20/35/40 in `jest.config.js` | Dev | 30min |
| A4 | Add missing frontend tests: dark mode toggle, SSE streaming hook, biometric auth | Dev | 2d |
| A5 | Add multi-tenancy isolation E2E test | Dev | 4h |

### Tier 1 -- This Sprint

| # | Action | Owner | Effort |
|---|--------|-------|--------|
| A6 | Add test-change label GitHub Action | DevOps | 2h |
| A7 | Add nightly schedule to AI tests in `ci-cd-backend.yml` | DevOps | 30min |
| A8 | Add frontend tests for: image preview/crop, visit summary, TTS playback, ticket creation | Dev | 3d |
| A9 | Add museum-web coverage thresholds in vitest config | Dev | 1h |
| A10 | Add audit log immutability test (verify no DELETE/UPDATE on audit_logs table) | Dev | 2h |

### Tier 2 -- Next Sprint

| # | Action | Owner | Effort |
|---|--------|-------|--------|
| A11 | Integrate Stryker mutation testing for auth + guardrail modules | Dev | 2d |
| A12 | Convert Maestro screenshot flows to E2E regression tests | Dev | 3d |
| A13 | Add guardrail evasion tests (Unicode homoglyphs, zero-width chars, base64) | Security | 1d |
| A14 | Implement auto-ratcheting coverage (CI computes previous threshold, blocks decrease) | DevOps | 4h |
| A15 | Add rate limit config-aware tests (read threshold from config, not hardcode) | Dev | 2h |

### Tier 3 -- Backlog

| # | Action | Owner | Effort |
|---|--------|-------|--------|
| A16 | Frontend integration tests with MSW (Mock Service Worker) for real HTTP shape testing | Dev | 3d |
| A17 | Visual regression testing (Chromatic or Percy) for dark mode + RTL | Dev | 2d |
| A18 | Chaos engineering tests (Redis down, LLM timeout, S3 unavailable) | Dev | 2d |
| A19 | GDPR consent flow E2E (register without checkbox blocked, re-consent on policy update) | Dev | 1d |

---

## Sources

- [Sonar -- Quality Gates in Software Development](https://www.sonarsource.com/resources/library/quality-gate/)
- [InfoQ -- The Importance of Pipeline Quality Gates](https://www.infoq.com/articles/pipeline-quality-gates/)
- [Testomat.io -- Quality Gates for Your Project](https://testomat.io/blog/what-are-quality-gates-and-how-will-they-help-your-project/)
- [QATestLab -- Software Quality Trends in 2026](https://blog.qatestlab.com/2025/12/24/software-quality-trends-in-2026-key-changes-shaping-modern-qa/)
- [AIO Tests -- Software Quality Audit in Agile Teams 2026](https://www.aiotests.com/blog/software-quality-audit-for-agile-teams)
- [Google DORA -- 2025 State of AI Assisted Software Development](https://cloud.google.com/resources/content/2025-dora-ai-assisted-software-development-report)
- [SmartDev -- How AI-Assisted QA Reduces Testing Time by 50%](https://smartdev.com/how-ai-assisted-qa-reduces-testing-time-by-50-percents/)
- [Codecov -- Mutation Testing: Coverage Isn't a Vanity Metric](https://about.codecov.io/blog/mutation-testing-how-to-ensure-code-coverage-isnt-a-vanity-metric/)
- [Goldbergyoni -- JavaScript Testing Best Practices (2025)](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Stryker Mutator -- Mutation Testing Configuration](https://oneuptime.com/blog/post/2026-01-25-mutation-testing-with-stryker/view)
- [TestRail -- 9 Software Testing Trends in 2025](https://www.testrail.com/blog/software-testing-trends/)
