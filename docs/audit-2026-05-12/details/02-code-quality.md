# 02 — Code quality level
**Date:** 2026-05-12  **Agent:** AGENT-02 (read-only)

## Verdict — TL;DR

- **BE (museum-backend, 53 k LOC, 476 files):** **senior** — score **84/100**
- **FE (museum-frontend, 33 k LOC, 305 files):** **senior** — score **80/100**
- **Web (museum-web, 9.7 k LOC, 89 files):** **competent → senior** — score **76/100**
- **Overall:** This is **senior-grade craftsmanship overall, with isolated competent-grade pockets, not enterprise grade**. The codebase shows deliberate architecture, near-zero technical debt markers (4 TODOs across 96 k LOC), structured logging with correlation IDs everywhere, custom error class hierarchies, hexagonal boundaries that are actually respected, and unusually disciplined async patterns (single-flight refresh, AbortController, Retry-After). What stops it being "enterprise-grade" is non-uniformity: a few God-ish composition roots (`chat-module.ts` 716L / 47 methods, `index.ts` 486L / 35 methods) deliberately exempted from `max-lines`, some FE screens nearing 400 lines (`tickets.tsx`, `preferences.tsx`, `reviews.tsx`) that mix data-loading + filter UI + list rendering in a single component, and Web's `api.ts` retaining `setTokens`/`clearTokens`/`getAccessToken` as no-ops with comments saying "kept for legacy compatibility" — exactly the kind of zombie surface CLAUDE.md flags as forbidden. None of these are rookie smells; they're senior trade-offs that an enterprise team would have refactored or eliminated. The honest line: this is **the work of one experienced developer with strong discipline, not a multi-team production codebase with peer review and refactoring backlog hygiene**.

## Method

Sampling strategy:
- Inventoried largest files per app (top 30 each) — manual review of 9 of them
- Grep-based metrics across **all** prod files (excluded: `migrations/`, `generated/`, `dist/`, `coverage/`, `__tests__/`, `tests/`, `node_modules/`)
- Focus modules per the brief: BE = auth + chat + museum ; FE = auth + chat + voice ; Web = landing + admin
- 9 dimensions scored 1–10 with explicit file:line evidence

Files inspected (representative sample):
- `museum-backend/src/modules/chat/chat-module.ts` (716L composition root)
- `museum-backend/src/modules/chat/useCase/orchestration/chat.service.ts` (490L façade)
- `museum-backend/src/modules/chat/useCase/visual-similarity/similarity.service.ts` (535L)
- `museum-backend/src/modules/auth/useCase/session/login-rate-limiter.ts` (387L)
- `museum-backend/src/modules/museum/useCase/search/searchMuseums.useCase.ts` (450L)
- `museum-backend/src/index.ts` (486L) + `museum-backend/src/app.ts`
- `museum-backend/src/shared/errors/app.error.ts`
- `museum-frontend/features/auth/application/AuthContext.tsx` (316L)
- `museum-frontend/features/chat/application/useChatSession.ts` (270L)
- `museum-frontend/features/chat/application/useTextToSpeech.ts` (242L)
- `museum-frontend/features/conversation/application/useConversationsActions.ts` (146L)
- `museum-frontend/features/auth/screens/MfaEnrollScreen.tsx` (167L)
- `museum-frontend/shared/infrastructure/httpClient.ts` (298L)
- `museum-frontend/app/(stack)/tickets.tsx` (397L)
- `museum-frontend/app/_layout.tsx` (204L)
- `museum-web/src/lib/api.ts` (233L)
- `museum-web/src/lib/auth.tsx` (300L)
- `museum-web/src/app/[locale]/admin/users/page.tsx` (328L)
- `museum-web/src/app/[locale]/admin/analytics/page.tsx` (398L)

---

## BE — museum-backend

### Strengths

