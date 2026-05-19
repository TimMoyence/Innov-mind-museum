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

## 7. Open questions — RESOLVED 2026-05-19

User decisions captured 2026-05-19 :

1. ✅ **ADR-045 Sentry+OTel coexistence : YES** — `trace-propagation.middleware.ts` (W3+W4 header-based correlation) IS the design choice. The `@sentry/opentelemetry` SDK bridge is NOT needed.
   - **Consequence** : **TD-SN-01 marked STALE-BY-DESIGN** once W3 lands. Remove from BLOCKER list.
   - **Action** : Amend CLAUDE.md "Sentry+OTel Node SDK v2 coexistence" gotcha with note "trace correlation via middleware (header-based), NOT SDK bridge. Per ADR-045 decision 2026-05-19. `skipOpenTelemetrySetup: true` remains correct."
   - **Batch B impact** : Skip TD-SN-01 sub-task. Still execute TD-SN-02/03/04 + TD-SNXT + TD-SRN.

2. ✅ **AR launch : POST-V1** — Arabic ships V1.1.
   - **Consequence** : TD-I18N-01..05 all **downgrade BLOCKER → V1.1 NICE_TO_HAVE**.
   - **Action** : Move TD-I18N-01..05 to V1.1 backlog section in `docs/TECH_DEBT.md` post-merge.
   - **Batch J : DEFERRED**, not pre-V1.

3. ✅ **CSP `report-to` : POST-V1** — defer to V1.1 polish.
   - **Consequence** : TD-HEL-03 partial scope only (extend `imgSrc` + `connectSrc` now ; skip `report-to` directive).
   - **Batch E** : reduced scope. No CSP report endpoint needed pre-V1.

4. ✅ **Cert pinning : YES — `EXPO_PUBLIC_CERT_PINNING_ENABLED=true` is V1 default**.
   - **Consequence** : TD-SSL-01..05 remain pre-V1 BLOCKER. Batch I before launch.
   - **Action** : prioritize Batch I in next /team queue.

5. ✅ **/metrics auth (TD-PC-02) : Option (b)** — Express `requireSuperAdmin` middleware on `app.get('/metrics')`.
   - **Consequence** : No nginx work required. App-level JWT-based gate.
   - **Batch C** : update spec to use existing `requireSuperAdmin` middleware (already used elsewhere in admin routes).

6. ✅ **GestureHandlerRootView regression** — empirical check deferred to Batch F implementation. /team will validate via iOS preview build during phase 3 (green) or phase 7 (verifier).

7. ✅ **W4 standalone deletion** — user confirms intent to delete after W3 lands. Verify `git log feat/audit-360-w4-compliance-ops-release..feat/audit-360-w3-geo-walk-intra` shows W3 ahead, AND `git log W3..W4` empty (W4 fully contained).

---

## 8. Decision impact on batch matrix (independence vs merges)

> Q from user 2026-05-19: "Les 12 batchs sont à coller dans de nouvelles sessions et sont indépendants des merges ?"
> A: **Partial independence**. Each batch lives in its own /team session (fresh-context UFR-022), but they SERIALIZE on shared files (`docs/TECH_DEBT.md`, ESLint plugin baselines, `package.json` lockfile). Real workflow : run each batch in its own session BUT commit serially. Multiple batches running in parallel = guaranteed merge conflicts on TECH_DEBT.md.

### Batches independent of all merges (can launch NOW, before any worktree merges) :

| Batch | Why independent | Notes |
|---|---|---|
| **A** — JWT + Auth rate-limit | None of the 7 route files touched by any worktree | 1-line algorithms fix + middleware reorder |
| **B** — Sentry/OTel cleanup (minus TD-SN-01) | sentry.ts / metro.config.js / Web sentry configs not touched | TD-SN-01 SKIPPED per ADR-045 decision |
| **D** — React forms (TD-RHF-01/02 + TD-REACT-01) | auth.tsx + useSessionLoader.ts not touched | UFR-021 prevention, highest doctrine weight |
| **H** — TanStack + Zustand polish | useMe / useMuseumDirectory / mutations / stores not touched | Low risk, fast |
| **I** — Cert pinning (TD-SSL-01..05) | app.config.ts + cert-pinning files not touched | BLOCKER per user decision |
| **K** — Web framer-motion + maplibre codemod | 11 web files + DemoMap.tsx not touched | Pure codemod |

### Batches needing a SPECIFIC merge first :

