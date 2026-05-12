# 04 — KISS analysis
**Date:** 2026-05-12  **Agent:** AGENT-04

## Verdict

- Over-engineering score 0-100 (lower = simpler):
  - **BE: 72** — hexagonal cosplay (16 repo interfaces × 1 impl), 161-file chat module, 716-line composition root, 24 Stryker configs, 25 Prom metrics + Sentry + OTel + Langfuse, 4-tool web-search abstraction, 120 env vars. Most pay-down candidates here.
  - **FE: 58** — ui/application/infrastructure/domain layering replicated across 13 features, 4-strategy SendMessage system in a one-user mobile send box, 8 fully-translated locales pre-launch, AuthContext.tsx at 316 lines holding everything.
  - **Web: 22** — landing + admin, mostly flat, no premature abstractions. Two lockfiles is the only smell.
- **Under-engineering hotspots: 4** (TOTP encryption key rotation, LLM cost ceiling enforcement, audit-chain breakage recovery, FE refresh-token race).
- **Net read (1 paragraph):** The backend is a textbook "enterprise pattern" build — hexagonal everywhere, ports per concept, breaker/cache wrappers stacked, mutation testing harness — applied to a solo-dev pre-launch product with one PG database, one S3, one Brevo, one OpenAI primary, one mobile + one web client. ~70% of the abstraction layer is paying interest on a future that may or may not arrive. The good news: most of it is *coherent* over-engineering (consistent ADR-backed patterns), not chaotic. The bad news: ~9-12k lines of BE code are pure scaffolding; deleting interfaces alone would not change runtime by one byte. The two genuinely justified abstractions are `CacheService` (3 impls, swap matters in tests/dev) and `WebSearchProvider`/`KnowledgeBaseProvider` (real polymorphism in fallback chain). The FE replicates the BE's layering doctrine where it brings minimal value for a mobile UI. The web is the healthiest of the three. **Net call: backend has ~3-4 weeks of code to delete before launch; FE could shed 1 week of layering; web is fine.**

## Method

- Counted ports + implementations: `grep -rE "implements <Port>"` across `museum-backend/src` (16 repo ifaces, 22 named *Port interfaces, ~40 secondary adapters).
- Read composition root `chat-module.ts` (716L, single `ChatModule` class) + select use-cases.
- Sampled BE source file sizes (top-10 over 400L all in `chat` module).
- Counted env vars in `.env.example` (BE: 120) + audited feature flags vs. doctrine.
- Counted FE strategies / locales / hooks per feature.
- Counted CI workflows (20) + Stryker configs (24).
- Skipped: migrations, generated openapi.ts, node_modules, lockfiles, .stryker-tmp sandboxes.

---

## P0 — Over-engineering (pay-down candidates)

### P0-1 — Sixteen repository interfaces with exactly one TypeORM implementation each

**Files (16):**
```
museum-backend/src/modules/auth/domain/{user,refresh-token,api-key,totp,consent,social-account}/...repository.interface.ts
museum-backend/src/modules/{chat,museum,admin,review,support}/domain/.../repository.interface.ts
museum-backend/src/modules/chat/domain/{session,memory,art-keyword,visual-similarity}/...repository.interface.ts
museum-backend/src/shared/audit/audit.repository.interface.ts
```

**Evidence:**
```
$ for iface in IUserRepository IRefreshTokenRepository IMuseumRepository ...; do
    grep -rE "implements $iface" museum-backend/src | wc -l
  done
1 1 1 1 1 1 1 1 1 ...   # All exactly 1 impl.
```

`museum-backend/src/modules/auth/domain/user/user.repository.interface.ts` = 173 lines (interface only), `user.repository.pg.ts` = 291 lines (impl). The interface duplicates every method signature of the concrete class with JSDoc.

**Severity: P0**  (volume + locks-in pattern across the codebase)

**Why over-engineered for solo pre-launch:** Hexagonal repository ports earn their keep when (a) you actually swap PG for another store in tests (mock DB instead of TypeORM SQLite), or (b) you genuinely plan a second backend (DynamoDB, MongoDB). Here, tests use TypeORM with PG (e2e) or vitest mocks of the *implementation class* (unit). Zero real swap. The interface is documentation-by-contract for one consumer.

**Simpler replacement:** Delete the 16 interface files. Use the concrete TypeORM classes directly. Type the constructor params as `TypeOrmChatRepository` instead of `ChatRepository`. Tests can still mock with vitest `vi.mocked()` or hand-rolled fakes — interface not required.

