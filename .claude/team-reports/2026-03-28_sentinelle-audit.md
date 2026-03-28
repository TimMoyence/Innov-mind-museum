# Sentinelle Audit Report - 2026-03-28 (Revised)

**Mode**: Full-stack conformity audit (read-only)
**Scope**: museum-backend + museum-frontend + museum-web
**Branch**: main (63ef70e)
**Previous audit**: 2026-03-27, score 84/100 CONDITIONAL GO
**Revision note**: Updated after cross-validation with team-lead consolidated findings. Initial draft (87/100) was too lenient -- missed frontend architectural violations and additional god files.

---

## Score: 80/100 (-4 from last audit)

| Category | Weight | Score | Notes |
|----------|--------|-------|-------|
| Backend Architecture | 20 | 17/20 | Hexagonal solid but entities coupled to TypeORM, 3 god files |
| Frontend Architecture | 20 | 13/20 | 14 infrastructure bypasses in routes, 2 god route files |
| Security & AI Safety | 20 | 18/20 | Layered defenses intact, minor vuln concerns |
| Tests & Coverage | 20 | 12/20 | Branch 53%, 0% route coverage, PG repos 1-8% |
| Lint / Formatting | 10 | 10/10 | 0 errors, Prettier clean |
| CI / DevOps | 10 | 10/10 | museum-web CI missing test step (minor) |

---

## SCAN-backend: Architecture Conformity (17/20)

### Positives

- **Hexagonal pattern well-implemented**: All 6 modules follow ports & adapters with `adapters/primary/http/` for routes and `adapters/secondary/` or `infrastructure/` for implementations.
- **Barrel exports**: 10 `index.ts` barrels; chat module barrel (`chat/index.ts`, 174L) is exemplary DI wiring.
- **Route placement**: All 6 routes correctly in `modules/<name>/adapters/primary/http/<name>.route.ts`.
- **Path aliases**: `@src/`, `@modules/`, `@shared/` consistently used.
- **No cross-module leaks**: Only 2 acceptable cross-module imports (chat -> auth User entity).

### Findings

- **BE-HEXA-01 (MEDIUM) - Domain entities coupled to TypeORM**: All 14 entity files in `domain/` directories use TypeORM decorators (`@Entity`, `@Column`, `@PrimaryGeneratedColumn`, etc.) -- 155 decorator usages total. In strict hexagonal, domain objects should be framework-agnostic. This is a pragmatic compromise but violates ports & adapters purity.
- **GOD-FILES (HIGH) - Three god files above 500L threshold**:
  - `langchain.orchestrator.ts`: 801L (adapters/secondary/)
  - `image-storage.s3.ts`: 720L (adapters/secondary/)
  - `chat-message.service.ts`: 681L (application/)
  - All have `eslint-disable max-lines` pragmas with justification comments.
- **BE-CHAT-DUAL (MEDIUM) - Chat module dual naming**: Chat uses both `infrastructure/` (for TypeORM repos) and `adapters/secondary/` (for external services). Other modules use one or the other, not both.
- **F-BE-01 (LOW) - Inconsistent module internal structure**: Auth uses `core/domain/` + `core/useCase/`, chat uses `application/` + `domain/` + `infrastructure/`, museum uses `core/domain/` + `core/useCase/`, admin/support/review use flat `domain/` + `useCase/`. Three conventions coexist.
- **BE-BARREL (LOW) - Auth module missing barrel**: No top-level `index.ts` (unlike all other 5 modules).
- **BE-ALIAS (LOW) - 3 relative imports cross-boundary**: Auth module has relative imports to `data/db` instead of using path aliases.

---

## SCAN-frontend: Architecture Conformity (13/20)

### Positives

- **Feature-driven structure**: 8 feature directories with mostly consistent `application/`, `infrastructure/`, `ui/` layers.
- **Expo Router file-based routing**: Proper `(tabs)/`, `(stack)/` groups.
- **OpenAPI types**: Auto-generated at `shared/api/generated/openapi.ts` (76.4K).
- **i18n**: 8 locale translation files.
- **Shared module**: Well-organized (`api/`, `config/`, `infrastructure/`, `lib/`, `types/`, `ui/`).

### Findings