| Batch | Blocked by | Why |
|---|---|---|
| **C** part (TD-PC-02) | W3 merge | app.ts touched by W3 |
| **C** part (TD-PC-03) | W1 + W3 merge | prometheus-metrics.ts touched by both |
| **E** (Helmet CSP) | W3 merge | app.ts touched by W3 |
| **F** part (TD-RNGH-01) | W3 merge | _layout.tsx touched by W3 |
| **G** part (TD-MD-02) | W2 merge | chatSessionLogic.pure.ts touched by W2 |
| **L** part (TD-LC-*) | W1 merge | langchain-orchestrator-support.ts touched + scope shrinks |
| **L** part (TD-LF-*) | W1 merge | langchain.orchestrator.ts + tracing.ts touched |
| **L** part (TD-ONNX-*) | W1 merge | siglip-onnx.adapter.ts touched |
| **L** part (TD-MUL-01) | W2 merge | chat-route.helpers.ts touched |

### Batches SAFE-NOW that can also be SPLIT to run partially now :

- **C** : TD-PC-01 alone (metrics-middleware.ts) is SAFE-NOW. Split off as **Batch C₀**.
- **F** : TD-RNGH-02/03/04 are SAFE-NOW (ArtworkHeroModal + DailyArtCard + SwipeableConversationCard). Split off as **Batch F₀**.
- **G** : TD-MD-01 + TD-MD-03 + TD-MD-04 are SAFE-NOW (useChatSessionActions.ts + Markdown configs). Split off as **Batch G₀**.

### Recommended /team queue (sequential, one session each)

**Phase 1 — Pre-merge independent batches** (can launch immediately, in any order, BUT one at a time to avoid TECH_DEBT.md conflicts) :

1. Batch A (JWT + Auth) — highest doctrine weight, 1-line fixes
2. Batch D (React forms) — UFR-021 prevention
3. Batch C₀ (TD-PC-01 only) — 1-line fix
4. Batch K (Web codemods) — clean isolation
5. Batch F₀ (TD-RNGH-02/03/04)
6. Batch G₀ (TD-MD-01 + 03 + 04)
7. Batch I (Cert pinning) — V1 BLOCKER
8. Batch B (Sentry/OTel minus TD-SN-01) — multi-file, larger scope
9. Batch H (TanStack + Zustand polish)

**Phase 2 — Post-W3 merge** :

10. Batch E (Helmet CSP) — needs W3 zone re-audit
11. Batch C₁ (TD-PC-02 only) — needs W3 zone, uses requireSuperAdmin per decision
12. Batch F₁ (TD-RNGH-01 only) — needs W3 _layout.tsx

**Phase 3 — Post-W1 merge** :

13. Batch L₁ (TD-LC-01/02/03 with reduced scope + TD-LC-05 + TD-LF-01/02 + TD-ONNX-01/02/03) — re-audit Evidence post-W1
14. Batch C₂ (TD-PC-03 naming) — needs W1 + W3 metrics

**Phase 4 — Post-W2 merge** :

15. Batch G₁ (TD-MD-02 only) — needs W2 chatSessionLogic.pure.ts
16. Batch L₂ (TD-MUL-01 + remaining TypeORM/bcrypt hygiene)

**V1.1 backlog (deferred per user decisions)** :

- Batch J (i18n AR) — post-V1
- TD-HEL "report-to" polish — post-V1
- TD-SN-01 — STALE-BY-DESIGN, drop from list

---

## 9. Merge execution prompt (paste in fresh session)

> Copy the markdown block below and paste into a NEW Claude Code session at `/Users/Tim/Desktop/all/dev/Pro/InnovMind`. The session needs full filesystem + Bash + `gh` CLI access.

````markdown
Mission : merge cascade audit-360 worktrees (W3 → W1 → W2) into main, via GitHub PRs with CI green gate.

## Context

Read `docs/HANDOFF-2026-05-19-debt-collision-report.md` IN FULL before starting. Critical sections : §1 (worktrees), §4 (merge order), §6 (TD-LC-* scope shrink), §7 (resolved decisions), §8 (batches blocked by which merge).

Key facts :
- W4 (feat/audit-360-w4-compliance-ops-release) is contained in W3 (verified : commit `f687b600` = "merge(w3+w4)"). **Don't open a PR for W4. Delete the branch after W3 lands.**
- Order : W3 → (no W4) → W1 → W2.
- ADR-045 decision : header-middleware-based trace correlation. TD-SN-01 is STALE-BY-DESIGN. CLAUDE.md amendment needed.
- AR launch is POST-V1. Downgrade TD-I18N-01..05.
- Cert pinning IS ON in V1. Keep TD-SSL-01..05 as BLOCKER.