**Saved:** ~1500 LOC of interface duplication, 16 imports per use-case wired correctly. Eliminates the "edit interface + edit impl + edit useCase = 3 files for 1 method addition" tax.

**Risk of leaving it:** Low immediate, but every new use-case pays the ceremony. Junior reviewers / future agents waste time hunting interface/impl pairs. Each new method = 3 edits.

**Counter-argument worth flagging:** The auth + audit interfaces are the *only* ones plausibly worth keeping if you go SOC2 — auditors like to see Repository pattern as a "DB abstraction layer". Pre-launch, not yet.

---

### P0-2 — `chat-module.ts` composition root: 716 lines, 50+ imports, one giant `ChatModule` class

**File:** `museum-backend/src/modules/chat/chat-module.ts`

**Header comment admits it:**
```ts
/* eslint-disable max-lines -- JUSTIFIED: composition root for the chat module.
   The previous split across 6 files (chat-module.ts + compare-wiring + knowledge-router-wiring
   + wikidata-wiring + singleton + wiring.ts, 922L total) existed only to game ESLint
   max-lines:400; the inline docblocks of those files admitted as much.
   Reunifying restores ordering invariants in one place. */
```

**Severity: P0** (re-unified file is honest but the underlying module is still a sprawl)

**Why over-engineered:** 50+ collaborator imports for one Express module is a smell. The chat module owns 161 .ts files; the composition root has to instantiate them in dependency order. The fact that the previous split was admitted as line-budget-gaming is correct — but the root cause (too many collaborators per chat request) was not fixed, only re-aggregated.

**Simpler replacement:** Collapse the orchestrator wrapping. The current call chain on a single POST `/messages` traverses: route → `ChatService` (490L) → `ChatMessageService` (469L) → `ChatOrchestrator` interface → `LangChainChatOrchestrator` (476L, split across 4 support files for 1100L total) → `LlmSectionRunner` (365L) → `LlmPromptBuilder` (448L) → `LlmCacheServiceImpl` → adapter. 7 layers, 3000+ lines, all in service of: `[prompt] → openai.chat.completions.create() → [text]`.

Many of these are valuable individually (cache, sections, prompt builder). But the abstraction layer between `ChatService` and `ChatOrchestrator` is pure indirection — there is exactly one orchestrator implementation (`LangChainChatOrchestrator`) and no plan for a second.

**Recommended cuts (P0 first wave):**
1. Drop `ChatOrchestrator` interface; type `ChatService` against `LangChainChatOrchestrator` directly. Saves the port file + 1 layer of mental model.
2. Drop `chat-orchestrator.port.ts` interface — it has zero implementations beyond LangChain.
3. Merge `ChatMessageService` into `ChatService` (no test or run-time benefit to split).

**Saved:** ~1000 LOC + 2 layers of indirection. Same runtime behavior.

**Risk of leaving:** Low correctness risk; high cognitive tax. Every new chat feature touches 4-7 files.

---

### P0-3 — Stryker mutation-testing harness: 24 config files

**Files:** `museum-backend/stryker/*.config.mjs` (24 files: audit, auth, baseline, middleware, module-auth-totp, shared-cache, shared-db, shared-email, shared-http, shared-i18n, shared-memory-cache, shared-misc, shared-nominatim-client, shared-overpass-client, shared-password-breach-check, shared-queue, shared-resilient-cache, shared-routers, shared-string-similarity, shared-utils, shared-validation, shared-zod-issue, so, config).

**Plus:** `.stryker-tmp/` directory with multiple sandbox copies (~12 in this snapshot), `scripts/stryker-hot-files-gate.mjs`, `reports/stryker-incremental.json`, dedicated CI job logic.

**Severity: P0** (engineering capital sink for solo dev pre-launch)

**Why over-engineered:** Mutation testing is a late-stage quality reinforcement for *mature* codebases with stable APIs. For a pre-launch product where the chat pipeline doctrine still inverts every sprint (ADR-001 SSE deprecated 2026-05-03, ADR-036 cache layer collapsed 2026-05-08, ADR-037 SigLIP swap 2026-05-10), mutation tests *codify yesterday's design* and slow tomorrow's refactor.