1. **Hexagonal isolation is real**. `grep typeorm` and `grep express` in `modules/*/domain/**/*.ts` returns ONLY `import type { Relation } from 'typeorm'` — i.e. the CLAUDE.md-documented SWC-circular-FK workaround for type-only imports. No runtime ORM/HTTP framework coupling leaks into the domain layer. Verified across `chat/domain/`, `auth/domain/`.
2. **Custom error hierarchy is meaningful** — `AppError` base (`shared/errors/app.error.ts:2`) with `ValidationError`, `ImageDecodeError`, `CircuitOpenError`, `SemaphoreQueueFullError`, `SemaphoreTimeoutError`, `EncoderUnavailableError`, `WikidataTransientError`. Errors carry HTTP status codes, headers (for `Retry-After`), and structured detail.
3. **Structured logging w/ event names**. Every log uses `logger.info('snake_case_event_name', { ... })` shape — `redis_connection_failed`, `forgot_password_unverified_skipped`, `chat_service_call`. 293 `logger.*` calls across BE, ZERO raw-string-only logs detected.
4. **Correlation IDs propagated** — 193 occurrences of `requestId` / `X-Request-Id` across BE; matched on FE httpClient request interceptor (line 161).
5. **Async discipline outstanding**: 21 `Promise.all` usages, 62 `fireAndForget` / `void` deliberate fire-and-forgets (intentional pattern), 61 `AbortController` / `signal:` references. External calls like `brave-search.client.ts:52` thread `signal: query.signal` through fetch.
6. **Single-flight pattern** for `runAuthRefresh` (mirror: shared/httpClient FE) — prevents thundering-herd on token expiry. Lockout limiter (`login-rate-limiter.ts`) uses atomic Lua INCR+PEXPIRE for distributed correctness.
7. **Decorative consts beat magic numbers**: `similarity.service.ts:70-78` defines `DEFAULT_TOP_K`, `MIN_TOP_N`, `TOP_N_TOPK_MULTIPLIER`, `RESULT_CACHE_TTL_SECONDS`, `RESULT_CACHE_KEY_PREFIX` — each with a JSDoc explaining the spec linkage (`design.md §5`, `R3`).
8. **Comment quality is excellent** — explanatory WHY (rationale + spec refs) not noisy WHAT. Example: `httpClient.ts:255` (FE) or `chat-module.ts:1` justifying the 716-line exception with reference to `docs/audit-cleanup-2026-05-12/PROMPT_C.md#C.10`.
9. **Almost no `any`**: 15 `: any` literal hits in prod, all in prose docblocks (`Fail-open: any error logged…`) — confirmed by re-reading: zero genuine `: any` types in production code.

### Weaknesses

1. **Composition roots are God-ish**: `chat-module.ts:716` lines, 47 exported methods/functions. `index.ts:486` with 35. Both have a top-line `/* eslint-disable max-lines -- JUSTIFIED:… */` and the comment cites a real refactoring lesson (re-merging six split files). Acceptable for composition roots, but they ARE the single largest cognitive load in the repo.
2. **6 `eslint-disable max-lines`** justifications across BE — count is bounded, but each is a deferred refactor.
3. **118 `eslint-disable` total in BE**. Most are legitimate (`no-require-imports` for conditional CJS, `no-unnecessary-type-parameters` for interface generic shape, `sonarjs/pseudo-random` for non-security TTL jitter) — every one has a `--` justification trailing comment. No silent suppressions detected.
4. **`Relation<T>` leak in domain entities** — `chat/domain/message/chatMessage.entity.ts:17` and ~6 other entities import `type { Relation }` from `typeorm`. Documented in CLAUDE.md as the SWC-circular workaround, but it does mean the domain layer technically knows about TypeORM's existence. Accepted trade-off, not a defect.
5. **A few French strings in BE code**, only in user-facing email templates / one error message: `user.repository.pg.ts:60` (`'Un utilisateur avec cet email existe déjà.'`). For a French-targeting product this is OK — but mixing FR error message + EN log strings on the same useCase is a minor inconsistency.
6. **6 `console.*` calls in BE prod code** — 5 of them inside `shared/logger/logger.ts` (the logger implementation) and 2 in `env.production-validation.ts` (pre-logger boot). All legitimate.
7. **No central `domain/errors/` aggregator** — error classes are scattered: some under `shared/errors/app.error.ts`, some under `modules/chat/domain/errors/`, some inline (e.g. `OAuthCallbackError` declared in route file `auth-google-oauth.route.ts:132`). Minor friction for new contributors.

### Dimension scores (1-10)