## Constraints (NON-NEGOTIABLE)

- **UFR-020** : ZERO hook bypass. No `--no-verify`, no `SKIP_*=1`, no `core.hookspath=/dev/null`. If a hook fails, fix the root cause.
- **UFR-013** : honesty. Report failures VERBATIM. "All tests pass" only after running them. Distinguish verified vs assumed.
- **No /team spawn** : this is a merge orchestration task, not feature work.
- Each phase needs explicit human confirm before destructive operation (force-push, branch delete).

## Phase 0 — Preflight

1. Confirm worktree state :
   ```
   git -C /Users/Tim/Desktop/all/dev/Pro/InnovMind worktree list
   git -C /Users/Tim/Desktop/all/dev/Pro/InnovMind log --oneline -5
   ```
   Expect main at `3439848b` or later, 4 worktrees present.

2. Verify W4 ⊆ W3 :
   ```
   git -C /Users/Tim/Desktop/all/dev/Pro/InnovMind log feat/audit-360-w3-geo-walk-intra..feat/audit-360-w4-compliance-ops-release --oneline
   ```
   MUST be empty. If non-empty, W4 has commits not in W3 → STOP and report.

3. Verify `gh` CLI auth :
   ```
   gh auth status
   gh repo view --json nameWithOwner
   ```

4. Verify CI workflow status :
   ```
   gh workflow list
   ```
   Expect `ci-cd-backend.yml`, `ci-cd-web.yml`, `ci-cd-mobile.yml` etc.

## Phase 1 — Push branches + create PRs

For each of W3, W1, W2 (in this order — push the slowest-CI first so it warms up while others queue) :

1. **W3** :
   ```
   git -C /Users/Tim/Desktop/all/dev/Pro/InnovMind-W3 push -u origin feat/audit-360-w3-geo-walk-intra
   ```
   If push rejected (branch already on remote diverged) : `git -C ... push --force-with-lease`.
   
   Create PR :
   ```
   gh pr create --base main --head feat/audit-360-w3-geo-walk-intra \
     --title "audit-360 W3 : geo-walk-intra + W4 compliance/ops (merged)" \
     --body "Includes W4 audit-360 compliance/ops/release via merge commit f687b600. Unblocks TDs : TD-HEL-01/02/03, TD-PC-02, TD-RNGH-01, TD-TO-01. See docs/HANDOFF-2026-05-19-debt-collision-report.md §3-4."
   ```

2. **W1** :
   ```
   git -C /Users/Tim/Desktop/all/dev/Pro/InnovMind-W1 push -u origin feat/audit-360-w1-chat-hardening
   gh pr create --base main --head feat/audit-360-w1-chat-hardening \
     --title "audit-360 W1 : chat hardening (C9.0..C9.17)" \
     --body "29 commits. LLM cost gauge + Langfuse trace + reranker scaffold + SigLIP-2 + [META] retired + UFR-016 burials (art-topic-classifier, google-cse, searxng, duckduckgo). Shrinks TD-LC-01/02/03 evidence scope. See report §6."
   ```

3. **W2** :
   ```
   git -C /Users/Tim/Desktop/all/dev/Pro/InnovMind-W2 push -u origin feat/audit-360-w2-ai-safety-voice
   gh pr create --base main --head feat/audit-360-w2-ai-safety-voice \
     --title "audit-360 W2 : AI safety + voice + a11y" \
     --body "STT prompt biasing + voice-aware TTS cache + Presidio + WCAG audio descriptions + Jest timeout 30s. Unblocks TD-MD-02, TD-MUL-01."
   ```

4. **List the 3 PRs** :
   ```
   gh pr list --search "audit-360-w" --state open
   ```

5. **Do NOT push W4** (per §7 decision 7). Note the W4 PR URL would be redundant.

## Phase 2 — Wait for CI green on all 3 PRs

For each PR :
```
gh pr checks <PR_URL>
```

If any check fails :
1. Read the failure log : `gh run view <run_id> --log-failed`
2. Diagnose root cause. Common cases :
   - W1 might fail openapi sync (museum-frontend `npm run check:openapi-types`) — regenerate locally + push.
   - W2 might fail Jest timeout — already bumped to 30s in commit `2e9b81bd`, should be OK.
   - W3 might fail BE migration tests if Postgres pgvector image missing — check `ci-cd-backend.yml` services block uses `pgvector/pgvector:pg16`.
