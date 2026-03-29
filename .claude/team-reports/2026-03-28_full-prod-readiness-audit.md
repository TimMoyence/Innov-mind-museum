# Full Prod-Readiness Audit — 2026-03-28

## Executive Summary

**Verdict: CONDITIONAL GO — 81/100**

Musaium is a well-engineered application with mature security practices, clean architecture, and strong frontend quality. 6 parallel agent scans + Sentinelle cross-validation identified **2 CRITICAL** and **5 HIGH** findings. 3 must-fix items before confident production deployment — estimated total effort: ~3 hours.

**Key strengths:** Zero `as any` frontend, OWASP Top 10 all PASS, hexagonal architecture with ESLint boundary enforcement, 100% i18n parity (8 languages, 497 keys), comprehensive auth with token rotation/reuse detection, multi-layer LLM prompt injection defense.

**Key gaps:** path-to-regexp ReDoS in Express, unhashed password reset tokens, LangChain pre-stable versions, HTTP route handlers at 0% test coverage.

---

## Scan Coverage

| Scan | Agent | Score | Duration |
|------|-------|-------|----------|
| Backend Architecture | Backend Architect (opus) | 8.6/10 | ~3 min |
| Frontend Architecture | Frontend Architect (opus) | 9.1/10 | ~3 min |
| Security (OWASP + Auth + LLM) | Security Analyst (opus) | 9.0/10 | ~5 min |
| Test Quality & Coverage | QA Engineer (opus) | 7.0/10 | ~6 min |
| Supply Chain & Infra | DevOps Engineer (opus) | 8.8/10 | ~3 min |
| LangChain Deep Review | General-purpose (opus) | 7.5/10 | ~4 min |
| Cross-validation | Sentinelle (opus) | 81/100 | ~4 min |

**Total: 7 agents, ~28 min parallel execution. Sentinelle applied 7 corrections (1 refuted, 4 downgraded, 1 upgraded, 2 stale-data).**

---

## Pre-flight Baseline

| Metric | Backend | Frontend |
|--------|---------|----------|
| Typecheck | PASS (0 errors) | WARN (2 pre-existing TS2556) |
| Tests | 1077 passed, 25 skipped | 105 passed, 0 failed |
| Coverage | Br 53.55%, Fn 61.08%, Ln 68.59% | Not configured |
| Lint | 0 warnings | 12 warnings (color literals) |

---

## Findings (Sentinelle-Corrected)

### CRITICAL (2) — Must fix before production

| # | Domain | Finding | Fix | Effort |
|---|--------|---------|-----|--------|
| C1 | Supply Chain | **path-to-regexp@8.2.0 ReDoS** (GHSA-j3q9-mxjg-w52f) — production dependency via `express@5.2.1 > router@2.2.0`. Crafted URLs cause catastrophic backtracking. | Add `"path-to-regexp@>=8.0.0": "8.4.0"` to `pnpm.overrides` in `museum-backend/package.json`, then `pnpm install`. | 15 min |
| C2 | Tests | **HTTP route handlers at 0% branch coverage** — 1737 lines of untested adapter/primary code across auth (15.5K), admin (10.4K), chat, museum, review, support routes. Request validation, error mapping, middleware chaining untested. | Add supertest integration tests against `createApp()` with mocked services. Priority: auth.route.ts, admin.route.ts. | 2-3 sprints |

### HIGH (5) — Should fix before scaling