**Simpler replacement:** Keep Stryker on **one** target — security-critical primitives (TOTP encryption, password hashing, JWT signing, audit-chain hash). Delete the other 20 configs. Re-introduce per-module after launch + B2B revenue, when test pyramid stabilizes.

**Saved:** Engineering attention. ~24 config files. CI minutes. The `.stryker-tmp` orphans suggest jobs sometimes don't clean up.

**Risk of leaving:** Real risk = drag on refactor velocity. Every feature touching a covered module risks killing mutants and triggering CI red.

---

### P0-4 — 22 *Port interfaces in `museum-backend/src` — most with 1 implementation

```
$ count implementations per Port interface in chat module:
  AdvancedGuardrail:   1
  ChatOrchestrator:    1
  ImageProcessorPort:  1
  KnowledgeRouterPort: 1
  LlmJudgePort:        1
  OcrService:          1
  TextToSpeechService: 1   (+ 1 DisabledTextToSpeechService stub)
  AudioStorage:        2   (S3 + Local stub)
  AudioTranscriber:    2   (OpenAI + Disabled stub)
  EmbeddingsPort:      2   (Replicate + SigLIP-ONNX) ← genuine swap
  ImageStorage:        2   (S3 + Local stub)
  PiiSanitizer:        2   (Regex + ?)
  KnowledgeBaseProvider: 4 (Wikidata + Breaker + WriteThrough + Disabled) ← genuine
  WebSearchProvider:   7   (Google + Brave + Tavily + DuckDuckGo + SearXNG + Fallback + Disabled) ← genuine
  ImageSourceClient:   3   (Unsplash + Wikimedia + Musaium-catalogue) ← genuine
```

**Severity: P0** (15 of 22 are pay-down candidates)

**Justified ports (keep):** `WebSearchProvider`, `KnowledgeBaseProvider`, `ImageSourceClient`, `EmbeddingsPort`, `CacheService`. Real polymorphism, multiple production implementations, fallback chains.

**Unjustified (delete the port, keep the concrete class):**
- `ChatOrchestrator` (1 impl, no plan for second)
- `ImageProcessorPort` (1 impl: SharpImageProcessor)
- `OcrService` (1 impl + Disabled stub — the stub is conditionally enabled via env, but a simple `if (env.ocrEnabled)` in the consumer is simpler)
- `TextToSpeechService` (same: 1 + stub, replaceable by null check)
- `AdvancedGuardrail` (1 impl: LLMGuardAdapter)
- `LlmJudgePort` (1 impl, lives next to its only consumer)
- `KnowledgeRouterPort` (1 impl: KnowledgeRouterService — internal service, no swap need)
- `PiiSanitizer` (2 impls but second one is a no-op test stub)

**Saved:** ~8 port files + the import discipline of typing useCases against the port type.

**Risk of leaving:** Coherent over-engineering, low immediate harm. But each one is a small tax compounded.

---

### P0-5 — FE chat `sendStrategies/` directory: 4 strategy files for a 1-user mobile send box

**Files:** `museum-frontend/features/chat/application/sendStrategies/{sendMessageAudio,sendMessageCache,sendMessageOffline,sendMessageStreaming,sendStrategy.shared,sendStrategy.types,index}.ts` (479L total, 7 files).

`sendStrategy.types.ts` defines a `SendMessageContext` bag with **20+ fields** to pass between strategies (ports, state mutators, refs, classifier, etc.). This is the "long parameter list → context bag" anti-pattern, surfacing the real complexity hidden by the pseudo-Strategy.

**Severity: P0**

**Why over-engineered:** Strategy pattern in OOP earns its keep when (a) strategy choice is dynamic at runtime AND (b) strategies vary along the same abstract operation. Here, the chosen strategy is *known statically* at the call site: audio? offline? cache hit? text streaming? It's a 4-way if-else dressed as a class hierarchy.

**Simpler replacement:** One `sendMessage()` function with 4 internal branches:
```ts
async function sendMessage(input: SendMessageInput, ctx: ChatContext) {
  if (input.audio) return sendAudio(input, ctx);
  if (!ctx.isConnected) return enqueueOffline(input, ctx);
  const cached = ctx.cacheLookup({...});
  if (cached) return commitCachedAnswer(cached, ctx);
  return streamFromServer(input, ctx);
}
```
Inline functions, no shared context bag struct, ~250 LOC saved.

**Risk of leaving:** Adds cognitive overhead for every chat feature change. Tests have to mock the context bag — currently 20+ fields per send strategy test setup.