- **F-ROUTE-01 (HIGH) - 14 direct infrastructure imports in route files**: Route files in `app/` bypass the application layer and import directly from `features/*/infrastructure/`. This couples the view layer to infrastructure. Affects: auth.tsx, settings.tsx, conversations.tsx, museum-detail.tsx, ticket-detail.tsx, chat/[sessionId].tsx, discover.tsx, create-ticket.tsx, tickets.tsx, change-password.tsx, home.tsx.
- **F-GOD-01 (HIGH) - Route files with inline business logic**:
  - `settings.tsx`: 662L -- settings screen with embedded logout, password change, biometric, theme logic
  - `conversations.tsx`: 644L -- conversation list with embedded search, sort, delete, archive logic
- **F-A11Y-01 (HIGH) - ImagePreviewModal.tsx missing all a11y**: 0 `accessibilityLabel` or `accessibilityRole` on any interactive element. Has multiple Pressable components.
- **F-A11Y-02 (MEDIUM) - MessageActions.tsx missing a11y**: 0 accessibility labels on interactive elements.
- **F-LAYER-01 to 05 (MEDIUM) - Application to infrastructure coupling**: Systematic pattern across 5 features where application hooks import directly from infrastructure layer, breaking the feature-internal layering.
- **F-FE-02 (LOW) - Missing a11y test coverage**: `accessibility-audit.test.tsx` covers AuthScreen and ChatInput only. Does NOT cover ChatMessageBubble, ChatMessageList, TypingIndicator, ImagePreviewModal, MarkdownBubble.
- **F-A11Y-03 (LOW) - ErrorNotice retry button**: Missing accessibility label.

### Improved from last audit

- Chat screen a11y: 29 accessibility annotations across 8 chat UI components (ChatInput, ChatMessageBubble, FollowUpButtons, RecommendationChips, WelcomeCard, OfflineBanner, AiConsentModal, MessageContextMenu).

---

## SCAN-security: Security Posture (18/20)

### Positives

- **AI safety pipeline intact**: All 4 CLAUDE.md-documented layers implemented and verified:
  1. Input guardrail (`art-topic-guardrail.ts`, 12.9K)
  2. Structural prompt isolation (`[END OF SYSTEM INSTRUCTIONS]` boundary in langchain.orchestrator.ts)
  3. Input sanitization (`sanitizePromptInput()` in 6 files)
  4. Output guardrail
- **JWT auth**: A+ (rotation, reuse detection, bcrypt-12, rate limiting)
- **Graceful shutdown**: A+
- **DB_SYNCHRONIZE**: No `true` in source. Migration governance enforced.
- **Zero `as any`**: Confirmed across entire codebase including tests.

### Findings

- **SEC-01 (MEDIUM) - JWT secret fallback in dev mode**: Dev mode may use weaker/default secret.
- **SEC-03 (MEDIUM) - Guardrail unicode homoglyph bypass**: NFD normalization strips accents but homoglyph characters (e.g., Cyrillic lookalikes) could bypass keyword matching.
- **SEC-06/07 (MEDIUM) - Transitive dependency vulnerabilities**: path-to-regexp ReDoS potential, langsmith vulnerability in transitive dependencies.
- **SEC-01-ESL (LOW)**: 3 `security/detect-non-literal-regexp` warnings in `image-storage.s3.ts`.
- **SEC-02 (LOW) - Token length inconsistency**: Different token lengths across different auth flows.
- **SEC-04 (LOW) - Art topic classifier fail-open**: When classifier errors, it defaults to allowing the message through.
- **SEC-05 (LOW) - SSRF delegation**: Wikidata client makes external HTTP calls with user-influenced parameters.
- **SEC-08 (LOW) - brace-expansion dev dependency**: Potential dev-only vulnerability.

---

## SCAN-tests: Coverage & Quality (12/20)

### Test Results (verified live)

| App | Suites | Tests | Status |
|-----|--------|-------|--------|
| Backend | 99/103 (4 skipped) | 1067 pass, 25 skipped | PASS |
| Frontend (mobile) | 14 | 99 pass | PASS |
| museum-web | 12 | 71 pass | PASS |
| **Total** | **125** | **1237** | **ALL GREEN** |

### Coverage (Backend)

| Metric | Current | Last Audit | Target | Status |
|--------|---------|------------|--------|--------|
| Statements | 68.75% | 68.75% | -- | STAGNANT |
| Branches | 53.29% | 53.29% | 60% | BELOW TARGET (-7pts) |
| Functions | 60.51% | -- | -- | OK |
| Lines | 68.07% | -- | -- | OK |

### Findings

