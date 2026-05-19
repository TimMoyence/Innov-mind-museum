# Tech-debt × worktree collision report (2026-05-19)

> **Status** : DONE.
> **Sources** : `docs/HANDOFF-2026-05-18-tech-debt-investigation.md` (context) + `docs/TECH_DEBT.md` lines 761-1660 (88 TD entries) + git worktree inventories captured 2026-05-19.
> **Read-only investigation** : aucun code applicatif modifié, aucun /team spawn, aucun bypass hook.
> **UFR-013 honesty** : entries marked **needs-human-review** when the in-worktree state was not directly Read-verified.

---

## 1. Worktrees inventory

| Worktree | Branch | HEAD | Date HEAD | Ahead | Behind | Files changed | Uncommitted | Scope (inferred) |
|---|---|---|---|---|---|---|---|---|
| `InnovMind` | `main` | `d90e864c` | 2026-05-18 | — | — | — | (working dirty: `M .husky/pre-push`, `M CLAUDE.md`) | base + TECH_DEBT audit (lib-docs bootstrap + 88 TD) |
| `InnovMind-W1` | `feat/audit-360-w1-chat-hardening` | `6a4a1fd2` | 2026-05-18 17:42 | 29 | 9 | 224 (26A / 56D / 142M / 4R) | clean | chat hardening : C9.0..C9.17 (Langfuse trace, LLM cost gauge, anti-injection dedup, reranker scaffold, judge detach, SigLIP-2 upgrade, [META] parser sunset, mutation 84%+) |
| `InnovMind-W2` | `feat/audit-360-w2-ai-safety-voice` | `2e9b81bd` | 2026-05-18 11:11 | 3 | 9 | 162 | `M CLAUDE.md` (unstaged) | AI safety + voice + a11y : STT prompt biasing, voice-aware TTS cache key, Presidio integration, WCAG audio descriptions, Jest timeout 30s |
| `InnovMind-W3` | `feat/audit-360-w3-geo-walk-intra` | `f687b600` | 2026-05-18 15:03 | 8 | 9 | ~200 | `M CLAUDE.md` (unstaged) | geo-walk-intra + **merge of W4** : detect-museum endpoint + geofence + intra-musée QR + TD-44 Redis AUTH parity + dev-stack sentinels + ALL W4 work |
| `InnovMind-W4` | `feat/audit-360-w4-compliance-ops-release` | `c8c5db92` | 2026-05-18 10:00 | 2 | 9 | 155 | clean | compliance/ops/release : VDP runbooks (CNIL/ENISA/AI Act), distributed tracing middleware (BE+FE), Grafana dashboards, B2B pilot seed orchestrator, admin museums CRUD |

**Critical observation** : W3 contains the full W4 work as a merge commit (`f687b600 merge(w3+w4)`). Merging W3 thus merges W4 implicitly. **W4 standalone is redundant.**

**Critical observation 2** : All four worktrees branched off `5a01f5c` or earlier. Their `git diff main..HEAD` shows the lib-docs/ tree as "D" because main added it later (commit `685bc45c`) — these are not real deletions, they're "main-only additions". When merged, git keeps the lib-docs additions from main automatically (no conflict expected on lib-docs/).

**Real deletions in W1** (true UFR-016 burials, will propagate to main):
- `museum-backend/src/modules/chat/useCase/guardrail/art-topic-classifier.ts` (commit `33a9d4d5`, C9.9)
- `museum-backend/src/modules/chat/useCase/guardrail/eval/output-classifier.helper.ts`
- `museum-backend/src/modules/chat/adapters/secondary/search/duckduckgo.client.ts` (C9.15)
- `museum-backend/src/modules/chat/adapters/secondary/search/google-cse.client.ts`
- `museum-backend/src/modules/chat/adapters/secondary/search/searxng.client.ts`
- Plus their tests + fixtures

---

## 2. Cross-worktree file collision map

Files touched by 2+ worktrees (require ordered merge + conflict resolution):

| File | W1 | W2 | W3 | W4 | TD touchpoint |
|---|---|---|---|---|---|
| `museum-backend/src/modules/chat/useCase/llm/llm-prompt-builder.ts` | M | M | M | — | (TD-LC-05 indirect) |
| `museum-backend/src/modules/chat/useCase/llm/llm-sections.ts` | M | M | — | — | — |
| `museum-backend/src/modules/chat/useCase/message/chat-message.service.ts` | M | M | M | — | — |
| `museum-backend/src/modules/chat/useCase/orchestration/prepare-message.pipeline.ts` | M | M | M | — | — |
| `museum-backend/src/modules/chat/chat-module.ts` | M | M | M | — | — |
| `museum-backend/src/modules/chat/domain/ports/chat-orchestrator.port.ts` | M | M | M | — | — |
| `museum-backend/src/shared/observability/prometheus-metrics.ts` | M | — | M | — | TD-PC-03 |
| `museum-backend/src/shared/observability/trace-propagation.middleware.ts` | — | — | A | A | TD-SN-01/02 (related) |
| `museum-frontend/shared/observability/sentry-init.ts` | — | — | M | M | (no direct TD) |
| `museum-frontend/features/chat/application/chatSessionLogic.pure.ts` | — | M | — | — | TD-MD-02 |
| `museum-backend/src/modules/chat/adapters/primary/http/schemas/chat-session.schemas.ts` | — | M | M | — | — |
| `museum-frontend/app/(stack)/chat/[sessionId].tsx` | — | M | M | M | — |
| Locale files `museum-frontend/shared/locales/*/translation.json` (8 locales) | M | M | M | M | TD-I18N-02 (ar) |

The locale files are 4-way collision — every worktree adds strings. Ar/translation.json is especially noteworthy : all four worktrees touch it, but **TD-I18N-02 (missing AR plural keys at lines 1156-1157)** is unlikely to be already fixed by any of them (would require deliberate effort, not in scope of feature branches).

---

## 3. Per-TD classification

> Categories : **SAFE-NOW** (no worktree touches Evidence → fix on main now) / **WAIT-FOR-MERGE** (worktree touches file, deviation persists, fix is complementary post-merge) / **STALE-IN-WORKTREE** (deviation no longer exists after worktree merge → mark stale) / **COLLISION-RISK** (worktree modifies the zone of deviation in an ambiguous way → merge first, then re-audit).

### Cluster 1 — Sentry observability BE (4 TDs)