---

### P0-6 — FE 4-layer hexagonal-style folder structure replicated in every feature

```
museum-frontend/features/<feat>/
  ui/                ← React Native components
  screens/           ← (in auth) Expo Router screens
  application/       ← hooks + business orchestration
  infrastructure/    ← API clients + storage
  domain/            ← types + pure functions
```

Done in: `chat`, `auth`, `art-keywords`, `daily-art`, `review`, `museum`, `onboarding`, `conversation`, `settings`, `support` (10 of 13 features).

**Severity: P0**

**Why over-engineered for an RN mobile app:** This is BE hexagonal architecture transplanted to the UI. The "domain" folder in `art-keywords/` and `chat/` contains 1-2 small `contracts.ts` files; in `auth/` it's one 43-line `.pure.ts`. The split exists to satisfy a doctrine, not to enable testing or swap (FE tests just call into `application/` hooks).

**Simpler replacement:** Drop `domain/` (move contracts.ts up). For most features collapse `application/` into the screen file unless logic is >100 LOC. Keep `infrastructure/<feature>Api.ts` as the only "ports" abstraction.

**Saved:** ~30 folders, simpler imports, less recursion in `find` results.

**Risk:** Low. Mobile feature growth is screen-driven, not domain-driven.

---

### P0-7 — 24 GH Actions workflows + 4 observability stacks pre-launch

**CI workflows (20 in `.github/workflows/`):** `ci-cd-backend`, `ci-cd-mobile`, `ci-cd-web`, `ci-cd-openapi-diff`, `ci-cd-promptfoo`, `ci-cd-llm-guard`, `codeql`, `semgrep`, `team-quality-regression`, `cosign-sign-image`, `cosign-verify-deploy`, `tls-cert-monitor`, `tls-renewal`, `redis-rotation-reminder`, `breach-72h-timer`, `audit-chain-nightly`, `db-backup-daily`, `db-backup-monthly-restore-drill`, `sentinel-mirror`, `deploy-privacy-policy`.

**Observability layers on BE:** Sentry + OpenTelemetry (`@opentelemetry/sdk-node`, `auto-instrumentations-node`, `exporter-trace-otlp-http`) + Prometheus (25 custom metrics in `prometheus-metrics.ts`) + Langfuse (`langfuse.client.ts`).

**Severity: P1** (collectively P0, individually P1 — most are pre-launch capital that *will* matter, just not before launch).

**Worth pruning pre-launch:**
- `ci-cd-promptfoo` + `ci-cd-llm-guard` overlap with `team-quality-regression` — pick one prompt-eval pipeline.
- `cosign-sign-image` + `cosign-verify-deploy` are over-built for pre-revenue (no supply-chain attacker is targeting a V1 launch).
- Sentry + OTel both produce error+trace data. Recent commits in git log (`58817475`, `37cf8d30`, `a739f4a3`, `5eb85224`) are *literally* about Sentry+OTel listener-count duplication — that's the cost showing. Pick one.
- Langfuse is pre-revenue overhead: tracking LLM cost/quality matters most when you have B2B contracts referencing SLAs. Free-tier is fine post-launch.

---

## P0 — Under-engineering (build-up candidates)

### P0-U-1 — TOTP encryption key rotation not implemented

**File:** `museum-backend/src/modules/auth/useCase/totp/totpEncryption.ts` (98L, 1 hard-coded encryption secret)

**Evidence:** Looking at the file alongside `museum-backend/src/config/env.ts:218` and the env comment "Sharing a single secret across signing domains means a rotation (or compromise) cascades" — the *awareness* is there in comments, but TOTP secrets are encrypted at rest with a single env-derived key that has no rotation path.

**Severity: P0** for a B2B-marketed product. If `TOTP_ENCRYPTION_KEY` is ever compromised (server snapshot leak, env dump in a log line), all TOTP secrets are decryptable retroactively. There is no key-id field, no envelope encryption, no rotation runbook.

**Simpler safer replacement:** Implement envelope encryption: key-ID column on `totp_secret`, KEK rotation path that re-wraps DEKs. Or: leverage AWS KMS / GCP KMS for one-line rotation. Pre-launch this is 1-2 days work and removes a real audit blocker.

**Risk of leaving:** Compliance blocker for B2B SOC2/ISO27001. One leaked snapshot = one CVE-equivalent disclosure.

---

### P0-U-2 — LLM cost ceiling enforcement not visible