| # | Domain | Finding | Fix | Effort |
|---|--------|---------|-----|--------|
| H1 | Supply Chain | **langsmith@0.3.87 SSRF** (GHSA-v34v-rq6j-cj6p) — tracing header injection via @langchain/core transitive dep. | Add `"langsmith@>=0.3.0": ">=0.4.6"` to `pnpm.overrides`, or upgrade @langchain/core. | 15 min |
| H2 | Security | **Unhashed password reset tokens** — `forgotPassword.useCase.ts:33` stores raw hex in `reset_token` column. DB compromise = immediate account takeover. Email change flow already hashes correctly (`changeEmail.useCase.ts:64`). | Apply same SHA-256 pattern: `crypto.createHash('sha256').update(token).digest('hex')`. Update `consumeResetTokenAndUpdatePassword` to compare hashed values. | 2h |
| H3 | LangChain | **LLMCircuitBreaker dead code** — Fully implemented at `llm-circuit-breaker.ts` (CLOSED/OPEN/HALF_OPEN state machine) but zero imports in production. Provider outages bypass circuit-breaking. | Wrap `model.invoke()`/`model.stream()` in orchestrator with circuit breaker instance. ~20 lines of wiring. | 1h |
| H4 | LangChain | **LangChain packages on pre-stable 0.x** — @langchain/core 0.3.80 (latest: 1.x), @langchain/openai 0.5.7 (latest: 1.x), @langchain/google-genai 0.2.5 (latest: 2.x). Missing security patches, newer model support, breaking changes expected. | Dedicated upgrade sprint. The `as unknown as ChatModel` casts at `langchain.orchestrator.ts:63,75,84` will need rework. | 1 sprint |
| H5 | Tests | **Mobile E2E tests absent** — Zero Detox/Maestro tests. Auth flow, chat, image upload, offline transitions untested end-to-end. Maestro YAML flows exist but not integrated in CI. | Implement Maestro E2E for critical flows: login -> onboarding -> home -> chat -> image upload. Add to mobile-release.yml. | 1-2 sprints |

### MEDIUM (14) — Improve for production maturity

| # | Domain | Finding | Fix |
|---|--------|---------|-----|
| M1 | Backend | Dual persistence (raw SQL pool vs TypeORM Repository). 9 repos use `pool.query()` returning `any[]`. | Migrate to TypeORM Repository pattern (matches chat module). |
| M2 | Backend | No DB pool exhaustion monitoring. | Add periodic pool stats check, log warning at 80% capacity. |
| M3 | Backend | Art keywords refresh loads ALL keywords every 5 min unbounded. | Add size guard or pagination to keyword refresh. |
| M4 | Backend | Inconsistent validation (Zod vs manual vs inline cast). | Standardize on Zod + `validateBody()` for all modules. |
| M5 | Frontend | FlashList missing `estimatedItemSize` in 3 instances. | Add ~120/80/100 values to ChatMessageList, conversations, MuseumDirectory. |
| M6 | Frontend | `accessible={false}` on keyboard dismiss wrapper hides content from a11y tree. | Use `Pressable` with `onPress={Keyboard.dismiss}` instead. |
| M7 | Frontend | FlashList items lack `accessibilityLabel` on wrapping Views. | Add meaningful labels for screen reader navigation. |
| M8 | Security | Keyword-based injection detection bypassable with Unicode homoglyphs. | Add LLM-based secondary classifier (architecture exists via ArtTopicClassifier). |
| M9 | DevOps | Source maps in production Docker image (tsconfig sourceMap:true). | Add `*.map` to `.dockerignore` or `RUN find /app/dist -name '*.map' -delete`. |
| M10 | DevOps | Dockerfile.dev pnpm version mismatch (8.15.8 vs 9.15.3). | Update to `pnpm@9.15.3`. |
| M11 | DevOps | `eas-cli@latest` unpinned in mobile-release.yml. | Pin to specific version (e.g., `eas-cli@14.2.0`). |
| M12 | LangChain | Unsafe `as unknown as ChatModel` double casts. | Fix during LangChain upgrade sprint. |
| M13 | LangChain | No multi-provider fallback (single provider per deployment). | Create `FallbackChatOrchestrator` wrapping multiple providers. |
| M14 | LangChain | `maxTokens: 800` hard-coded. | Add `LLM_MAX_OUTPUT_TOKENS` env var. |

### LOW (12) — Nice-to-have improvements