| TD | Severity | Category | Worktrees touching Evidence | Recommended action |
|---|---|---|---|---|
| TD-SN-01 🚨 | HIGH BLOCKER | **SAFE-NOW** (with ADR-045 caveat) | none touches `sentry.ts` / `opentelemetry.ts` / `package.json` directly. W3/W4 **add** `trace-propagation.middleware.ts` (header-based correlation, not SDK bridge) — **changes context** but doesn't fix TD-SN-01 SDK-bridge gap. | Resolve ADR-045 first (see §7). If decision = "header middleware is enough" → mark TD-SN-01 STALE-BY-DESIGN post-W3-merge ; if "still need `@sentry/opentelemetry` SDK bridge" → /team Cluster 1 post-W3-merge. |
| TD-SN-02 🚨 | HIGH BLOCKER | **SAFE-NOW** | `museum-backend/src/shared/observability/sentry.ts` NOT touched by any worktree. (FE `sentry-init.ts` already has `tracePropagationTargets` — that's a different file.) | Fix on main now: add `tracePropagationTargets: [/^https:\/\/api\.musaium\.com\//]` to BE `Sentry.init()` opts. 1-line change. |
| TD-SN-03 | MEDIUM | **SAFE-NOW** | `index.ts` and `instrumentation.ts` NOT touched. | Fix on main now: move `initSentry()` into `instrumentation.ts` BEFORE OTel init. |
| TD-SN-04 | LOW | **SAFE-NOW** | `sentry.ts` NOT touched. | Bundle with TD-SN-01/02/03. |

### Cluster 2 — Sentry observability Web (4 TDs)

| TD | Severity | Category | Worktrees touching Evidence | Recommended action |
|---|---|---|---|---|
| TD-SNXT-01 🚨 | HIGH BLOCKER | **SAFE-NOW** | `museum-web/sentry.client.config.ts` NOT touched. | Fix on main now: rename file to `instrumentation-client.ts`. |
| TD-SNXT-02 | MEDIUM | **SAFE-NOW** | `museum-web/src/instrumentation.ts` NOT touched. | Bundle with TD-SNXT-01. |
| TD-SNXT-03 | MEDIUM | **SAFE-NOW** | 3 sentry configs NOT touched. | Bundle with TD-SNXT-01. |
| TD-SNXT-04 | MEDIUM | **SAFE-NOW** | `museum-web/next.config.ts` NOT touched. | Bundle with TD-SNXT-01. |

### Cluster 3 — Sentry mobile (1 TD)

| TD | Severity | Category | Worktrees touching Evidence | Recommended action |
|---|---|---|---|---|
| TD-SRN-01 🚨 | MAJOR BLOCKER | **SAFE-NOW** | `museum-frontend/metro.config.js` NOT touched by any worktree. | Fix on main now: swap `getDefaultConfig` → `getSentryExpoConfig`. |

### Cluster 4 — prom-client (3 TDs)

| TD | Severity | Category | Worktrees touching Evidence | Recommended action |
|---|---|---|---|---|
| TD-PC-01 🚨 | HIGH BLOCKER | **SAFE-NOW** | `museum-backend/src/shared/observability/metrics-middleware.ts` NOT touched by any worktree. Confirmed line 23 still has `routePath ?? req.path`. | Fix on main now: replace fallback with literal `'unmatched'`. |
| TD-PC-02 🚨 | HIGH BLOCKER | **WAIT-FOR-MERGE** | W3 modifies `museum-backend/src/app.ts` (the route `app.get('/metrics', metricsHandler)` is at line 224 in W3 ; still unauthenticated — verified read). The fix (auth wrapper OR nginx allowlist OR separate port) is complementary to W3's changes (api.router.ts, trace-propagation.middleware.ts wiring). | Merge W3 first ; then /team Cluster 4 to add auth on `/metrics`. |
| TD-PC-03 | MEDIUM | **COLLISION-RISK** | Both W1 (cost gauge) and W3 (detect-museum metric) modify `prometheus-metrics.ts`. Naming convention (`musaium_*` prefix) decision affects new gauges added in BOTH branches. | Merge W1 + W3, then audit ALL metric names + decide naming convention in one pass. |

### Cluster 5 — JWT + Auth rate-limit (2 TDs)

| TD | Severity | Category | Worktrees touching Evidence | Recommended action |
|---|---|---|---|---|
| TD-JWT-01 🚨 | HIGH BLOCKER | **SAFE-NOW** | `museum-backend/src/modules/auth/adapters/secondary/social/google-oauth-state.ts` NOT touched by any worktree. | Fix on main now: 1-line add `algorithms: ['HS256']` to `jwt.verify`. |
| TD-EX-01 | MEDIUM BLOCKER | **SAFE-NOW** | None of the 7 route files (`auth-session.route.ts`, `mfa.route.ts`, `chat-message.route.ts`, `chat-media.route.ts`, `chat-compare.route.ts`) are touched by W1/W2/W4. **W3 touches `chat-session.route.ts` and `chat.route.ts` — DIFFERENT files** from the TD-EX-01 list. SAFE. | Fix on main now: /team Cluster 5 — reorder validator + rate-limiter at 7 sites. |

### Cluster 6 — Helmet CSP (3 TDs)

| TD | Severity | Category | Worktrees touching Evidence | Recommended action |
|---|---|---|---|---|
| TD-HEL-01 🚨 | MEDIUM BLOCKER | **WAIT-FOR-MERGE** | W3 modifies `museum-backend/src/app.ts` (line 124 = `createRateLimitMiddleware`, line 132 = `helmet(...)` ; verified ordering still rate-limit-before-helmet — deviation persists). | Merge W3 first ; then move `helmet()` immediately after `requestIdMiddleware`. |
| TD-HEL-02 🚨 | HIGH BLOCKER | **WAIT-FOR-MERGE** | W3 modifies `app.ts:86` (`connectSrc: ["'self'"]` still narrow — verified). | Merge W3 first ; then extend `connectSrc` allowlist. |
| TD-HEL-03 | MEDIUM | **WAIT-FOR-MERGE** | W3 modifies `app.ts:85` (`imgSrc` has S3 but not CloudFront / musaium.com / wikimedia — verified). | Merge W3 first ; bundle with TD-HEL-02. |

### Cluster 7 — React forms + state (5 TDs)

| TD | Severity | Category | Worktrees touching Evidence | Recommended action |
|---|---|---|---|---|
| TD-RHF-01 🚨 | CRITICAL BLOCKER | **SAFE-NOW** | `museum-frontend/app/auth.tsx` NOT touched by any worktree. | Fix on main now: migrate to `Controller` + surface `errors`. UFR-021 prevention. Highest priority. |
| TD-RHF-02 🚨 | HIGH BLOCKER | **SAFE-NOW** | Same file as TD-RHF-01. | Bundle with TD-RHF-01 in same /team run. |
| TD-REACT-01 🚨 | HIGH BLOCKER | **SAFE-NOW** | `museum-frontend/features/chat/application/useSessionLoader.ts` NOT touched. | Fix on main now: add `state.cancelled` flag (copy sibling hook pattern). |
| TD-REACT-02 | MEDIUM | **SAFE-NOW** | None of the 8 Context.Provider files are touched. | Codemod on main. 8 files, 1 line each. |
| TD-REACT-03 | MEDIUM | **SAFE-NOW** | `museum-web/src/app/[locale]/admin/users/[id]/page.tsx` NOT touched. | Fix on main. (W3/W4 add admin **museum** pages, but not the user page.) |

### Cluster 8 — RN gestures + modals (4 TDs)

| TD | Severity | Category | Worktrees touching Evidence | Recommended action |
|---|---|---|---|---|
| TD-RNGH-01 🚨 | HIGH BLOCKER | **WAIT-FOR-MERGE** | W3 modifies `museum-frontend/app/_layout.tsx` (adds `museums-picker` screen). Verified : still no `<GestureHandlerRootView>` wrapper at lines 157-217. | Merge W3 first ; then wrap Stack subtree. |
| TD-RNGH-02 🚨 | HIGH BLOCKER | **SAFE-NOW** | `museum-frontend/features/chat/ui/ArtworkHeroModal.tsx` NOT touched. | Fix on main now. |
| TD-RNGH-03 | MEDIUM | **SAFE-NOW** | Same file as TD-RNGH-02. | Bundle with TD-RNGH-02. |
| TD-RNGH-04 | MEDIUM | **SAFE-NOW** | `DailyArtCard.tsx` and `SwipeableConversationCard.tsx` NOT touched. | Fix on main now. |

### Cluster 9 — Mobile cert pinning (5 TDs)

| TD | Severity | Category | Worktrees touching Evidence | Recommended action |
|---|---|---|---|---|
| TD-SSL-01 🚨 | HIGH BLOCKER (if pinning on) | **SAFE-NOW** | `museum-frontend/app.config.ts` NOT touched. | See §7 open question first ; if pinning is ON pre-V1 → /team Cluster 9 ; if OFF → downgrade. |
| TD-SSL-02 | MEDIUM | **SAFE-NOW** | `cert-pinning.ts` NOT touched. | Bundle with TD-SSL-01. |
| TD-SSL-03 | MEDIUM | **SAFE-NOW** | `cert-pinning-init.ts` NOT touched. | Bundle with TD-SSL-01. |
| TD-SSL-04 | LOW | **SAFE-NOW** | `CERT_PINNING_RUNBOOK.md` NOT touched. | Documentation only, defer. |
| TD-SSL-05 | LOW | **SAFE-NOW** | Same. | Bundle with TD-SSL-04. |

### Cluster 10 — Markdown LLM security (4 TDs)

| TD | Severity | Category | Worktrees touching Evidence | Recommended action |
|---|---|---|---|---|
| TD-MD-01 🚨 | MEDIUM BLOCKER | **SAFE-NOW** | `museum-frontend/features/chat/application/useChatSessionActions.ts` NOT touched. | Fix on main now: add confirm or allowlist. |
| TD-MD-02 🚨 | MEDIUM BLOCKER | **WAIT-FOR-MERGE** | W2 modifies `chatSessionLogic.pure.ts` (verified : `decideMarkdownLinkAction` at lines 349-353 still uses startsWith fallback, no allowlist for non-http schemes). | Merge W2 first ; then add scheme allowlist. |
| TD-MD-03 | LOW | **SAFE-NOW** | `<Markdown>` component config not touched. | Fix on main now. |
| TD-MD-04 | LOW | **SAFE-NOW** | MarkdownIt config not touched. | Bundle with TD-MD-03. |

### Cluster 11 — i18n AR launch (5 TDs)

| TD | Severity | Category | Worktrees touching Evidence | Recommended action |
|---|---|---|---|---|
| TD-I18N-01 🚨 | CRITICAL BLOCKER (AR) | **SAFE-NOW** | `museum-frontend/index.js` and `museum-frontend/shared/i18n/i18n.ts` NOT touched. | See §7 AR launch decision first. If AR pre-V1 → /team Cluster 11 immediately. |
| TD-I18N-02 🚨 | HIGH BLOCKER (AR) | **COLLISION-RISK** | All 4 worktrees touch `museum-frontend/shared/locales/ar/translation.json`. Each adds strings ; lines 1156-1157 are the residual `_zero`-only AR plural keys. **needs-human-review** : need to confirm post-merge whether any worktree backfilled the missing AR plural forms (unlikely, but possible). | Merge ALL worktrees first ; then re-audit `ar/translation.json` for `_zero` lines without `_one`/`_other` siblings before fixing. |
| TD-I18N-03 🚨 | HIGH BLOCKER (AR) | **SAFE-NOW** | `museum-frontend/app/(stack)/carnet/[sessionId].tsx` NOT touched (W2/W3 touch `chat/[sessionId].tsx`, different file). | See §7 ; if AR pre-V1 → fix. |
| TD-I18N-04 | MEDIUM | **needs-human-review** | Affected file path unspecified in TD. | Audit + identify sites first. |
| TD-I18N-05 | MEDIUM | **SAFE-NOW** | `i18n.ts` not touched. | Bundle with TD-I18N-01. |

### Cluster 12 — Web deps (2 TDs)

| TD | Severity | Category | Worktrees touching Evidence | Recommended action |
|---|---|---|---|---|
| TD-MGL-01 🚨 | HIGH BLOCKER | **SAFE-NOW** | `museum-web/src/components/marketing/DemoMap.tsx` NOT touched. | Fix on main now. |
| TD-FM-01 🚨 | MAJOR BLOCKER | **SAFE-NOW** | 11 framer-motion files NOT touched by any worktree. | Codemod on main. |

### Hors clusters (autres TDs)

| TD | Severity | Category | Notes |
|---|---|---|---|
| TD-TO-01 | MEDIUM | **WAIT-FOR-MERGE** | W3 modifies `chatSession.entity.ts` (geo context fields). Migration to `@DeleteDateColumn` is complementary. |
| TD-TO-02 | LOW | **SAFE-NOW** | `s3-orphan-purge.job.ts` NOT touched. |
| TD-TO-03 | LOW | **SAFE-NOW** | `chat-purge.job.ts` NOT touched. |
| TD-TO-04 | LOW | **SAFE-NOW** | `admin-export.repository.pg.ts` NOT touched. |
| TD-TO-05 | LOW | **SAFE-NOW** | `chatMessage.entity.ts` + `museum-enrichment.entity.ts` NOT touched. |
| TD-LC-01 | HIGH | **WAIT-FOR-MERGE** (scope shrinks) | W1 deletes `art-topic-classifier.ts` (Evidence halved). W1 keeps `langchain-orchestrator-support.ts` with `ChatGoogleGenerativeAI` import line 1 + ctor line 241 — verified deviation persists. After W1 merge : single-file fix. |
| TD-LC-02 | MEDIUM | **WAIT-FOR-MERGE** (scope shrinks) | Same as TD-LC-01 ; W1 keeps `openAIApiKey:` at lines 253, 262. `content-classifier.service.ts:70` NOT touched. |
| TD-LC-03 | LOW | **WAIT-FOR-MERGE** (scope shrinks) | Same ; W1 keeps deepseek ctor without `streamUsage: false`. |
| TD-LC-04 | MEDIUM | **SAFE-NOW** | `content-classifier.service.ts` NOT touched. |
| TD-LC-05 | LOW | **WAIT-FOR-MERGE** | W1 modifies `langchain.orchestrator.ts` (verified : `withStructuredOutput` at lines 129, 377 still without `strict: true`). |
| TD-RN-01 | LOW | **SAFE-NOW** | `ErrorBoundary.tsx` NOT touched. |
| TD-RN-02 | MEDIUM | **SAFE-NOW** | 5 files (`ArtworkHeroModal.tsx`, `ArtworkHeroCard.tsx`, `DailyArtCard.tsx`, `VisitSummarySheetContent.tsx`, `carnet/[sessionId].tsx`) — none touched. |
| TD-RN-03 | LOW | **SAFE-NOW** | `_internals.ts`, `apiConfig.ts` NOT touched. |
| TD-TQ-01 | MEDIUM | **SAFE-NOW** | `useMe.ts`, `useMuseumDirectory.ts` NOT touched. |
| TD-TQ-02 | LOW | **SAFE-NOW** | `useEmailPasswordAuth.ts`, `useSocialLogin.ts` NOT touched. |
| TD-NEXT-01 | MEDIUM | **SAFE-NOW** | New files (`error.tsx`, `loading.tsx`, `not-found.tsx`) — no worktree adds these. |
| TD-NEXT-02 | LOW | **SAFE-NOW** | `[locale]/layout.tsx` NOT touched. |
| TD-BC-01 | MEDIUM | **SAFE-NOW** | `password.ts` NOT touched. |
| TD-BC-02 | LOW | **SAFE-NOW** | Auth use cases — no rehash mechanism added by any worktree. |
| TD-BC-03 | LOW | **SAFE-NOW** | `seed-smoke-account.ts` NOT touched. |
| TD-BMQ-01 | LOW | **needs-human-review** | 4 BullMQ worker files — not in any worktree's file list, but check `bullmq-enrichment-scheduler.adapter.ts:94` carefully (W1 has chat-module.ts modified). Treat as **SAFE-NOW** pending re-audit. |
| TD-BMQ-02 | MEDIUM | **SAFE-NOW** | `index.ts` shutdown logic — W1/W3 touch index.ts indirectly via config but not the SIGTERM block. Verified : W1 file list does NOT include `museum-backend/src/index.ts`. SAFE. |
| TD-IO-01..04 | MEDIUM/LOW | **SAFE-NOW** | `index.ts`, `redis-cache.service.ts`, `redis-client.ts` — none in any worktree file list. |
| TD-MUL-01 | LOW | **WAIT-FOR-MERGE** | W2 modifies `chat-route.helpers.ts` (multer config sits at lines 80-90). Fix is complementary. |
| TD-MUL-02 | LOW | **SAFE-NOW** | `error.middleware.ts` NOT touched. |
| TD-OTEL-01 | MEDIUM | **SAFE-NOW** | `opentelemetry.ts` NOT touched. Bundle with TD-SN-01. |
| TD-SHARP-01 | MEDIUM | **SAFE-NOW** | `image-processing.service.ts` NOT touched. |
| TD-SHARP-02 | MEDIUM | **SAFE-NOW** | Same file. |
| TD-SHARP-03 | LOW | **SAFE-NOW** | Bootstrap + Dockerfile (Dockerfile is touched by W1 — `museum-backend/deploy/Dockerfile.prod` — but for SigLIP-2 swap, not sharp concurrency). **needs-human-review** to confirm no UV_THREADPOOL change conflict. |
| TD-OP-01 🚨 | HIGH | **SAFE-NOW** | `wikidata-breaker.ts` NOT touched. |
| TD-OP-02 | MEDIUM | **SAFE-NOW** | Same file. |
| TD-OP-03 | MEDIUM | **SAFE-NOW** | Same file. |
| TD-LF-01 | MEDIUM | **WAIT-FOR-MERGE** | W1 modifies `langchain-orchestrator-tracing.ts` (Langfuse trace wiring C9.0). `observeOpenAI` wrap is complementary. |
| TD-LF-02 | MEDIUM | **WAIT-FOR-MERGE** | W1 modifies `langchain.orchestrator.ts:115` area heavily. CallbackHandler addition is complementary. |
| TD-LF-04 | LOW | **SAFE-NOW** | `langfuse.client.ts` not in any worktree's file list. |
| TD-ONNX-01 🚨 | HIGH | **WAIT-FOR-MERGE** | W1 modifies `siglip-onnx.adapter.ts` (SigLIP-2 swap, C9.14). Verified : line 126 `InferenceSession.create(this.modelPath)` still no SessionOptions. |
| TD-ONNX-02 | MEDIUM | **WAIT-FOR-MERGE** | Same file. |
| TD-ONNX-03 | MEDIUM | **WAIT-FOR-MERGE** | Same file. |
| TD-LINK-01 | MEDIUM | **SAFE-NOW** | `html-scraper.ts` NOT touched. |
| TD-LINK-02 | MEDIUM | **SAFE-NOW** | Same file. |
| TD-LINK-03 | LOW | **SAFE-NOW** | Same file. |
| TD-AX-01 | MEDIUM | **SAFE-NOW** | `httpClient.ts` NOT touched. |
| TD-AX-02 | LOW | **SAFE-NOW** | `httpRequest.ts` NOT touched. |
| TD-ZOD-01 | LOW | **SAFE-NOW** | Backend boot — no worktree touches `z.config`. |
| TD-ZOD-02 | LOW | V1.1 | Defer. |
| TD-ZOD-03 | TRIVIAL | **SAFE-NOW** | `chat.contracts.ts`, `auth.schemas.ts` NOT in any worktree file list. |
| TD-ZUS-01 | MINOR | **SAFE-NOW** | `dataModeStore.ts` NOT touched. |
| TD-ZUS-02 | MINOR | **SAFE-NOW** | `offlinePackChoiceStore.ts` NOT touched. |
| TD-REA-01 | LOW | **SAFE-NOW** | `babel.config.js` NOT touched. |
| TD-REA-02 | LOW | **SAFE-NOW** | `SkeletonBox.tsx`, `TypingPlaceholder.tsx` NOT touched. |
| TD-RNAV-01 | MEDIUM BLOCKER | **SAFE-NOW** | `app.config.ts` NOT touched. |
| TD-FL-01 | MINOR | **SAFE-NOW** | 4 list components NOT touched. |
| TD-FL-02 | INFO V1.1 | Defer. |
| TD-SVG-01 | LOW | **SAFE-NOW** | `lib-docs/react-native-svg/INDEX.json` + package.json — defer to lib-docs maintenance. |
| TD-SVG-02 | LOW | **SAFE-NOW** | `package.json` devDependencies — no worktree modifies the relevant devDep entry. |
| TD-SAFE-01 | MEDIUM | **SAFE-NOW** | 23 screens — none in any worktree's M list for these screens specifically. |
| TD-SAFE-02 | LOW | **SAFE-NOW** | `test-utils.tsx` NOT touched. |
| TD-RNWV-01 | MEDIUM | **SAFE-NOW** | `InAppBrowserSheetContent.tsx` NOT touched. |
| TD-RNWV-02 | LOW | **SAFE-NOW** | Same file. |
| TD-AS-01 🚨 | HIGH | **SAFE-NOW** | Codemod scope — no worktree refactors AsyncStorage keys. |
| TD-AS-02 | MEDIUM | **SAFE-NOW** | `storage.ts` NOT touched. |
| TD-AS-03 | INFO V1.1 | Defer. |
| TD-AS-04 | INFO | **SAFE-NOW** | 10+ test files codemod — no worktree refactors mocks. |
| TD-MGL-02 | MEDIUM | **SAFE-NOW** | `DemoMap.tsx` NOT touched. |
| TD-RECH-01 | MEDIUM | **SAFE-NOW** | Recharts test files NOT touched. |
| TD-RECH-02 | LOW | **SAFE-NOW** | Same. |
| TD-RECH-03 | LOW | **SAFE-NOW** | Same. |
| TD-NI-01 | MEDIUM | **SAFE-NOW** | `ConnectivityProvider.tsx` NOT touched. |
| TD-NI-02 | MEDIUM | **SAFE-NOW** | `useMuseumPrefetch.ts` NOT touched. |
| TD-NI-03 | LOW | **SAFE-NOW** | NetInfo + AppState listener — no worktree adds. |
| TD-NI-04 | LOW | **SAFE-NOW** | Test mocks codemod — no worktree refactors. |
| TD-QR-01 🚨 | HIGH | **SAFE-NOW** | `MfaEnrollScreen.tsx` NOT touched. |
| TD-QR-02 | MEDIUM | **SAFE-NOW** | Same file. |
| TD-QRW-01 | MEDIUM | **SAFE-NOW** | `museum-web/src/app/[locale]/admin/mfa/page.tsx` NOT touched (W3/W4 add admin/**museums** pages). |
| TD-SW-01 | LOW | **SAFE-NOW** | Swagger setup — no worktree touches. |
| TD-UUID-01 | LOW | **SAFE-NOW** | `museum-backend/package.json` touched by W3 (pgvector etc.) but uuid line 160 not modified. Trivial fix. |
| TD-MID-01 | LOW | **SAFE-NOW** | Jest setupFiles — no worktree refactors. |
| TD-MID-02 | LOW | **SAFE-NOW** | `package.json:153` p-limit — not modified. |
| TD-EXPO-01 | alias | — | Alias of TD-RN-02. Drop duplicate. |

**Tally** :
- **SAFE-NOW** : ~62 TDs (immediately actionable on main, no worktree collision)
- **WAIT-FOR-MERGE** : ~17 TDs (file touched by a worktree, deviation persists, fix complementary)
- **COLLISION-RISK** : 2 TDs (TD-PC-03 W1+W3 prometheus-metrics, TD-I18N-02 4-way ar/translation.json)
- **STALE-IN-WORKTREE** : 0 TDs (none of the audit deviations are fully fixed by any worktree — *but Evidence scope shrinks for TD-LC-01/02/03 because W1 deletes `art-topic-classifier.ts`*)
- **needs-human-review** : 4 TDs (TD-BMQ-01, TD-SHARP-03, TD-I18N-02, TD-I18N-04)

---

## 4. Recommended merge order

Goal : unblock the maximum number of WAIT-FOR-MERGE TDs with minimum re-audit risk.

1. **W3 first** (`feat/audit-360-w3-geo-walk-intra`, head `f687b600`)
   - **Why** : W3 contains W4 as a merge commit → merging W3 ships both W3 and W4 in one step (eliminates W4 standalone). W3 also touches `museum-backend/src/app.ts` (unblocks TD-HEL-01/02/03, TD-PC-02) and `museum-frontend/app/_layout.tsx` (unblocks TD-RNGH-01) and adds `trace-propagation.middleware.ts` (changes TD-SN-01 context — see §7 ADR-045 question).
   - **TDs unblocked** post-merge : TD-HEL-01/02/03, TD-PC-02, TD-RNGH-01, TD-TO-01 (chatSession.entity touched).
   - Rebase first (W3 is 9 behind main). Expect locale file conflicts (8 translations × 4 worktrees touching = guaranteed merge conflicts on subsequent ones).

2. **W4 standalone : SKIP / DELETE BRANCH**
   - W4 is fully contained in W3's merge commit. Verify with `git log W4..W3` showing 0 commits beyond W3's merge. Then `git branch -D feat/audit-360-w4-compliance-ops-release` after W3 lands.

3. **W1 second** (`feat/audit-360-w1-chat-hardening`, head `6a4a1fd2`)
   - **Why** : W1 has the largest scope (224 files, 29 commits) and touches multiple chat/LLM files. Merging after W3 means W1 rebases against post-W3 main (clean since W3+W1 overlap is limited to the 6-file 3-way collision in §2 — same files modified, not adjacent code).
   - **TDs unblocked** post-merge : TD-LC-01/02/03 (scope reduces, art-topic-classifier deleted), TD-LC-05, TD-LF-01/02, TD-ONNX-01/02/03.
   - Risk : 3-way collision with W2 on `llm-prompt-builder.ts`, `llm-sections.ts`, `chat-message.service.ts`, `prepare-message.pipeline.ts`. Manual conflict resolution likely.

4. **W2 last** (`feat/audit-360-w2-ai-safety-voice`, head `2e9b81bd`)
   - **Why** : W2 has the smallest scope (3 commits, 162 files mostly cleanup). Merging last means most conflicts from the 3-way overlap (with W1 + W3) get resolved by accumulated context.
   - **TDs unblocked** post-merge : TD-MD-02, TD-MUL-01.
   - Risk : moderate. Re-audit `chat-message.service.ts`, `llm-prompt-builder.ts`, `prepare-message.pipeline.ts` zones after W2 lands.

5. **Post-all-merges full re-audit** of the COLLISION-RISK TDs :
   - TD-PC-03 (prometheus-metrics.ts after W1+W3)
   - TD-I18N-02 (ar/translation.json after 4-way locale merge)
   - Plus refresh GitNexus index.

---

## 5. Safe-now batches prêts pour /team

Per the template in `docs/HANDOFF-2026-05-18-tech-debt-investigation.md` §"Niveau 1 — Prompt par CLUSTER" (mode unique UFR-022, single fresh-context 5-phase run per cluster). **Lance UN cluster à la fois, sequentially** — don't fan-out, each /team locks the same files (lint baseline, ESLint plugin baseline, TECH_DEBT.md).

### Batch A — Auth + JWT hardening (highest doctrine weight, 1-line fixes)

```
/team Cluster 5 JWT + Auth rate-limit. Fix TD-JWT-01 and TD-EX-01.

Files :
- museum-backend/src/modules/auth/adapters/secondary/social/google-oauth-state.ts:59
- museum-backend/src/modules/auth/adapters/primary/http/auth-session.route.ts:101,132,163
- museum-backend/src/modules/auth/adapters/primary/http/mfa.route.ts:155,201
- museum-backend/src/modules/chat/adapters/primary/http/chat-message.route.ts:169
- museum-backend/src/modules/chat/adapters/primary/http/chat-media.route.ts:230
- museum-backend/src/modules/chat/adapters/primary/http/chat-compare.route.ts:215

TD-JWT-01 : Add algorithms:['HS256'] to jwt.verify VerifyOptions (CVE-2022-23540 class).

TD-EX-01 : Move validateBody BEFORE rate-limit middleware at 7 route sites. Account-bucket DoS via spam of malformed bodies against victim email.

Acceptance : (1) unit tests assert algorithms is HS256-restricted ; (2) integration test asserts rate-limit counter NOT bumped when body fails Zod validation ; (3) /metrics counter cardinality not affected.
```

### Batch B — Sentry / OTel BE + Web + Mobile observability (after ADR-045 §7)

```
/team Clusters 1+2+3 Sentry/OTel cleanup. Fix TD-SN-02/03/04, TD-SNXT-01/02/03/04, TD-SRN-01.

(TD-SN-01 deferred until ADR-045 owner decision — see HANDOFF §7.)

Files :
- museum-backend/src/shared/observability/sentry.ts
- museum-backend/src/instrumentation.ts (move initSentry here)
- museum-backend/src/index.ts (drop late initSentry call)
- museum-web/sentry.client.config.ts → rename instrumentation-client.ts
- museum-web/src/instrumentation.ts (simplify onRequestError)
- museum-web/sentry.{client,server,edge}.config.ts (3 envs sampling)
- museum-web/next.config.ts (tunnelRoute + tracePropagationTargets)
- museum-frontend/metro.config.js (swap getDefaultConfig → getSentryExpoConfig)

Acceptance : (1) FE → BE traceId end-to-end correlation visible in Sentry dashboard ; (2) Hermes source-map upload still works in EAS build ; (3) tracePropagationTargets explicit (no wildcards) ; (4) sentry.client.config.ts file gone, instrumentation-client.ts present.
```

### Batch C — prom-client security (TD-PC-01 SAFE-NOW + TD-PC-02 post-W3)

```
/team Cluster 4 prom-client security. Fix TD-PC-01 (now) + TD-PC-02 (post-W3-merge) + TD-PC-03 (post-W1+W3-merge).

Files :
- museum-backend/src/shared/observability/metrics-middleware.ts:23 (TD-PC-01: req.path fallback → 'unmatched')
- museum-backend/src/app.ts:222 (TD-PC-02: add auth to /metrics endpoint)
- nginx prod site.conf (optional alternative for TD-PC-02)

Note : TD-PC-03 (naming consistency) requires audit of metric names ADDED by W1 (LlmCostCircuitBreaker gauge) + W3 (detect-museum metric) — bundle into post-merge full audit, not this batch.

Acceptance : (1) /api/foo/abc123 random path probe produces 'unmatched' label, not 1 unique entry per probe ; (2) /metrics returns 401/403 without auth.
```

### Batch D — React forms validation (UFR-021 prevention)

```
/team Cluster 7 React forms hardening. Fix TD-RHF-01, TD-RHF-02, TD-REACT-01.

Files :
- museum-frontend/app/auth.tsx:71-82,244-299 (TD-RHF-01/02: Controller migration + errors surface)
- museum-frontend/features/chat/application/useSessionLoader.ts:25-56 (TD-REACT-01: cancellation flag)

Acceptance : (1) Maestro flow 'submit auth with invalid email' asserts inline error visible (UFR-021) ; (2) useSessionLoader unit test asserts state.cancelled blocks setState after rapid nav ; (3) RHF watch() removed from auth.tsx root (no per-keystroke re-render).
```

### Batch E — Helmet CSP (post-W3-merge)

```
/team Cluster 6 Helmet CSP. Fix TD-HEL-01, TD-HEL-02, TD-HEL-03.

Files :
- museum-backend/src/app.ts:84-130 (re-audit zone — W3 changed this file)

TD-HEL-01 : Move helmet() AFTER requestId, BEFORE requestLogger + rateLimit. Helmet first.
TD-HEL-02 : connectSrc: ['self', 'https://*.sentry.io', 'https://o*.ingest.sentry.io', 'https://api.openai.com', 'https://api.stripe.com'].
TD-HEL-03 : imgSrc adds '*.cloudfront.net', 'musaium.com', '*.musaium.com', 'upload.wikimedia.org' (verify via artworks.data.ts source URLs).

Acceptance : (1) 429 rate-limit response carries CSP/HSTS/X-Content-Type-Options ; (2) admin SPA Sentry browser SDK initializes without CSP block ; (3) CSP Evaluator validation passes.
```

### Batch F — RN gestures + auth UX (TD-RNGH-01 post-W3, TD-RNGH-02/03/04 now)

```
/team Cluster 8 RN gestures. Fix TD-RNGH-01 (post-W3), TD-RNGH-02, TD-RNGH-03, TD-RNGH-04.

Files :
- museum-frontend/app/_layout.tsx (TD-RNGH-01: wrap Stack in GestureHandlerRootView — post-W3-merge)
- museum-frontend/features/chat/ui/ArtworkHeroModal.tsx (TD-RNGH-02/03)
- museum-frontend/features/daily-art/ui/DailyArtCard.tsx (TD-RNGH-04)
- museum-frontend/features/chat/ui/SwipeableConversationCard.tsx (TD-RNGH-04)

Acceptance : (1) iOS preview build pinch-zoom on ArtworkHeroModal works ; (2) Android New Arch Swipeable in DailyArtCard works ; (3) no console "GestureHandlerRootView missing" warning.
```

### Batch G — Markdown LLM security (TD-MD-01 now, TD-MD-02 post-W2)

```
/team Cluster 10 Markdown LLM safety. Fix TD-MD-01 (now), TD-MD-02 (post-W2), TD-MD-03, TD-MD-04.

Files :
- museum-frontend/features/chat/application/useChatSessionActions.ts:71-82 (TD-MD-01: confirm dialog or hostname preview)
- museum-frontend/features/chat/application/chatSessionLogic.pure.ts:343-347 (TD-MD-02: scheme allowlist — POST-W2-MERGE)
- Markdown component (TD-MD-03: allowedImageHandlers https)
- MarkdownIt config (TD-MD-04: .disable(['link','image']) if not needed)

Acceptance : (1) prompt-inject markdown URL [click](evil.com) requires user confirm ; (2) intent:// app-scheme:// file:// returned as 'ignore', not 'system' ; (3) Markdown image renders only https sources.
```

### Batch H — TanStack Query + ZUS persist (low-hanging fruit)

```
/team Misc TanStack + Zustand polish. Fix TD-TQ-01, TD-TQ-02, TD-ZUS-01, TD-ZUS-02.

Files :
- museum-frontend/features/auth/application/useMe.ts (TD-TQ-01: signal plumbing)
- museum-frontend/features/museum/application/useMuseumDirectory.ts (TD-TQ-01)
- museum-frontend/features/auth/application/useEmailPasswordAuth.ts (TD-TQ-02: invalidate ['user'])
- museum-frontend/features/auth/application/useSocialLogin.ts (TD-TQ-02)
- museum-frontend/features/chat/application/dataModeStore.ts (TD-ZUS-01: version+partialize)
- museum-frontend/features/chat/application/offlinePackChoiceStore.ts (TD-ZUS-02: partialize)

Acceptance : (1) GPS jitter doesn't clobber stable museum directory result ; (2) login mutation invalidates ['user'] cache ; (3) Zustand store rehydration preserves only intended fields.
```

### Batch I — Mobile cert pinning (after §7 decision)

```
/team Cluster 9 Cert pinning hardening. Fix TD-SSL-01..05.

(Defer pending §7 question : is pinning ON or OFF pre-V1 ?)

Files :
- museum-frontend/app.config.ts:276-284 (TD-SSL-01: networkInspector:false)
- museum-frontend/shared/config/cert-pinning.ts:63-66 (TD-SSL-02: expirationDate failsafe)
- museum-frontend/shared/infrastructure/cert-pinning-init.ts:133 (TD-SSL-03: capture subscription)
- museum-frontend/docs/CERT_PINNING_RUNBOOK.md (TD-SSL-04/05: documentation)

Acceptance : (1) iOS dev preview pinning works deterministically ; (2) RUNBOOK has 'Coverage scope' section listing native SDKs that bypass pinning ; (3) Maestro flow tests pinning via `launchApp clearState:true`.
```

### Batch J — i18n AR (after §7 AR-launch decision)

```
/team Cluster 11 i18n AR launch. Fix TD-I18N-01..05.

(Defer pending §7 question : is AR pre-V1 ? Plus post-all-merges re-audit of ar/translation.json — TD-I18N-02 is COLLISION-RISK 4-way.)

Acceptance : (1) Hermes loads intl-pluralrules at index.js:1 ; (2) ar/translation.json passes _zero/_one/_two/_few/_many/_other ESLint sentinel ; (3) Maestro AR locale flow shows correct plural in carnet/[sessionId].tsx.
```

### Batch K — Web framer-motion + maplibre codemod

```
/team Cluster 12 Web deps codemod. Fix TD-FM-01 + TD-MGL-01.

Files :
- 11 framer-motion files (codemod 'from "framer-motion"' → 'from "motion/react"')
- museum-web/src/components/marketing/DemoMap.tsx:4 (TD-MGL-01: named maplibre-gl import)
- museum-web/package.json (pnpm remove framer-motion && pnpm add motion)

Acceptance : (1) marketing landing renders animations identically ; (2) DemoMap loads MapLibre without runtime warning ; (3) Lighthouse score >= baseline.
```

### Batch L — TypeORM hygiene + bcrypt + LangChain hors-W1 + ONNX hors-W1 + other backend polish

(Many remaining hors-cluster SAFE-NOW TDs — bundle by file proximity. Refresh GitNexus index after merge cascade.)

---

## 6. TDs STALE à supprimer

**None**. No worktree fully resolves any audit deviation.

However, W1 reduces the **scope** of three TDs by deleting `art-topic-classifier.ts` (UFR-016 burial, commit `33a9d4d5`) :

| TD | Evidence before W1 merge | Evidence after W1 merge |
|---|---|---|
| TD-LC-01 | `langchain-orchestrator-support.ts:1,82`, `art-topic-classifier.ts:2,28` | `langchain-orchestrator-support.ts:1,241` only |
| TD-LC-02 | `langchain-orchestrator-support.ts:90,102`, `art-topic-classifier.ts:19,36`, `content-classifier.service.ts:70` | `langchain-orchestrator-support.ts:253,262`, `content-classifier.service.ts:70` |
| TD-LC-03 | `langchain-orchestrator-support.ts:90-98`, `art-topic-classifier.ts:36-43` | `langchain-orchestrator-support.ts:90-98` only |

→ **Action** : after W1 merges to main, edit `docs/TECH_DEBT.md` to remove `art-topic-classifier.ts` references from TD-LC-01/02/03 Evidence sections, and update line numbers in `langchain-orchestrator-support.ts` to post-merge values. Keep the TDs themselves.

---

## 7. Open questions (business decisions pending)

These decisions gate specific TDs and **must be resolved before fixing them** :

1. **ADR-045 Sentry+OTel coexistence design** — does the W3+W4 `trace-propagation.middleware.ts` (header-based correlation, BE+FE side) replace the need for the `@sentry/opentelemetry` SDK bridge described in TD-SN-01 ?
   - **If yes** : TD-SN-01 becomes STALE-BY-DESIGN once W3 lands. Update CLAUDE.md gotcha "Sentry+OTel Node SDK v2 coexistence" to note "we use middleware-based correlation, NOT SDK bridge". Document amendment.
   - **If no** : TD-SN-01 remains BLOCKER. /team Cluster 1 installs `@sentry/opentelemetry` + wires `SentryContextManager` + `SentryPropagator` + `SentrySpanProcessor` post-W3-merge.
   - **Owner** : ADR-045 author. ⚠ Blocks Batch B (Sentry cleanup) partially.

2. **AR launch date** — is Arabic shipping pre-V1 (`2026-06-01`) or post-launch ?
   - **If pre-V1** : TD-I18N-01/02/03 are CRITICAL/HIGH BLOCKERS. /team Cluster 11 (Batch J) before launch.
   - **If post-V1** : Downgrade entire i18n AR cluster to NICE_TO_HAVE / V1.1. Move from BLOCKER to backlog.
   - **Check** : `docs/ROADMAP_PRODUCT.md` for current AR status (W3 inventory shows it's modified — may already have AR-launch decision).
   - **Affected** : 5 TDs (TD-I18N-01..05). ⚠ Blocks Batch J entirely.

3. **CSP `report-to` directive** — pre-V1 polish or post-launch ?
   - **If pre-V1** : Add `report-to` directive + endpoint scaffolding in Batch E.
   - **If post-launch** : TD-HEL section "polish" stays NICE_TO_HAVE.

4. **Cert pinning rollout** — is `EXPO_PUBLIC_CERT_PINNING_ENABLED=true` the V1 default ?
   - **If yes** : TD-SSL-01 = BLOCKER. Batch I before launch.
   - **If no (default off)** : TD-SSL-01..05 downgrade to NICE_TO_HAVE pre-2027 (E8 intermediate expiry).
   - **Check** : `museum-frontend/app.config.ts:cert pinning plugin` + EAS profile config + `app.config.ts` env defaults.

5. **/metrics endpoint auth strategy (TD-PC-02)** — three options :
   - (a) nginx `allow <prom-ip>; deny all` in prod site.conf — **simplest, infra-level**
   - (b) Express `requireSuperAdmin` middleware on `app.get('/metrics')` — **app-level, JWT-based**
   - (c) Separate internal port `:9100` mapped only on tailscale/VPN — **most secure, infra change**
   - **Decision needed** : DevOps owner choice. Affects Batch C.

6. **GestureHandlerRootView auto-wrap regression** — confirm via iOS preview New Arch testing that Expo Router 5.x does NOT auto-wrap `Stack` in `<GestureHandlerRootView>`. The audit grep shows 0 hits, but Expo SDK changes routinely. Validate empirically before Batch F implementation to avoid double-wrap warnings.

7. **W4 standalone branch deletion** — confirm via `git log W4..W3` that W3's merge commit is **identical** to direct W4 merge. If so, delete `feat/audit-360-w4-compliance-ops-release` immediately after W3 lands to avoid stale branch confusion.

---

## 8. Investigation log (append-only)

- **2026-05-19 09:30** — Read handoff doc, listed worktrees, confirmed 88 TDs in `docs/TECH_DEBT.md` lines 761-1660.
- **2026-05-19 09:35** — Spawned 4 read-only `Explore` agents (W1, W2, W3, W4) for parallel git diff/log/status capture.
- **2026-05-19 09:40** — Read full TECH_DEBT.md audit section ; compiled TD → Evidence file map (12 clusters + 50+ hors-cluster TDs).
- **2026-05-19 09:42** — All 4 agents returned. Confirmed W3 contains W4 merge commit. Confirmed W1 deletes `art-topic-classifier.ts`.
- **2026-05-19 09:48** — Verified deviations persist in collision files :
  - W1 `langchain-orchestrator-support.ts` lines 1, 241, 253, 262 (TD-LC-01/02 persist)
  - W1 `langchain.orchestrator.ts` lines 129, 377 (TD-LC-05 persist — no `strict: true`)
  - W1 `siglip-onnx.adapter.ts` line 126 (TD-ONNX-01 persist — no SessionOptions)
  - W3 `app.ts` lines 86, 124-132, 224 (TD-HEL-01/02/03 + TD-PC-02 persist)
  - W3 `_layout.tsx` lines 157-217 (TD-RNGH-01 persist — no `<GestureHandlerRootView>`)
  - W2 `chatSessionLogic.pure.ts` lines 349-353 (TD-MD-02 persist — no scheme allowlist)
  - W4 FE `sentry-init.ts` has `tracePropagationTargets` already (FE side OK ; BE TD-SN-02 SAFE-NOW).
- **2026-05-19 10:05** — Classification complete. 62 SAFE-NOW / 17 WAIT-FOR-MERGE / 2 COLLISION-RISK / 0 STALE / 4 needs-human-review.
- **2026-05-19 10:10** — Recommended merge order W3 → W4 (skip) → W1 → W2. 12 /team batches drafted.

---

## 9. Acceptance check (per HANDOFF mission)

✅ **1. Choose optimal merge order** : §4 — W3 (with W4 inside) → W1 → W2. Skip W4 standalone.
✅ **2. Launch /team Cluster runs on TDs SAFE-NOW without waste risk** : §5 — 12 batches A..L, sequenced.
✅ **3. Clean STALE TDs from docs/TECH_DEBT.md** : §6 — no full STALE, but 3 TDs (TD-LC-01/02/03) have Evidence scope to shrink post-W1-merge.
✅ **4. Identify business decisions blocking before continuing** : §7 — 7 open questions, each tagged with affected TDs/batches.