**File search:** No `dailySpendLimit`, `costCeiling`, `OPENAI_MAX_DAILY_COST`, or per-user monthly-spend gate found in `museum-backend/src`. The only related ceiling is `guardrail-budget.ts` (LLM-judge ceiling, not the *real* OpenAI bill).

**Severity: P0** — solo dev + freemium B2C + OpenAI pay-per-token = direct exposure to runaway-loop attacks (a malicious user spamming the chat endpoint can rack up €€€ in hours).

**Simpler replacement:** Add a daily token budget per user (Redis counter, fail-fast at threshold) + a global per-day kill-switch (Redis counter the rate-limit middleware reads). 2-3 hours of work.

**Risk of leaving:** First day of public V1 launch where one Twitter screenshot points to your free chat = bankruptcy story. The auth middleware exists, IP rate-limit exists, but **per-user OpenAI cost ceiling does not**.

(Note: confirm by grep — this finding could be wrong if cost ceiling lives in a different naming convention; flagging for verification rather than asserting bug.)

---

### P0-U-3 — Audit chain has no automated breakage recovery runbook

**Files:** `museum-backend/src/shared/audit/audit-chain.ts` (124L), `audit-chain-verifier.ts` (100L), `audit-chain-cli-core.ts` (56L), `audit-chain-nightly.yml` workflow.

**Severity: P1** (under-engineered relative to the over-engineering of the chain itself)

The hash chain is *built* (SHA-256 row-hash + prev-hash linkage, cryptographically sound). The nightly verifier exists. **What happens when verification fails** is unclear — there's no runbook visible, no auto-create incident, no fix-forward path documented in code. For a feature this load-bearing for SOC2, the "what next" is more important than the "how it works".

**Simpler replacement:** Document the recovery in `audit-chain-cli-core.ts` header — exactly what an operator does at 2am when the nightly verifier emits "chain broken at row #123456". A 30-line markdown comment in the file beats a missing runbook.

**Risk:** Audit chain is moot if you can't operationally respond to its failure.

---

### P0-U-4 — FE refresh-token race not obviously gated

**File:** `museum-frontend/features/auth/infrastructure/authApi.ts` (283L), `museum-frontend/features/auth/application/AuthContext.tsx` (316L)

Looked for a single-flight or mutex pattern around the refresh-token call (when 3 concurrent failed API calls hit 401, only 1 should refresh). Did not find an obvious lock — could be there in `AuthContext`, but the file's size (316L) makes it un-obvious. UFR-013: not asserting bug, asking the lead to verify.

**Severity: P2 → P1 if confirmed missing**

---

## P1 — Notable smells

### P1-1 — `Semaphore` class wraps `p-limit` to add 2 features

**File:** `museum-backend/src/modules/chat/useCase/llm/semaphore.ts` (108L)

Wraps `p-limit` adding (a) bounded queue + (b) acquire-timeout. Comments are honest about why. **Defensible** if the bounded-queue protects against memory blow-up on a stuck LLM provider — which is the genuine production concern. Marginal smell, not a bug.

**Verdict:** Keep. Add a one-liner usage comment.

---

### P1-2 — `ResilientCacheWrapper` (125L) wraps every cache impl in try/catch

**File:** `museum-backend/src/shared/cache/resilient-cache.wrapper.ts`

Justified as "banking-grade contract: cache is a performance accelerator, not a primary dependency". 11 methods, 11 try/catches that all log + return null/false/empty. Reasonable abstraction but boilerplate-heavy.

**Simpler:** Higher-order function `withFallback(cacheMethod, defaultValue)` would compress all 11 methods to ~30 LOC. Or accept the boilerplate — class is correct.

**Verdict:** Cosmetic. Keep.

---

### P1-3 — 7-file Overpass client split

```
museum-backend/src/shared/http/overpass-{client,transport,constants,cache,types,tags,queries}.ts  (683L total)
```

Looks like a max-lines:400 game played for one HTTP client. The orchestration could live in 2-3 files (`overpass.client.ts` + `overpass.types.ts` + `overpass-cache.ts`).

**Risk of leaving:** Low; just file-explorer noise.

---

### P1-4 — `dormant` modules kept in tree contra "bury dead code" doctrine