3. Fix on the source worktree, push, wait for re-run.
4. NEVER bypass. UFR-020.

Report status to user. **STOP HERE for user confirm before Phase 3.**

## Phase 3 — Merge cascade (only after user confirms all 3 PRs green)

### 3.A — Merge W3 (ships W4 inside)

```
gh pr merge <W3_PR_NUMBER> --merge --delete-branch
# --merge (not --squash) preserves the W4 merge commit signature inside main's history.
# --delete-branch removes feat/audit-360-w3 from remote post-merge.
```

Local sync :
```
git -C /Users/Tim/Desktop/all/dev/Pro/InnovMind checkout main
git -C /Users/Tim/Desktop/all/dev/Pro/InnovMind pull origin main
git -C /Users/Tim/Desktop/all/dev/Pro/InnovMind log --oneline -5
```

Run local verification suite (parallel possible) :
```
cd museum-backend && pnpm install && pnpm lint && pnpm test
cd museum-frontend && npm install && npm run lint && npm test
cd museum-web && pnpm install && pnpm lint && pnpm test
cd museum-backend && pnpm openapi:validate
```

If all green :
- Delete W4 standalone (per §7.7) :
  ```
  git -C /Users/Tim/Desktop/all/dev/Pro/InnovMind branch -D feat/audit-360-w4-compliance-ops-release
  git -C /Users/Tim/Desktop/all/dev/Pro/InnovMind worktree remove /Users/Tim/Desktop/all/dev/Pro/InnovMind-W4
  git push origin --delete feat/audit-360-w4-compliance-ops-release 2>/dev/null || echo "W4 not on remote (expected)"
  ```

If any test fails : STOP, report verbatim, do not proceed to W1.

### 3.B — Merge W1 (chat hardening)

Rebase W1 on post-W3 main :
```
git -C /Users/Tim/Desktop/all/dev/Pro/InnovMind-W1 fetch origin main
git -C /Users/Tim/Desktop/all/dev/Pro/InnovMind-W1 rebase origin/main
```

**Expected conflicts** (per report §2) :
- `museum-backend/src/modules/chat/useCase/llm/llm-prompt-builder.ts`
- `museum-backend/src/modules/chat/useCase/llm/llm-sections.ts`
- `museum-backend/src/modules/chat/useCase/message/chat-message.service.ts`
- `museum-backend/src/modules/chat/useCase/orchestration/prepare-message.pipeline.ts`
- `museum-backend/src/modules/chat/chat-module.ts`
- `museum-backend/src/modules/chat/domain/ports/chat-orchestrator.port.ts`
- `museum-backend/src/shared/observability/prometheus-metrics.ts` (W1 + W3 both add gauges)
- `museum-frontend/shared/locales/{ar,de,en,es,fr,it,ja,zh}/translation.json` (8 locales)

Resolution discipline : each conflict needs a deliberate decision. Don't blanket `--theirs` or `--ours`. For locale files, MERGE both worktrees' new keys (each adds different strings). For source code, read both sides + understand intent. Read `lib-docs/<lib>/PATTERNS.md` if pattern is unclear.

Push :
```
git -C /Users/Tim/Desktop/all/dev/Pro/InnovMind-W1 push --force-with-lease origin feat/audit-360-w1-chat-hardening
```

Wait for CI re-run :
```
gh pr checks <W1_PR_NUMBER>
```

If green, merge :
```
gh pr merge <W1_PR_NUMBER> --merge --delete-branch
```

Local sync + verify (same as 3.A) + delete W1 worktree :
```
git -C /Users/Tim/Desktop/all/dev/Pro/InnovMind worktree remove /Users/Tim/Desktop/all/dev/Pro/InnovMind-W1
```

### 3.C — Merge W2 (AI safety + voice)

Same flow as 3.B :
```
git -C /Users/Tim/Desktop/all/dev/Pro/InnovMind-W2 fetch origin main
git -C /Users/Tim/Desktop/all/dev/Pro/InnovMind-W2 rebase origin/main
```

Expect locale conflicts (3-way now: 8 locales × W2-vs-post-W1-main) + chat files (W2 vs W1 overlap on llm-prompt-builder, llm-sections, chat-message.service, prepare-message.pipeline).

Push --force-with-lease, wait CI, merge with --delete-branch, sync local, verify, remove worktree.

## Phase 4 — Post-merge cleanup