- Remove `@types/axios` (deprecated stub)
- Move `components/CameraView.tsx` to `features/chat/ui/`
- Enable `typedRoutes: true` in app.config.ts
- Extract route constants (only AUTH_ROUTE and HOME_ROUTE are constants)
- Consolidate Express type augmentations into single file
- Unify module folder structure (core/ vs flat)
- Remove/wire unused `featureFlagService` in router
- Error middleware: add stack traces to structured logs for 5xx
- Remove dead Anthropic API key config in env.ts
- Raise backend coverage thresholds after adding route tests
- Enable frontend coverage collection in jest.config.js
- Add `expect.assertions(N)` to critical async tests

---

## Prod-Readiness Matrix

| Category | Score | Status | Blocking? |
|----------|-------|--------|-----------|
| **Security (OWASP)** | 9/10 | PASS — all OWASP Top 10 categories addressed | No |
| **Auth/JWT** | 9/10 | PASS — token rotation, reuse detection, bcrypt 12 | No (H2 is improvement) |
| **LLM Security** | 8/10 | PASS — multi-layer injection defense | No |
| **Frontend** | 9.1/10 | PASS — zero as any, 100% i18n, Zustand + SecureStore | No |
| **Backend** | 8.6/10 | PASS — hexagonal, ESLint boundaries, proper DI | No |
| **CI/CD** | 9/10 | PASS — Trivy, frozen lockfile, quality gates | No |
| **Docker** | 8/10 | PASS with M9 — multi-stage, non-root, healthcheck | No |
| **Supply Chain** | 7/10 | **BLOCKED** — C1 (path-to-regexp ReDoS) | **YES** |
| **LangChain** | 7.5/10 | CONDITIONAL — pre-stable versions, dead circuit breaker | Soft block |
| **Test Coverage** | 7/10 | WARN — route/repo gaps, no mobile E2E | Soft block |

---

## Action Plans (Prioritized)

### Sprint 0 — Immediate (before next deploy, ~3h)

| # | Action | Files | Effort | Verified By |
|---|--------|-------|--------|-------------|
| 1 | Fix path-to-regexp ReDoS | `museum-backend/package.json` (pnpm.overrides) | 15 min | `pnpm audit` |
| 2 | Fix langsmith SSRF | `museum-backend/package.json` (pnpm.overrides) | 15 min | `pnpm audit` |
| 3 | Hash password reset tokens | `forgotPassword.useCase.ts`, `user.repository.pg.ts` | 2h | Unit test + manual test |
| 4 | Strip source maps from Docker | `.dockerignore` or Dockerfile.prod | 5 min | `docker build` + verify |

### Sprint 1 — Short-term (1-2 weeks)

| # | Action | Effort |
|---|--------|--------|
| 5 | Wire LLMCircuitBreaker in production path | 1h |
| 6 | Add supertest route tests (auth + admin priority) | 3-5 days |
| 7 | Enable frontend coverage + set thresholds | 2h |
| 8 | Fix FlashList estimatedItemSize (3 files) | 30 min |
| 9 | Fix a11y issues (keyboard dismiss, list labels) | 2h |
| 10 | Standardize on Zod validation for all modules | 1 day |

### Sprint 2 — Medium-term (2-4 weeks)

| # | Action | Effort |
|---|--------|--------|
| 11 | LangChain upgrade to stable 1.x/2.x | 1 sprint |
| 12 | Adopt `withStructuredOutput()` for metadata | Part of #11 |
| 13 | Add token-based history truncation | 1 day |
| 14 | Implement multi-provider fallback | 2 days |
| 15 | Make maxTokens configurable | 30 min |

### Sprint 3 — Long-term (1-2 months)

| # | Action | Effort |
|---|--------|--------|
| 16 | Mobile E2E with Maestro in CI | 1-2 sprints |
| 17 | TypeORM repository integration tests | 1 sprint |
| 18 | Migrate raw SQL repos to TypeORM Repository API | 1 sprint |
| 19 | LLM-based injection classifier (complement keywords) | 1 sprint |
| 20 | DB pool monitoring + alerting | 1 day |