**Files:**
- `museum-backend/src/modules/chat/adapters/primary/http/routes/chat-message.sse-dormant.ts` (132L)
- `museum-backend/src/modules/chat/adapters/primary/http/helpers/sse.helpers.ts` (45L) — only consumer is the dormant file
- `museum-backend/src/modules/chat/adapters/secondary/llm/langchain-orchestrator-stream.ts` (76L) — partially used (`StreamBuffer` is live, but the SSE streaming surface is not)

The dormant file's header doc says "Status: DEACTIVATED since V1 ... Revival scheduled for V2.1 post-Walk feature". Per `feedback_bury_dead_code.md`: "Dead code = deleted same commit, no DEPRECATED markers, no zombie stubs."

**Severity: P1** — direct doctrine contradiction. 132+45 = 177 LOC of zombie code with a "revival plan" that may never happen.

**Simpler:** `git rm` it. Recover from `git log` if/when V2.1 ships.

---

### P1-5 — Feature flag remnants in `.env.example` contradict pre-launch doctrine

**File:** `museum-backend/.env.example`

Contains:
```
TTS_ENABLED=true
FEATURE_FLAG_WEB_SEARCH=true
FEATURE_FLAG_KNOWLEDGE_EXTRACTION=true
FEATURE_FLAG_STREAMING=true
FEATURE_FLAG_USER_MEMORY=true
FEATURE_FLAG_MULTI_TENANCY=true
FEATURE_FLAG_VOICE_MODE=true
FEATURE_FLAG_OCR_GUARD=false
FEATURE_FLAG_API_KEYS=false
CACHE_ENABLED=true
```

Most are unused at runtime (verified: `TTS_ENABLED` is annotated "retired" in `env.ts:218`; `FEATURE_FLAG_*` mostly orphan). `OCR_GUARD` and `API_KEYS` *are* used. Per the doctrine in memory `feedback_no_feature_flags_prelaunch.md`: "no `*_ENABLED` flag pre-launch".

**Severity: P1** — pollutes the env file, sends confusing signal to future agents.

**Simpler:** Delete the dead flags from `.env.example`. Make the two real ones (`FEATURE_FLAG_OCR_GUARD`, `FEATURE_FLAG_API_KEYS`) either runtime-on (delete the flag) or commit to keeping them off and removing the wiring.

---

### P1-6 — 8 fully-translated locales pre-launch with 956 lines each

**Files:** `museum-frontend/shared/locales/{ar,de,en,es,fr,it,ja,zh}/translation.json` — all identical 956-line size.

**Severity: P1** — almost certainly machine-translated to keep parity; every string change is now 8× the work in PR review, even if linkup is automated.

**Simpler pre-launch:** Ship V1 with `fr` + `en` only. Add `es`/`it`/`de` post-revenue when a B2B contract demands it. Keep `ar`/`ja`/`zh` for after multilingual marketing fit. Delete the inactive locale files for now (or fence them behind a "stable locales" list in `app.config`).

**Risk of leaving:** Maintenance tax + bad-translation embarrassment risk (each museum-domain term in `ja`/`ar` is statistically wrong without a native review).

---

### P1-7 — 4 observability stacks (Sentry + OTel + Prometheus + Langfuse) generating known dedup pain

**Files involved:** `museum-backend/src/shared/observability/{sentry,opentelemetry,prometheus-metrics,langfuse.client,chat-phase-timer,metrics-context,sentry-scrubber,safeTrace}.ts` (1089L total)

**Evidence in git log:**
```
58817475 fix(auth,mobile): strip fragment in OAuth deeplink parser + diag log
37cf8d30 revert(observability): remove setMaxListeners + diagnostic — back to Node default cap of 10
9471649d audit-cleanup 2026-05-12 — 4-agent parallel sprint
5eb85224 diag(observability): instrument finish-listener count per request
a739f4a3 fix(observability): Sentry+OTel dedup — root cause of 21-listener spam, not the cap
```

3 of the last 5 commits are observability dedup bugs.

**Simpler pre-launch:** Sentry only. Drop OTel + Langfuse + most custom Prom metrics until they're actually solving a problem. Keep `/health` + `/metrics` for ops basics. Re-add OTel when the second backend instance ships.

**Risk of leaving:** Continued listener-count whack-a-mole. Real bug exposure.

---

### P1-8 — `ChatService` ctor takes ~30 dependencies

**File:** `museum-backend/src/modules/chat/useCase/orchestration/chat.service.ts:80-130`