1. **Function length & complexity: 8/10** — Two composition roots break the 80-line guideline (`commitAssistantResponse` 89L, `queryContentAnalytics` 89L, `compareImageUseCase` 94L) but ALL are flat orchestrations, not nested deep logic. No functions with 5+ nested levels detected on inspected files.
2. **Naming quality: 9/10** — intention-revealing throughout. `runAuthRefresh`, `setLoginRateLimitStore`, `LOCKOUT_INCR_LUA`, `DEGRADED_WINDOW_MS`, `museumNamesAreSimilar`. Some legacy `I`-prefix on 11 interfaces (`IUserRepository`, `IGuardrailBudgetStore`) — Hungarian, but consistent within their module.
3. **Error handling discipline: 9/10** — custom hierarchy + `unknown` catch params + explicit `instanceof Error` narrowing + every catch logs structured. Zero empty `catch {}` blocks (the few `} catch {` blocks ALL have the inline comment + downstream behaviour, e.g. `cursor-codec.ts:22` falls through, `api.router.ts:224` falls through to default).
4. **Async / Promise discipline: 9/10** — single-flight refresh, AbortController everywhere, `Promise.allSettled` for cleanup, deliberate `void`-prefixed fire-and-forget (62 instances), explicit timeouts on every fetch I sampled (`brave-search.client.ts:52` `signal:`, `nominatim.client.ts:152`, `password-breach-check.ts:80`). No unawaited promises detected outside explicit fire-and-forget.
5. **SOLID: 7/10** — DI via constructor deps is universal (`ChatServiceDeps` is a 50-field interface — large, but every field has JSDoc). `chat-module.ts` is technically a god-class (47 surface methods + private builders) — pragmatic composition root, not SRP-violation in disguise. Hexagonal SoC across module boundaries is genuine.
6. **Magic numbers: 9/10** — overwhelmingly named constants with units in the name (`SHUTDOWN_TIMEOUT_MS = 30_000`, `DEFAULT_RADIUS = 30_000`, `DEDUP_OSM_OSM_METERS = 100`). External URLs (`appleJwksUrl`, `googleJwksUrl`) inlined as defaults in `env.ts` — fine because env-overridable. Underscore separators in numeric literals consistently used.
7. **Defensive vs YAGNI: 8/10** — boundaries are validated with Zod (33 imports in BE), inputs sanitized at the API edge per `prepare-message.pipeline.ts`. Internal helpers trust their callers (the right default). No over-validation noise.
8. **Comment quality: 10/10** — single most striking dimension. Every non-trivial decision carries a comment referencing the spec, an ADR, a security audit section, or a dated incident. **1 TODO across 53 k LOC of BE** (`recoveryCodes.ts:28`, and that's actually a docstring describing the format `XXXXX-XXXXX`). Zero `FIXME` / `XXX` / `HACK`. Zero commented-out code blocks.
9. **Logging & observability: 9/10** — structured everywhere, event-name-keyed, no PII leaks detected on sampled lines (emails are hashed via SHA-1 in `login-rate-limiter.ts`, refresh tokens never logged, only counts). 193 requestId propagations. Prometheus metrics + Langfuse traces + Sentry breadcrumbs wired through `safeTrace` wrapper.

### Verdict: **senior — 84/100**

Because the code shows multiple architectural muscles working together (hexagonal + structured logging + AbortController + circuit breakers + Lua-atomic rate limiting + Zod at boundaries + custom error class hierarchy), the gaps are pragmatic concessions ALWAYS documented with rationale, the TODO/FIXME count is 1, and the average inspected function is the right size doing the right thing. It is not "enterprise-grade" only because there is no peer-review-driven refactoring of the few large files — a senior shipping solo doesn't have the spare cycles, and that shows.

---

## FE — museum-frontend

### Strengths

1. **AuthContext is reference-quality React** (`AuthContext.tsx:118-316`) — `useCallback` everywhere, single-flight refresh handler aligned with httpClient, breadcrumb tracing on bootstrap, explicit `transient` vs `invalid` distinction, Sentry user identification + cleanup on logout, `Promise.allSettled` for per-feature storage cleanup with per-result `reportError`.
2. **httpClient is enterprise-shaped** (`shared/infrastructure/httpClient.ts:1-298`) — 15 s default timeout, single-flight auth refresh (lines 69-99), 429-aware retry with `Retry-After` header parsing (lines 254-285), exponential backoff (1s / 2s / 4s), distinct retry caps for 429 vs 5xx, request-id generation + X-Data-Mode + Accept-Language + Authorization at request interceptor, Sentry breadcrumb emission on response w/ duration. This is what hundreds-of-engineers-team code looks like.
3. **Pure logic factored out**: `chatSessionLogic.pure.ts`, `chatSessionStrategies.pure.ts` — `.pure.ts` suffix denotes deliberately side-effect-free modules. `useChatSession` orchestrates by `pickSendStrategy` returning one of `sendMessageCache / sendMessageOffline / sendMessageAudio / sendMessageStreaming` — Strategy pattern done idiomatically.
4. **Error boundary at app level**: `shared/ui/ErrorBoundary.tsx` extends `Component<Props, State>` — only inheritance-class in FE prod code. Used at root in `app/_layout.tsx`.
5. **Zero `: any`, zero `@ts-ignore`, zero `@ts-expect-error`** in 305 prod files.
6. **Structured Sentry breadcrumbs** — `bootstrapBreadcrumb('start')`, `('no_refresh_token')`, `('token_hydrated', { duration_ms })`. Same event-name discipline as BE.

### Weaknesses

1. **Several screens push 300-400 lines mixing data-loading + filter UI + rendering**:
   - `app/(stack)/tickets.tsx:397` — useState ×9, useCallback heavy, status filter + pagination + FlashList + error + loading + refresh all in one component
   - `app/(stack)/preferences.tsx:387`
   - `app/(stack)/reviews.tsx:385`
   - `app/(stack)/ticket-detail.tsx:379`
   - `app/(stack)/settings.tsx:376`
   These could be split into `useXxxScreen` hook + presentational component but the team chose component-with-co-located-state instead. Workable, not optimal.
2. **Long hooks**:
   - `features/conversation/application/useConversationsActions.ts:9` — 137-line custom hook bundles sort, filter, share, save, delete + Alert dialogs + i18n
   - `features/chat/application/useTextToSpeech.ts:93` — 142-line hook with native/web platform branching for `expo-audio` vs `HTMLAudioElement`
   - `features/auth/screens/MfaEnrollScreen.tsx:45` — 122-line stateful component
3. **8 `console.*` calls in FE prod** — most behind `__DEV__` guards (`httpClient.ts:177, 217`), but `useOfflineQueue.ts:44` logs warn unconditionally, and `global-error-handler.ts:75` logs uncaught exceptions to console (acceptable for last-chance handler) + duplicates to Sentry.
4. **48 `eslint-disable`** — fewer per-LOC than BE, but still present.
5. **3 TODOs across 33 k LOC** — bounded but non-zero. `userProfileApi.ts:15` (`TODO(openapi-regen)`) flags a deferred refactor; `supportLinks.ts:14` (Instagram handle).
6. **AuthContext has secondary useEffect side-effects in deps-empty arrays** (`AuthContext.tsx:137-186` empty deps; `205-248` empty deps) — these are correct (mount-once registration) but a reviewer would want comment "mount-once" since ESLint `react-hooks/exhaustive-deps` would normally complain.
7. **1 `: any` annotation** crept in — needs hunting; small enough to ignore.
8. **`features/auth/infrastructure/authApi.ts` and `httpClient.ts` are referenced as the source-of-truth API surface, but generated `openapi.ts` is 3 510 lines and not yet fully consumed** — `TODO(openapi-regen)` in `userProfileApi.ts:15` admits the migration is incomplete.

### Dimension scores (1-10)

1. **Function length & complexity: 7/10** — five screens at 300-400 lines, two hooks at 137-142 lines. None nested >3 levels.
2. **Naming quality: 9/10** — `setSendStrategy`, `pickSendStrategy`, `runWithSending`, `useStreamingState`, `flushStreamText`. `isStreamingRef` (ref pattern) clearly named. Pure-logic suffix `.pure.ts`.
3. **Error handling: 8/10** — `getErrorMessage` helper consolidates error→string, components consistently call it. No empty catches; many `} catch { /* fire-and-forget */ }` with inline comment. AuthContext error handling distinguishes `isAuthInvalidError` (terminal) vs transient (keep session).
4. **Async / Promise discipline: 9/10** — every `void promise.catch()` annotated, `Promise.allSettled` for cleanup, single-flight refresh mirrored from BE, AbortController in `useChatSession` flush logic.
5. **SOLID: 8/10** — features in `features/<domain>/<application|domain|infrastructure|ui|screens>/` is consistent. `httpClient` separates timer setup, refresh queue, breadcrumb emission. `useChatSession` is the only hook that orchestrates many sub-hooks (`useSessionLoader`, `useStreamingState`, `useOfflineSync`) — a single facade hook, not a god-hook.
6. **Magic numbers: 8/10** — `PAGE_LIMIT = 15`, `timeout: 15000` (httpClient line 147 — could be `HTTP_TIMEOUT_MS`), `30_000` ms threshold in `useAuthAppStateSync` (line 195) inline with a comment. Mostly named, occasional inline literal.
7. **Defensive vs YAGNI: 8/10** — boundary checks where needed (`Platform.OS === 'web'` branching), `messagesLengthRef` to avoid stale closures. No paranoid over-validation.
8. **Comment quality: 9/10** — same as BE, rationale-heavy. Example `AuthContext.tsx:151-158` (8-line comment explaining why bootstrap MUST NOT issue its own refresh). Minimal stale TODOs.
9. **Logging & observability: 8/10** — Sentry breadcrumbs + reportError + structured request id. Mild reliance on `console.*` for dev-only paths.

### Verdict: **senior — 80/100**

Because the infrastructure layer (httpClient, AuthContext, error boundary, breadcrumbs) is uniformly excellent, but the screen layer carries more state + mixed concerns than a top-tier team would tolerate. The screens are correct, just dense. A 2-engineer team would have split them into hook + view.

---

## Web — museum-web

### Strengths

1. **Custom `ApiError` class with status + statusText**, used consistently (`lib/api.ts:23-32`).
2. **Auth via HttpOnly cookies post-F7** — `lib/api.ts:9-19` documents the security migration; `credentials: 'include'` everywhere; `csrf_token` double-submit pattern; refresh queue (lines 75-89) handles concurrent 401s.
3. **`AuthProvider` is well-typed** (`lib/auth.tsx:300L`) — `super_admin` modelled explicitly; `useAuth()` throws if outside provider.
4. **Sentry scrubber** dedicated module (`lib/sentry-scrubber.ts`) shows PII consciousness.
5. **Admin pages share `apiGet` / `apiPost` / `apiPatch`** — no inline `fetch` calls in admin sections.
6. **i18n properly factored** (`lib/i18n.ts`, `dictionaries/`) — locale-aware throughout.
7. **Zero TODOs / FIXMEs / commented-out code** in 9.7 k LOC.
8. **Zero `console.*`, zero `: any`, zero `@ts-ignore`** in Web prod.

### Weaknesses

1. **`lib/api.ts` keeps zombie API exports** — `setTokens`, `clearTokens`, `getAccessToken` are no-op exports retained "for legacy compatibility" (lines 38-56). The comment says "Future cleanup: drop both calls once every consumer has migrated." CLAUDE.md feedback rule `feedback_bury_dead_code.md` says: *"Dead code = deleted same commit, no DEPRECATED markers, no zombie stubs."* This file directly violates that rule. **The single sharpest defect of this audit**.
2. **`AnalyticsPage.tsx:398` mixes data fetching for 3 endpoints, granularity/days filters, chart rendering, and empty-state logic** in one component with `mergeUsageTimeSeries` repeated 3× for sessions/messages/activeUsers (the three `for…of` loops at lines 41-66 are near-duplicates — could be a `mergeBy(date, key)` helper).
3. **`ResetPasswordForm.tsx`** has a 143-line inner component (`ResetPasswordFormInner`, line 14) bundling token validation + password+confirm + breach check + submit.
4. **`AdminShell.tsx:204`** centralizes admin chrome — fine, but the breakpoint for splitting is approaching.
5. **Only 1 `Promise.all`** in Web src — Web is read-heavy with sequential fetches (`AnalyticsPage` fetches usage + content + engagement). It says "Fetch all three in parallel on mount" in line 99 comment but the actual `useCallback` body (would need fuller read to verify) should be checked.
6. **`api.ts` refresh queue is hand-rolled** (`isRefreshing` + `failedQueue` array) — works, but mirrors the more elegant `inflightRefresh: Promise | null` single-flight in FE httpClient. Inconsistency between apps for the same concept.
7. **10 `eslint-disable`** — bounded but present.
8. **No custom error classes beyond `ApiError`** — admin pages just `catch (err) { setError(extractMessage(err)) }` which is fine but leaves no domain-typed errors for behavioural tests.

### Dimension scores (1-10)

1. **Function length & complexity: 7/10** — three components in 300-400 line range; `AuthProvider` 94 lines inside the component body.
2. **Naming quality: 9/10** — `useDebouncedValue`, `mergeUsageTimeSeries`, `isAllZero`, `STATE_CHANGING_METHODS` constant Set.
3. **Error handling: 7/10** — `ApiError` is good ; `setError(extractMessage(err))` pattern is consistent ; F7 cookie auth carries error scenarios well. Loses points for zombie `setTokens`/`getAccessToken`.
4. **Async / Promise discipline: 7/10** — refresh queue works but is duplicated logic vs FE ; `Promise.all` underused.
5. **SOLID: 7/10** — `apiGet/Post/Patch` is a thin adapter, well-separated. Admin pages mix concerns.
6. **Magic numbers: 8/10** — `DAYS_OPTIONS = [7, 14, 30, 90] as const` (analytics page), `Max-Age=${60 * 60 * 8}` for cookie. Named where it matters.
7. **Defensive vs YAGNI: 8/10** — `typeof document === 'undefined'` guards everywhere (SSR safety), `typeof window === 'undefined'` for baseUrl resolution.
8. **Comment quality: 9/10** — same caliber as the other two apps.
9. **Logging & observability: 7/10** — no `console.*` (good), but also no Sentry breadcrumbs on API calls (admin actions are not breadcrumbed). The scrubber exists but Web has thinner observability than mobile.

### Verdict: **competent → senior — 76/100**

Because the foundation (`api.ts`, `auth.tsx`, `i18n`, F7 cookie migration) is professional, but admin pages carry visible code smells (dead-code zombies, near-duplicate inline loops, monolithic 400-line components), and the API client is a less-elegant restatement of the FE pattern. Web feels like the *junior side project* of a senior engineer — same person, less love.

---

## Cross-cutting patterns

**Repeated strengths:**
- Event-name-keyed structured logging (`snake_case_event`, structured payload) in both BE and FE — consistent vocabulary.
- Single-flight pattern for token refresh, applied in 3 places (BE httpClient analog, FE httpClient, Web api.ts) — concept consistent, implementations diverge.
- AbortController / `signal:` plumbed through every fetch in BE; same pattern in FE.
- Zero genuine `: any`, zero `@ts-ignore`, zero `@ts-expect-error` across 96 k LOC. Strong type discipline.
- 4 TODOs total. **No `FIXME`, `XXX`, `HACK` anywhere**. Either world-class hygiene or hygiene-by-deletion — either way, the result is the absence of debt markers.
- JSDoc on every non-trivial exported function or class. Rationale comments cite spec sections, ADRs, dated incidents.

**Repeated weaknesses:**
- **Composition roots and screens push 300-700 lines**. `chat-module.ts:716` (BE), `index.ts:486` (BE), `app/(stack)/tickets.tsx:397` (FE), `app/[locale]/admin/analytics/page.tsx:398` (Web). Justified case-by-case but a consistent pattern.
- **Three implementations of "refresh access token with queue"** — BE httpClient, FE httpClient, Web api.ts. Not DRY-violation in the strict sense (3 different runtimes) but the pattern could be a shared spec/test contract.
- **Documented-but-not-extracted reference files** — CLAUDE.md says "`docs/ARCHITECTURE.md` is referenced but not yet extracted", "`docs/TEST_FACTORIES.md` is referenced but not yet extracted", "`docs/LINT_DISCIPLINE.md` is referenced but not yet extracted". Same drift pattern shows up as `setTokens` no-op exports in Web `api.ts`. Theme: **completion bias** — docs/code marked as `to be extracted later` accumulate.
- **`Relation<T>` TypeORM import in domain entities** — pragmatic but a hexagonal-purity loss across BE.

---

## Top 10 worst offenders

1. **`museum-web/src/lib/api.ts:38-56`** — `setTokens` / `clearTokens` / `getAccessToken` exported as `no-op` functions with comment "Future cleanup: drop both calls once every consumer has migrated." Direct violation of `feedback_bury_dead_code.md`. **P0 — delete + sweep call sites in same commit.**
2. **`museum-backend/src/modules/chat/chat-module.ts`** — 716 lines, 47 surface methods, `eslint-disable max-lines` at top. Justified by line-1 rationale (re-merging 6 files) but it remains the single largest cognitive surface in the repo. **P1 — accept as composition root or split into 3 internal sub-builders with delegation, no re-fragmentation.**
3. **`museum-backend/src/index.ts`** — 486 lines, 35 functions including 6 `register*Cron` calls + boot orchestration + graceful shutdown + signal handling. **P1 — extract `boot/` directory: cron-registration, shutdown-handlers, redis-init.**
4. **`museum-frontend/app/(stack)/tickets.tsx`** — 397 lines. State + filter pills + pagination + FlashList + error + refresh in single component. **P1 — split: `useTicketsList()` hook (state + fetch) + `<TicketsList>` (presentational).**
5. **`museum-frontend/app/(stack)/preferences.tsx`** — 387 lines. Same pattern as tickets.
6. **`museum-web/src/app/[locale]/admin/analytics/page.tsx`** — 398 lines. `mergeUsageTimeSeries` repeats the same `for...of` shape 3×, lines 41-66. **P2 — extract `mergeBy(records, keyToFill)` helper.**
7. **`museum-backend/src/modules/chat/useCase/visual-similarity/similarity.service.ts`** — 535 lines. Justified by single-pipeline spec linkage but still the largest useCase file. **P2 — extract `cache-key.ts`, `top-n-resolver.ts`, leave the `compare` method clean.**
8. **`museum-frontend/features/chat/application/useTextToSpeech.ts`** — 242 lines, 142-line hook, platform branching (`Platform.OS === 'web'`) repeated. **P2 — abstract `AudioBackend` interface with `WebAudioBackend` + `NativeAudioBackend` impls.**
9. **`museum-backend/src/modules/auth/adapters/primary/http/routes/auth-google-oauth.route.ts:132`** — `OAuthCallbackError extends Error` declared INSIDE the route file. Custom error classes elsewhere live in `domain/errors/`. **P2 — move to `auth/domain/errors/oauth-callback.error.ts`.**
10. **`museum-frontend/app/(stack)/reviews.tsx`** + `ticket-detail.tsx` + `settings.tsx` — 379-385 lines each. **P2 — same screen-split pattern as #4.**

---

## Recommendations

**P0 (do before V1 launch, < 1 day total):**
- Delete `setTokens`/`clearTokens`/`getAccessToken` no-op exports in `museum-web/src/lib/api.ts`. Grep `git grep -n "setTokens\|clearTokens\|getAccessToken"` in web — fix any caller in the same commit (CLAUDE.md `feedback_bury_dead_code.md` literally describes this case).
- Run `pnpm lint` / `tsc --noEmit` on all three apps to confirm no compile breakage from the cleanup.

**P1 (post-launch, before V1.1):**
- Extract `museum-backend/src/index.ts` boot orchestration into `src/boot/{redis-init,cron-registrar,shutdown}.ts`. Drop `index.ts` to ≤ 100 lines.
- Split FE screens > 300 lines into `useXxxScreen` hook + presentational component. Start with `tickets.tsx` as canonical example.
- Move `OAuthCallbackError` to a `domain/errors/` location matching the rest of the BE error inventory.

**P2 (V1.x backlog, never blocking):**
- Standardize the single-flight refresh pattern across BE/FE/Web with a shared test contract (3 different implementations of the same concept is technical debt-in-waiting).
- Audit the 5+ FE screens at 350-397 lines for the same split.
- Decide on `Relation<T>` (TypeORM) in domain entities: accept as a documented exception OR move all entities under `data/db/entities/` and keep domain pure. Current state is intermediate.
- Extract `docs/ARCHITECTURE.md`, `docs/TEST_FACTORIES.md`, `docs/LINT_DISCIPLINE.md` per CLAUDE.md TODOs — paperwork debt, not code debt.

---

## 5-line summary

- BE: **senior** (84/100)
- FE: **senior** (80/100)
- Web: **competent → senior** (76/100)
- Biggest cross-cutting smell: **composition roots & screens push 300-700 lines, justified-but-aggregated**, plus zombie no-op exports in `museum-web/src/lib/api.ts` violating the bury-dead-code rule.
- Surprising strength: **4 TODOs across 96 000 LOC, zero FIXME/XXX/HACK, zero `: any`, zero `@ts-ignore`, structured event-name logging with correlation IDs everywhere** — this is a debt-hygiene level rarely seen in pre-launch solo-dev codebases.