---

## Domain-Specific Deep Dives

### LangChain Assessment

| Aspect | Score | Key Finding |
|--------|-------|-------------|
| Orchestrator Pattern | 8/10 | Custom section-based with semaphore — well-structured but pre-LCEL |
| Prompt Engineering | 9/10 | Multi-layer injection defense, persona-driven, locale-aware |
| RAG | 6/10 | Wikidata-based factual enrichment only, no vector store/embeddings |
| Memory & History | 8/10 | Cross-session user memory excellent, but message-count-only truncation |
| Streaming | 8/10 | Full SSE pipeline with incremental guardrails, no stream retry |
| Multi-model | 6/10 | Config-time selection only, no runtime fallback, hard-coded maxTokens |
| Image/Audio | 7.5/10 | Good image pipeline with SSRF protection, audio OpenAI-only |

**Best practices gaps vs 2025/2026 LangChain.js:** No LCEL adoption, no `withStructuredOutput()`, no token counting, no LangGraph, no native callbacks/LangSmith tracing. Circuit breaker exists but dead. Current implementation is functional and production-stable but architecturally behind the ecosystem.

### Security Posture

| OWASP Category | Status |
|----------------|--------|
| A01: Broken Access Control | PASS |
| A02: Cryptographic Failures | PASS |
| A03: Injection (SQL/XSS/Prompt) | PASS |
| A04: Insecure Design | PASS |
| A05: Security Misconfiguration | PASS |
| A06: Vulnerable Components | WARN (path-to-regexp, langsmith) |
| A07: Auth Failures | PASS |
| A08: Integrity Failures | PASS |
| A09: Logging & Monitoring | PASS |
| A10: SSRF | PASS |

### Test Coverage Architecture

```
Backend (1077 tests):
  Unit (900+)     ████████████████████████░░  ~90%   Excellent
  Integration (50) ███░░░░░░░░░░░░░░░░░░░░░░  ~5%    Needs route tests
  Contract (20)    ██░░░░░░░░░░░░░░░░░░░░░░░  ~3%    Solid for OpenAPI
  E2E (25)        ██░░░░░░░░░░░░░░░░░░░░░░░  ~2%    Gated, needs CI

Frontend (105 tests):
  Unit (90)       ████████████████████████░░  ~86%   Pure functions
  Component (15)  ██░░░░░░░░░░░░░░░░░░░░░░░  ~14%   Hooks + snapshots
  E2E (0)         ░░░░░░░░░░░░░░░░░░░░░░░░░  0%     CRITICAL GAP
```

---

## Previous Audit Comparison

| Finding | Previous Status | Current Status |
|---------|----------------|----------------|
| NR-004: Frontend route bypasses (14 infra imports) | HIGH | OPEN (reduced by R15 but 9 remain) |
| NR-005: image-storage.s3.ts 575L | MEDIUM | OPEN |
| NR-006: i18n a11y keys missing | MEDIUM | **RESOLVED** (100% parity confirmed) |
| Branch coverage stagnant (53%) | Previous audit | UNCHANGED (53.55%) |

---

## Conclusion

Musaium demonstrates **strong engineering fundamentals** — the hexagonal backend architecture, zero-any frontend, comprehensive auth, and layered LLM security are all production-grade. The 3 must-fix items (Sprint 0) are quick wins. The strategic investments (LangChain upgrade, route tests, mobile E2E) are Sprint 1-3 work that improves confidence but doesn't block initial deployment.

**Recommendation: Fix Sprint 0 items (3h), then deploy. Plan Sprint 1-3 as hardening work.**

---

*Run: musaium-audit-20260328-1400 | Agents: 7 | Mode: audit (read-only) | Sentinelle score: 81/100 CONDITIONAL GO*