The deps interface has 26+ optional/required fields (`repository`, `orchestrator`, `imageStorage`, `imageProcessor`, `audioStorage`, `audioTranscriber`, `tts`, `ocr`, `piiSanitizer`, `advancedGuardrail`, `advancedGuardrailObserveOnly`, `artTopicClassifier`, `llmJudge`, `llmJudgeEnabled`, `audit`, `cache`, `museumRepository`, `userMemory`, `knowledgeBase`, `knowledgeRouter`, `imageEnrichment`, `webSearch`, `dbLookup`, `extractionQueue`, `locationResolver`, `locationConsentChecker`, `urlHeadProbe`). Construction is delegated to 3 sub-services (`ChatSessionService`, `ChatMessageService`, `ChatMediaService`).

**Smell:** A class with 26 collaborators is doing the job of 3-4 cohesive modules.

**Simpler:** The 3 sub-services already exist. Drop the wrapping `ChatService` and let the route directly call `ChatMessageService.postMessage()`, `ChatSessionService.createSession()`, etc. The wrapper adds zero value.

---

## P2 — Minor

### P2-1 — `museum-web` has both `pnpm-lock.yaml` and `package-lock.json`

```
$ ls museum-web/*lock*
museum-web/pnpm-lock.yaml
museum-web/package-lock.json
```

One is stale. CLAUDE.md says web is pnpm. Delete `package-lock.json`.

### P2-2 — `design-system/` also has both lockfiles

Same fix.

### P2-3 — Custom semaphore tracks `_inFlight`/`_waiting` to "shadow p-limit's deferred microtask"

Marginally clever but the test reliance on synchronous counters means tests are coupled to internal microtask timing. Use `p-limit`'s public `activeCount`/`pendingCount` and add a `flushMicrotasks()` helper in tests.

### P2-4 — `.stryker-tmp/` orphan sandbox dirs in repo

```
museum-backend/.stryker-tmp/sandbox-{iGHFgm,pNWOxd,dHjYTh,8Duill,...}
```

Should be gitignored or cleaned on `pnpm test` exit.

### P2-5 — `museum-backend/src/config/env.types.ts` = 564 LOC, `env.ts` = 459 LOC, `env-resolvers.ts` = 204 LOC, `env-helpers.ts` = 41 LOC, `env.production-validation.ts` = 261 LOC, `deployment-invariants.ts` = 120 LOC

1649 LOC for env loading. Defensible only if all 120 env vars are real. Audit which are dead/legacy and trim. Many are split between `*.production-validation` and `*.ts`.

### P2-6 — `chat-phase-timer.ts` (196L) — bespoke instrumentation harness

Likely justifiable if it drives a real Grafana panel; otherwise simpler to use OTel spans. Verify the Grafana dashboard references it.

### P2-7 — 16 BE middlewares

```
museum-backend/src/helpers/middleware/*.ts  (15+ files)
```

Per Express norms this is reasonable; each is small and focused. No action needed. Listed for completeness.

---

## Patterns observed

1. **Hexagonal Cosplay** (BE): Port-Adapter pattern applied universally regardless of real polymorphism need. 22 *Port interfaces, of which only 5 have multiple production implementations. This *was the explicit architectural decision* per CLAUDE.md, but the application is too uniform — the lesson "use hexagonal where you genuinely need to swap" got read as "use hexagonal always".

2. **Layer-per-concept**: Every concept gets its own `useCase/<concept>/` folder, then often its own `.service.ts` + sub-files. `chat/useCase/orchestration/` has 9 files; `chat/useCase/llm/` has 8. The result is high navigability for someone who knows the codebase + high spread-out cognitive load for a newcomer.