1. **CLAUDE.md ADR-045 amendment** (per §7.1 decision) :
   Locate the "Sentry+OTel Node SDK v2 coexistence" gotcha in CLAUDE.md "Pièges connus" section. Append :
   > **Amendment 2026-05-19 (ADR-045)** : trace correlation BE↔FE is achieved via the `museum-backend/src/shared/observability/trace-propagation.middleware.ts` (reads `sentry-trace`+`baggage` headers, attaches to active OTel span) AND `museum-frontend/shared/observability/sentry-init.ts:tracePropagationTargets`. We do NOT use the `@sentry/opentelemetry` SDK bridge. `skipOpenTelemetrySetup: true` in `sentry.ts` is correct and intentional.

2. **TECH_DEBT.md updates** :
   - Mark TD-SN-01 as STALE (per ADR-045 decision)
   - Downgrade TD-I18N-01..05 from BLOCKER → V1.1 NICE_TO_HAVE (move to V1.1 section)
   - Downgrade TD-HEL "report-to" polish reference to V1.1 (TD-HEL-03 partial)
   - TD-LC-01/02/03 : remove `art-topic-classifier.ts` references from Evidence (deleted by W1) ; update `langchain-orchestrator-support.ts` line numbers based on post-merge file state. Verify by reading the merged file in main.
   - Strikethrough or move resolved deviations as relevant.

3. **GitNexus reindex** :
   ```
   npx gitnexus analyze
   ```
   Expect symbol count change (+detect-museum, +reranker port, +trace-propagation middleware, -art-topic-classifier, -searxng/google-cse/duckduckgo). Report new symbol total.

4. **Final full verification** :
   ```
   cd museum-backend && pnpm lint && pnpm test && pnpm test:e2e && pnpm openapi:validate
   cd museum-frontend && npm run lint && npm test
   cd museum-web && pnpm lint && pnpm test
   ```
   
   Smoke test if local stack available :
   ```
   docker compose -f museum-backend/docker-compose.dev.yml up -d
   cd museum-backend && pnpm smoke:api
   ```

5. **Commit cleanup** :
   ```
   git -C /Users/Tim/Desktop/all/dev/Pro/InnovMind add docs/TECH_DEBT.md CLAUDE.md
   git -C /Users/Tim/Desktop/all/dev/Pro/InnovMind commit -m "docs: post audit-360 W1/W2/W3 merge cleanup (TD scope + ADR-045 amendment)"
   git -C /Users/Tim/Desktop/all/dev/Pro/InnovMind push origin main
   ```

## Phase 5 — Report back

Send brief status to user :
- ✅ W3 merged at commit `<SHA>`, ✅ W1 merged at `<SHA>`, ✅ W2 merged at `<SHA>`
- W4 branch deleted (local + remote)
- Test suite : `BE: <pass>/<total>` ; `FE: <pass>/<total>` ; `Web: <pass>/<total>` ; e2e: `<pass>/<total>`
- TECH_DEBT.md tally post-cleanup : SAFE-NOW count = <N> (down from 62 pre-merge)
- GitNexus index : `<N>` symbols, `<M>` relationships
- CLAUDE.md ADR-045 amendment applied ✅
- Any unresolved conflict zones, follow-ups, or yellow flags

Then user can launch /team batches A, D, C₀, K, F₀, G₀, I, B, H sequentially from collision report §5/§8 (in different sessions, one at a time to avoid TECH_DEBT.md conflicts).
````

---

## 10. Investigation log (append-only)

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
- **2026-05-19 11:30** — User resolved 7 open questions (§7) : ADR-045 = YES middleware, AR = post-V1, CSP report-to = post-V1, cert pinning = ON, /metrics = requireSuperAdmin, W4 = delete after W3. Re-classified batches into independence matrix (§8). Drafted merge execution prompt (§9) for fresh-session orchestration.

---

## 11. Acceptance check (per HANDOFF mission)

✅ **1. Choose optimal merge order** : §4 — W3 (with W4 inside) → W1 → W2. Skip W4 standalone.
✅ **2. Launch /team Cluster runs on TDs SAFE-NOW without waste risk** : §5 — 12 batches A..L, sequenced.
✅ **3. Clean STALE TDs from docs/TECH_DEBT.md** : §6 — no full STALE, but 3 TDs (TD-LC-01/02/03) have Evidence scope to shrink post-W1-merge.
✅ **4. Identify business decisions blocking before continuing** : §7 — 7 open questions, each tagged with affected TDs/batches.