- **TEST-ROUTES (HIGH) - ALL HTTP routes at 0% branch coverage**: No supertest-based route tests exist for any module (auth, museum, admin, support, review, chat). This is the single biggest coverage gap and the primary blocker to reaching 60% branch coverage.
- **TEST-PG (MEDIUM) - PG repositories at 1-8% coverage**: TypeORM repository implementations have minimal test coverage. chat.repository.typeorm.ts (17.3K) is particularly under-tested.
- **F-TEST-03 (MEDIUM) - museum-web CI missing test step**: `ci-web.yml` runs typecheck + build but not `pnpm test`. 71 Vitest tests exist but are not CI-gated.
- **F-TEST-02 (LOW) - museum-web tests broken with npx jest**: Only work via `pnpm test` (Vitest). CI uses correct runner.

---

## Lint & Formatting (10/10)

| Tool | Backend | Frontend | museum-web |
|------|---------|----------|------------|
| TypeScript (tsc --noEmit) | PASS | PASS | PASS |
| ESLint | 0 errors, 21 warnings | -- | 0 errors, 0 warnings |
| Prettier | All files formatted | -- | -- |

21 ESLint warnings (0 errors). Top: `sonarjs/slow-regex` (6x), `sonarjs/no-duplicate-string` (4x), `security/detect-non-literal-regexp` (3x). Concentrated in `image-storage.s3.ts` (8 warnings).

---

## Comparison to Last Audit (2026-03-27, 84/100)

| Finding | Last Audit | This Audit | Delta |
|---------|-----------|------------|-------|
| God files BE | 2 flagged (681L, 801L) | 3 flagged (+720L image-storage.s3.ts) | REGRESSION |
| Branch coverage | 53.29% | 53.29% | NO CHANGE |
| Frontend a11y annotations | FLAGGED | IMPROVED (29 annotations) | IMPROVED |
| Frontend a11y gaps | -- | ImagePreviewModal 0, MessageActions 0 | NEW FINDING |
| Frontend route architecture | not checked | 14 infrastructure bypasses, 2 god route files | NEW FINDING |
| Domain-TypeORM coupling | not checked | 14 entities, 155 decorator usages | NEW FINDING |
| museum-web CI test step | not checked | MISSING | NEW FINDING |

---

## Recommendations (Priority Order)

### P0 -- Must-fix (blockers to 90+)

1. **HTTP route tests via supertest**: Add integration tests for auth, museum, admin, support, review routes. This alone could push branch coverage past 60%.
2. **Frontend god route files**: Extract business logic from `settings.tsx` (662L) and `conversations.tsx` (644L) into feature hooks/components.
3. **Frontend infrastructure bypass**: Route files should import from `application/` hooks, not directly from `infrastructure/`. Add application-layer facades.

### P1 -- Should-fix (for 95+)

4. **God file decomposition BE**: Split `langchain.orchestrator.ts` (801L), `image-storage.s3.ts` (720L), `chat-message.service.ts` (681L).
5. **ImagePreviewModal.tsx + MessageActions.tsx a11y**: Add accessibilityLabel/Role to all interactive elements.
6. **PG repository test coverage**: Add unit tests for TypeORM repositories.
7. **Add `pnpm test` to `ci-web.yml`**: One-line fix to gate 71 existing tests.

### P2 -- Nice-to-have (for 100)

8. **Domain-TypeORM decoupling**: Consider separating TypeORM entities from domain objects (large refactor, pragmatic trade-off).
9. **Normalize module internal structure**: Pick one convention across all modules.
10. **Auth module barrel `index.ts`**: Align with other modules.
11. **Unicode homoglyph guardrail hardening**: Add homoglyph normalization to art-topic-guardrail.

---

## Verdict

**80/100 - CONDITIONAL GO**

The codebase maintains strong foundations: clean lint/formatting, solid AI safety layering, proper hexagonal structure at the module boundary level. However, this audit reveals deeper architectural concerns missed previously: systematic frontend layer violations (14 infrastructure bypasses in routes), additional god files, and critical test coverage gaps (0% HTTP route branches). The score regression (-4 from 84) reflects these newly-surfaced findings, not codebase degradation.

**Key positive**: 1237 tests ALL GREEN, zero `as any`, Prettier + ESLint clean.
**Key blocker**: Branch coverage (53%) cannot reach 60% target without supertest route tests.

---

*Generated by Sentinelle Process Auditor - 2026-03-28*
*Revised after cross-validation with team-lead consolidated scan findings*
*Audit mode: read-only, no code modifications*