3. **Max-lines:400 gaming**: Multiple files exist *only* because hitting 400 LOC triggered a forced split (Overpass 7-file split, langchain-orchestrator 6-file split). The eslint-disable comment on `chat-module.ts` admits this. Either raise the budget to 600-800L (it's not 1995) or commit to genuine functional decomposition.

4. **Doctrine drift**: The codebase has multiple doctrines documented in memory + CLAUDE.md (no feature flags, bury dead code, KISS). The implementation drifted from each: 10 dead feature-flag env vars, dormant SSE module kept, hexagonal port-per-concept regardless of swap need.

5. **Pre-launch enterprise muscle memory**: Cosign image signing, TLS cert auto-monitoring, audit-chain cryptographic hash, mutation testing, OpenTelemetry full stack, 4-observer stack, encryption-at-rest infrastructure — these are 100% justified at series-B. At pre-launch with a solo dev, they collectively absorb attention that should be on launch-critical features (LLM cost ceiling, iOS 26 crash investigation noted in `project_ios26_crash_investigation.md` memory).

6. **FE mimics BE doctrine**: The frontend imports the backend's hexagonal vocabulary (`ui/application/infrastructure/domain`) without the same level of swap need. Mobile UI rarely benefits from this — features ship vertically.

7. **Genuine right-sized abstractions exist**: `CacheService` (3 impls) and `WebSearchProvider` (7 impls with real fallback) prove the pattern works *when there's a reason*. Use them as the proof-point for which abstractions to keep.

---

## Recommendations (simplification plan + buildup plan)

### Simplification plan (1-2 weeks pre-launch)

**Sprint 1 (3 days) — Repository interface cull:**
1. Delete the 16 repository interface files; type consumers against concrete TypeORM classes.
2. Delete `ChatOrchestrator`, `KnowledgeRouterPort`, `LlmJudgePort`, `AdvancedGuardrail`, `ImageProcessorPort`, `OcrService`, `TextToSpeechService` port files (1-impl only).
3. Update `chat-module.ts` imports to point at concrete classes.

Expected: ~2k LOC removed, no runtime change, build passes after import fixes.

**Sprint 2 (2 days) — Observability collapse:**
1. Pick Sentry **xor** OTel. Delete the other and its 4-5 files.
2. Drop Langfuse client (`langfuse.client.ts` + 99L).
3. Cut Prometheus metrics from 25 to ~8 (request duration, error rate, OpenAI cost, OpenAI requests, Redis up, DB up, audit-chain ok, queue depth).

Expected: 1 fewer source of dedup bugs, ~600 LOC removed.

**Sprint 3 (1 day) — Dead-code bury:**
1. Delete the SSE-dormant files (3 files, 253 LOC).
2. Delete dead feature flags from `.env.example`.
3. Delete unused locale files (keep `fr`, `en`; archive others).

**Sprint 4 (2 days) — FE flattening:**
1. Drop `domain/` subfolder in features where it has ≤1 file.
2. Collapse `sendStrategies/` into a single `sendMessage.ts` function.
3. Audit `application/` size; merge trivially-sized hooks into screens.

**Sprint 5 (1 day) — Stryker cull:**
1. Keep configs for: `auth`, `audit`, `shared-resilient-cache`, `module-auth-totp` (security primitives).
2. Delete the other 20 configs. Add back per-module if mutation score on the primitives reveals real gaps.

### Build-up plan (P0 under-engineering)

1. **TOTP envelope encryption + key-rotation runbook** — 2 days. Add `key_id` column on `totp_secret`, KMS-style wrap. Even a one-key-with-version is better than a single forever-key.
2. **LLM cost ceiling per user + global kill-switch** — 1 day. Redis counter, daily limit in env, hard 429 + Sentry alert at threshold.
3. **Audit-chain breakage runbook** — 0.5 day. 30-line markdown in `audit-chain-verifier.ts` header doc explaining ops response. (UFR-013: verify ops actually has a path before writing.)
4. **Verify FE refresh-token single-flight** — 0.5 day. Read `AuthContext.tsx` thoroughly; if missing, add a single Promise cache around refresh.

### Don't touch (right-sized)

- `CacheService` interface — 3 real impls, swap matters.
- `WebSearchProvider` + `KnowledgeBaseProvider` + `ImageSourceClient` — real polymorphism with fallback chain. Keep.
- `EmbeddingsPort` — Replicate ↔ SigLIP-ONNX swap is a live decision (ADR-037).
- `WikidataBreakerClient` — opossum-based, sound circuit breaker, justified.
- Audit chain *itself* (separate from the runbook gap) — defensible for SOC2 story.
- 16 BE middlewares — Express norm.
- Web app structure — already lean.

---

**Note on UFR-013 honesty:** The findings on TOTP key rotation, LLM cost ceiling, and FE refresh-token race are *suspected* gaps based on grep + scan of likely files. I did NOT run a full file-by-file read of the encryption module or AuthContext.tsx. Items marked P0-U-X should be verified by the lead before acting; flagging-for-verification rather than asserting bug. The repository-interface-count + Stryker-config-count + dormant-module + .env.example flag findings ARE verified directly from `grep`/`wc -l`/file reads documented above.
