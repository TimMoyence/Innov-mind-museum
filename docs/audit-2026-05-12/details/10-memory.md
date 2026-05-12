# 10 — Memory / context-carry audit
**Date:** 2026-05-12  **Agent:** AGENT-10

## Verdict
- **Memory hygiene 0-100:** **62** (mostly load-bearing, but 5 of 17 files have stale paths/claims and 1 directly contradicts current code)
- **Tokens wasted per session estimate:** **~5 800 tokens** — dominated by the duplicated GitNexus block in both `CLAUDE.md` and `AGENTS.md` (~750 tokens × 2 = 1 500), CLAUDE.md "not yet extracted" lies forcing re-reads (~400 tokens of self-inflicted indirection), and 5 over-long memory essays (~3 800 tokens that could be ~800).
- **CLAUDE.md weight discipline 0-100:** **55** — 292 lines / ~20 KB, with a verbatim duplicate of the GitNexus block already present in AGENTS.md (lines 250-292), three "doc not yet extracted" claims that are factually wrong, a stale migration count (34 → 56), a wrong env-bootstrap instruction, and the `Pièges connus` section drifting into ADR territory (siglip preprocessing, halfvec versioning) that would be at home in the relevant ADR pages.
- **1-paragraph honest read:** The memory system is in better shape than the surrounding docs — 11 of 17 files are tight, dated, load-bearing, and correctly classified (notably `feedback_quality_doctrine`, `feedback_no_feature_flags_prelaunch`, `project_c2_ai_side_only`, `reference_ios_build_chain`). But the rot pattern is recognisable: (1) `feedback_process_env_local_vs_ci` says use `as string`, the MEMORY.md index summary says "keep String() wraps", and the code now uses neither — it uses a `typeofString()` helper in `app.config.ts:52` — the rule is **wrong in two different ways at once**; (2) `project_geolocation_pipeline` is a 45-line implementation log that should be a 4-line invariant; (3) `project_ios26_crash_investigation` is 37 days old with "DIAGNOSTIC PENDING" — either Bug 2 is fixed (verify) or it's still pending (which means the auto-memory has decayed faster than the bug); (4) CLAUDE.md lies three times in a row about extracted docs (verified: `docs/ARCHITECTURE.md`, `docs/TEST_FACTORIES.md`, `docs/LINT_DISCIPLINE.md` all exist as of 2026-05-12 — also flagged in AGENT-09's report); (5) the GitNexus auto-injected block is dead weight injected twice per session. None of the memories are dangerously wrong, but the index has drifted faster than the underlying files and CLAUDE.md is no longer a verified-truth document — it's a "claimed-truth" document with a 5-day staleness window.

## Method

- **17 memory files audited** (16 entries + MEMORY.md index). Every file read in full.
- **Claims verified against codebase:** 22 distinct claims grepped/Read against the live tree.
  - `museum-backend/src/shared/utils/haversine.ts` ✅ exists
  - `museum-backend/src/shared/utils/location.ts` ✅ exists
  - `museum-backend/src/modules/chat/useCase/location/location-resolver.ts` ✅ exists
  - `museum-backend/src/shared/http/nominatim.client.ts` ✅ exists
  - `museum-backend/tests/unit/chat/chat-message-service.test.ts` ✅ exists
  - `scripts/sentinels/.integration-tier-baseline.json` ✅ exists
  - `scripts/sentinels/integration-tier-signature.mjs` ✅ exists
  - `tests/integration/_smoke/integration-tier-baseline-cap.test.ts` ✅ — `PHASE_1_BASELINE_CAP = 11` (not 5, memory is stale on the value but mechanism still correct)
  - `infra/nginx/conf.d/grafana.conf` ✅ exists
  - `museum-backend/src/modules/chat/adapters/secondary/embeddings/siglip-onnx.adapter.ts` ✅ exists
  - `museum-backend/src/modules/chat/useCase/guardrail/art-topic-guardrail.ts` ✅ exists (CLAUDE.md says `art-topic-guardrail.ts` without subfolder — verified, moved to `guardrail/`)
  - `museum-backend/src/modules/chat/useCase/orchestration/chat.service.ts` ✅ exists (CLAUDE.md says `chat.service.ts` — actual path is under `orchestration/`)
  - `museum-backend/src/modules/chat/useCase/message/chat-message.service.ts` ✅ exists (CLAUDE.md says `chat-message.service.ts:224-236` and memory `feedback_check_tests_before_bug_classification` cites it — actual path moved to `message/` subfolder, line refs not verifiable as authoritative)
  - `LlmCacheServiceImpl` ✅ class exists at `museum-backend/src/modules/chat/useCase/llm/llm-cache.service.ts:28`
  - `CachingChatOrchestrator` ✅ confirmed deleted (no hits in `src/`)
  - `ios/Musaium/Supporting/Expo.plist` ✅ exists with `EXUpdatesEnabled` key (memory said `Expo.plist` without `Supporting/` subpath — minor)
  - `museum-frontend/app.config.ts` `updates.enabled: false` ✅ confirmed at line ~316
  - `museum-frontend/ios/Pods/` ✅ committed (Headers/ hermes-engine/ etc. present)
  - `scripts/patch-gitnexus.sh` ✅ exists
  - `tools/eslint-plugin-musaium-test-discipline/baselines/no-inline-test-entities.json` ✅ exists
  - `scripts/sentinels/as-any-ratchet.mjs` ✅ exists
  - `museum-backend/.env.local.example` ❌ **does NOT exist** (only `.env.example`, `.env.host-mode`, `.env.production.example`) — CLAUDE.md Environment Setup §1 is wrong for backend
- **Memories contradicted by current code:** **1 hard contradiction** (`feedback_process_env_local_vs_ci`), **3 soft drifts** (paths moved, value bumped, doc claimed-not-extracted).

## Per-memory-file audit

| File | Type | Class | Status | Action |
|---|---|---|---|---|
| `MEMORY.md` | index | meta | Index says `process_env` rule is "keep String() wraps even when local lint says they're redundant" — **contradicts the underlying memory file** which itself recommends `as string`, and **both contradict current code** (uses `typeofString()`). | EDIT — fix index + rewrite memory |
| `feedback_quality_doctrine.md` | feedback | doctrine | 57 lines, 4 rules merged. Still true. Rule 3 cites a 2026-04-06 audit, fine. Slightly long but cohesive. | KEEP |
| `feedback_honesty_no_pretense.md` | feedback | doctrine | 14 lines, points to canonical CLAUDE.md UFR-013 section. Correct, terse. | KEEP |
| `feedback_no_feature_flags_prelaunch.md` | feedback | doctrine | 17 lines, dated 2026-05-08, references C2 cycle. Still true, well-scoped, has sunset condition. | KEEP |
| `feedback_bury_dead_code.md` | feedback | doctrine | 19 lines. Still true. Quote `il est mort on l'enterre` is the load-bearing trigger. | KEEP |
| `feedback_auto_commit_end_feature.md` | feedback | workflow | 18 lines, recent (9 days). Still true and frequently-applied. | KEEP |
| `feedback_autonomy_100_only.md` | feedback | workflow | 11 lines, 47 days old. **Still referenced** in `.claude/skills/team/team-sdlc-index.md:165` and `.claude/skills/team/SKILL.md:529`. Live. | KEEP |
| `feedback_no_solo_dev_estimates.md` | feedback | doctrine | 16 lines, 4 days old. Still true, well-scoped. | KEEP |
| `feedback_no_unicode_emoji.md` | feedback | doctrine | 19 lines, 23 days old. PNG + Ionicons rule. Still true (no emoji creep observed in screens). Slightly verbose; line-3 path `shared/ui/liquidTheme.ts` not verified — would need a spot check. | KEEP (could trim by 30%) |
| `feedback_product_lifecycle_coherence.md` | feedback | doctrine | 11 lines, 33 days old. Still true (Musaium still in launch phase, no testimonials section landed). | KEEP |
| `feedback_check_tests_before_bug_classification.md` | feedback | workflow | 15 lines, 21 days old. Cites `chat-message-service.test.ts:403,:414` — path moved to `tests/unit/chat/chat-message-service.test.ts` (still resolves). Still true. | KEEP |
| `feedback_ci_service_requirements.md` | feedback | infra | 21 lines. Cites `app.ts:233` for `/api` mount + `pgvector/pgvector:pg16` image + Redis service requirement. Mechanism still correct, line numbers not re-verified. | KEEP |
| `feedback_tier_baseline_cap_discipline.md` | feedback | infra | 20 lines, ADR-012 cap. **Value drift:** memory says cap was 4→5 in C3 T6.2, current cap is **11** — the memory's value-history paragraph is already stale but mechanism + the rule itself remain correct. | EDIT — strip the specific historical value list, keep the rule |
| `feedback_nginx_variable_proxy_pass.md` | feedback | infra | 43 lines. Specific to `infra/nginx/conf.d/grafana.conf` (verified exists). Long but the diff-style examples are the load-bearing content. | KEEP (could trim by 20%) |
| `feedback_process_env_local_vs_ci.md` | feedback | infra | 40 lines, recent (today). **WRONG.** Says use `as string`. Code uses `typeofString()` helper at `museum-frontend/app.config.ts:52`. The MEMORY.md index summary contradicts BOTH the memory and the code. | **EDIT** — rewrite to reflect `typeofString()` pattern OR DELETE if `typeofString` is the new permanent answer |
| `project_no_staging_v1.md` | project | state | 24 lines. Still true. Has explicit "Sunset condition" + override pointer to `feedback_no_feature_flags_prelaunch`. | KEEP |
| `project_c2_ai_side_only.md` | project | state | 19 lines, recent. Still true (no user-side multi-image upload landed). | KEEP |
| `project_hybrid_product_philosophy.md` | project | state | 22 lines, 26 days old. Still true — core product direction. Cites "P0/P1" with day estimates that should have been killed by `feedback_no_solo_dev_estimates`, minor contradiction. | EDIT — strip the day estimates |
| `project_geolocation_pipeline.md` | project | log | **45 lines — too long.** Reads like a sprint changelog ("Frontend Fixed 4 bugs where location wasn't being sent"). Should be a 5-line invariant: "Chat backend uses LocationResolver (in-museum 20min cache, city no-cache) + Nominatim reverse geocode. ResolvedLocation flows via OrchestratorInput. FE always sends `lat:X,lng:Y` from useLocation()." | EDIT — compress to ≤8 lines |
| `project_ios26_crash_investigation.md` | project | incident | 27 lines, **37 days old**, says "DIAGNOSTIC PENDING" for Bug 2. Recent commits `58817475` (fix(auth,mobile): strip fragment in OAuth deeplink parser) suggest iOS work continues, but the memory has not been touched in 5+ weeks. Either Bug 2 is fixed and this memory is stale, or it's still pending and the memory has rotted. The MEMORY.md index already flags this with "re-verify before assuming current state" — which is honest but means the memory itself is doing nothing useful. | MOVE to `museum-frontend/docs/IOS26_CRASH_DIAG.md` (which AGENT-09 confirmed exists) — or DELETE the memory and rely on the doc |
| `reference_ios_build_chain.md` | reference | reference | 76 lines. Long but every section is load-bearing (Pods committed, fmt patch, ENTRY_FILE, pod install discipline). Cites real commits (`303a8cded`, `f7ec92f7`). The defense-in-depth section at the end could move to a doc but the rule core is correct. | KEEP (could trim defense-in-depth section) |

## P0 — Wrong / contradicted memories

### P0-1 — `feedback_process_env_local_vs_ci` says one thing, MEMORY.md says the opposite, code does a third thing
- **Path:** `/Users/Tim/.claude/projects/-Users-Tim-Desktop-all-dev-Pro-InnovMind/memory/feedback_process_env_local_vs_ci.md`
- **Memory says:** "Use `as string` (type assertion). Locally TS sees the cast as a no-op… On CI the cast narrows `any` → `string`."
- **MEMORY.md index says:** "keep String() wraps even when local lint says they're redundant" (line 29).
- **Live code says (`museum-frontend/app.config.ts:52,297,298`):**
  ```
  const typeofString = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : undefined;
  …
  organization: typeofString(process.env.SENTRY_ORG) ?? 'asili-design',
  ```
- **Severity:** **P0**. Every time an agent edits something env-related, this memory will steer them wrong (either toward `as string` OR `String()` depending on which version they read first).
- **Action:** **EDIT immediately.** Either rewrite both the memory and the MEMORY.md summary to recommend `typeofString()` (and document why — `typeof` narrowing is a true runtime check that works under both `Dict<string>` and `any` ambient typings), or DELETE both and let the `typeofString` helper speak for itself.

### P0-2 — CLAUDE.md says backend uses `.env.local.example`, file does not exist
- **Path:** `/Users/Tim/Desktop/all/dev/Pro/InnovMind/CLAUDE.md:147` — "Copy `.env.local.example` → `.env` in both `museum-backend/` and `museum-frontend/`"
- **Reality:** `museum-backend/.env.local.example` does not exist. Backend has `.env.example`, `.env.host-mode`, `.env.production.example`. Frontend has `.env.local.example`.
- **Severity:** **P0** for any new dev / new agent onboarding (first 5 minutes lie).
- **Action:** EDIT — split the instruction. `cp .env.example .env` for backend, `cp .env.local.example .env` for frontend.

## P1 — Stale memories

### P1-1 — `project_ios26_crash_investigation` — "DIAGNOSTIC PENDING" for 37+ days
- **Path:** `/Users/Tim/.claude/projects/-Users-Tim-Desktop-all-dev-Pro-InnovMind/memory/project_ios26_crash_investigation.md`
- **Issue:** Bug 2 (React bridge init crash) marked PENDING since 2026-04-05. Recent iOS-related commits suggest the chain has moved (e.g. `58817475 fix(auth,mobile): strip fragment in OAuth deeplink parser`). Either it's resolved or it's still pending — but no update for 37 days means the memory is doing zero useful work and is potentially misleading.
- **Action:** DELETE the memory OR fold its still-relevant content into `museum-frontend/docs/IOS26_CRASH_DIAG.md` (which AGENT-09 confirmed exists). The MEMORY.md hedge "re-verify before assuming current state" is an admission this entry is rotten.

### P1-2 — `project_geolocation_pipeline` — sprint changelog masquerading as memory
- **Path:** `/Users/Tim/.claude/projects/-Users-Tim-Desktop-all-dev-Pro-InnovMind/memory/project_geolocation_pipeline.md`
- **Issue:** 45 lines, 4 of them are "Fixed 4 bugs where location wasn't being sent: chatApi.ts postMessageStream() — added location to params + SSE body…" — this is a 2026-04-15 commit message, not a memory. The invariant is 1 paragraph; the rest is changelog.
- **Action:** EDIT to ≤8 lines covering: (1) LocationResolver cache strategy (in-museum 20min, city none); (2) Nominatim reverse geocode at >200m; (3) `ResolvedLocation` flows via `OrchestratorInput`; (4) FE sends `lat:X,lng:Y` via `useLocation()`; (5) shared util `haversineDistanceMeters` is canonical.

### P1-3 — `feedback_tier_baseline_cap_discipline` — value history outdated (current cap = 11, not 5)
- **Path:** `/Users/Tim/.claude/projects/-Users-Tim-Desktop-all-dev-Pro-InnovMind/memory/feedback_tier_baseline_cap_discipline.md`
- **Issue:** Memory recites a 2→4→5 history. Live cap is **11** (verified at `tests/integration/_smoke/integration-tier-baseline-cap.test.ts:40`). The historical recital adds noise and will keep rotting.
- **Action:** EDIT — strip the historical recital, keep the rule ("any entry in the JSON requires a same-commit cap bump + dated comment line").

### P1-4 — `project_hybrid_product_philosophy` carries solo-dev-day estimates
- **Path:** `/Users/Tim/.claude/projects/-Users-Tim-Desktop-all-dev-Pro-InnovMind/memory/project_hybrid_product_philosophy.md`
- **Issue:** Line 18 says "auto museum history on session start (P0, **1 day**), lightweight user preferences = guideLevel + content preference enum (history/technique/artist) optional (P1, **2 days**)". This is exactly what `feedback_no_solo_dev_estimates` (2026-05-08) tells the assistant NOT to do — internal contradiction within the memory set.
- **Action:** EDIT — strip "(P0, 1 day)" / "(P1, 2 days)" tags.

### P1-5 — CLAUDE.md says "34 files" of migrations, actual is 56
- **Path:** `/Users/Tim/Desktop/all/dev/Pro/InnovMind/CLAUDE.md:123` — "`museum-backend/src/data/db/migrations/*.ts` (34 files) | ~5 KB each, 172 KB total"
- **Reality:** 56 files (verified via `ls museum-backend/src/data/db/migrations/ | grep -v stryker | wc -l`).
- **Action:** EDIT — either update the number or strip it (the rule "read only the migration relevant to your work" doesn't need a count).

### P1-6 — CLAUDE.md claims `docs/ARCHITECTURE.md` / `docs/TEST_FACTORIES.md` / `docs/LINT_DISCIPLINE.md` "not yet extracted" — all three exist
- **Paths:** CLAUDE.md:100, :206, :218.
- **Reality:** All three files exist as of 2026-05-12 (AGENT-09 already flagged this — files sized 8 837 / 3 392 / 3 717 bytes). The "not yet extracted" hedge is 5+ days stale.
- **Action:** EDIT — replace the three hedge paragraphs with direct links: "See `docs/ARCHITECTURE.md`", "See `docs/TEST_FACTORIES.md`", "See `docs/LINT_DISCIPLINE.md`". Drop the "for now read the factories directly" workaround.

### P1-7 — CLAUDE.md references `.claude/tasks/` which does not exist
- **Path:** CLAUDE.md:28 — "Post-2026-04-20 runtime tracking : `.claude/tasks/` + `.claude/skills/team/team-reports/`."
- **Reality:** `.claude/tasks/` directory does not exist (verified). Only `.claude/skills/team/team-reports/` is the live writer location (already documented in CLAUDE.md:231).
- **Action:** EDIT — remove `.claude/tasks/` from line 28.

## P2 — Bloat / redundancy

### P2-1 — GitNexus block duplicated in `CLAUDE.md` AND `AGENTS.md`
- **Paths:** `CLAUDE.md:250-292` (43 lines) and `AGENTS.md:18-60` (43 lines). **Identical content.**
- **Token cost:** ~750 tokens per file, loaded twice per session = **~1 500 tokens wasted**. CLAUDE.md notes that GitNexus auto-injects the block (line 135: "Comportement intentionnel, ne pas effacer le marker") — but injecting it into BOTH files is double cost for the same information.
- **Action:** Configure `gitnexus analyze` to inject in ONE file only (recommend `AGENTS.md`, since `CLAUDE.md` already has the inline `# GitNexus — Code Intelligence` section starting at line 250… which is the auto-injected block). Or fold the manual GitNexus section in CLAUDE.md to match the auto-inject location. Net save: one of the two blocks.

### P2-2 — CLAUDE.md `Pièges connus` mixes ops gotchas with ADR-territory content
- **Path:** `CLAUDE.md:129-143`.
- **Issue:** 11 bullets, 2 are pure ADR content that bloats every session:
  - The `pgvector halfvec(N)` paragraph (line 142, ~80 words) belongs in ADR-037 (`docs/adr/ADR-037-visual-similarity-siglip-pgvector.md` — verified exists).
  - The SigLIP ONNX preprocessing paragraph (line 143, ~70 words) belongs in ADR-037 or the adapter file's JSDoc.
  - The Prometheus `static_configs.targets` paragraph (line 141, ~80 words) belongs in `infra/grafana/README.md` if it exists, or as a comment in the Prometheus config.
- **Token cost:** ~230 words × ~1.3 tokens = **~300 tokens of ADR detail loaded every session**.
- **Action:** Move the 3 detail-heavy bullets to their ADRs / config files. Replace with a 1-line pointer ("pgvector halfvec/SigLIP details: ADR-037 §gotchas").

### P2-3 — `reference_ios_build_chain.md` defense-in-depth section
- **Path:** memory `reference_ios_build_chain.md:73-76`.
- **Issue:** The "Defense in depth" subsection at the end describes JS-side mitigations (`loadWebBrowser` lazy require, `setGlobalHandler` downgrade) that are not part of the build chain — they're general error handling patterns.
- **Action:** EDIT — move that section to a separate memory or to `museum-frontend/shared/observability/`'s own docstring. Keeps the iOS build chain memory focused.

### P2-4 — `feedback_quality_doctrine.md` Rule 3 cites a 2026-04-06 audit anecdote
- **Path:** memory `feedback_quality_doctrine.md:38-41`.
- **Issue:** "CLAUDE.md said 'deploy Vercel' for museum-web but the real workflow deploys Docker/GHCR" — this is a 5-week-old example that adds context but isn't itself the rule. Could be a 1-line anecdote.
- **Action:** OPTIONAL trim. Not a priority.

## CLAUDE.md audit

- **Size:** 292 lines / 20 094 chars / ~5 100 tokens.
- **Sections (count + verdict):**
  - Project Overview (lines 1-15) — KEEP, dense.
  - Roadmap (17-28) — KEEP, but `.claude/tasks/` ref is dead (P1-7).
  - Common Commands (30-96) — KEEP, dense table.
  - Architecture (98-105) — **FOLD** — points at `docs/ARCHITECTURE.md` which now exists; this paragraph is the workaround that the doc-extract retired. Reduce to a 1-line pointer.
  - Path Aliases (107-113) — KEEP, terse.
  - Token Discipline (115-127) — KEEP, but migration count is stale (P1-5).
  - Pièges connus (129-143) — **FOLD** — 3 of 11 bullets are ADR-detail (P2-2). Keep the framework gotchas (Jest cache, gitignore docs/, GitNexus inject marker, TypeORM undefined, PgBouncer, SWC Relation, LlmCacheService).
  - Environment Setup (145-150) — **EDIT** — backend `.env.local.example` lie (P0-2).
  - Honesty UFR-013 (152-164) — KEEP, doctrine.
  - Migration Governance (166-173) — KEEP.
  - AI Safety (175-200) — KEEP, but `chat.service.ts` / `art-topic-guardrail.ts` paths now live under subfolders (`orchestration/`, `guardrail/`) — minor drift, agents will still find them via grep.
  - Test Discipline (202-212) — **EDIT** — `docs/TEST_FACTORIES.md` extracted, drop the hedge paragraph (P1-6).
  - ESLint Discipline (214-223) — **EDIT** — `docs/LINT_DISCIPLINE.md` extracted, drop the hedge paragraph (P1-6).
  - Team reports lifecycle (225-237) — KEEP, useful.
  - Deployment (239-243) — KEEP.
  - Dependency Monitoring / TypeORM (245-248) — KEEP, terse.
  - GitNexus auto-injected block (250-292) — **DUPLICATE of AGENTS.md** (P2-1).

- **Dead refs in CLAUDE.md:**
  - `.claude/tasks/` (line 28) — directory does not exist.
  - `.env.local.example` for backend (line 147) — does not exist.
  - "(34 files)" of migrations (line 123) — actually 56.
  - "`docs/ARCHITECTURE.md` is referenced in older docs but not yet extracted" (line 100) — extracted.
  - "Le doc séparé `docs/TEST_FACTORIES.md` est référencé mais pas encore extrait" (line 206) — extracted.
  - "Le doc séparé `docs/LINT_DISCIPLINE.md` est référencé mais pas encore extrait" (line 218) — extracted.
  - "`chat-message.service.ts`" / "`chat.service.ts`" / "`art-topic-guardrail.ts`" (lines 179, 187) — moved to subfolders; grep still resolves but path hint is stale.

- **Sections to fold / delete:**
  - Architecture paragraph (98-105) → fold to "See `docs/ARCHITECTURE.md`" + 1-line summary.
  - Test Discipline body → fold to "See `docs/TEST_FACTORIES.md`" + 2-line pattern reminder.
  - ESLint Discipline body → fold to "See `docs/LINT_DISCIPLINE.md`" + 2-line reminder.
  - 3 ADR-detail bullets in Pièges connus → move to their ADRs.
  - Duplicate GitNexus block (250-292) → resolve duplication w/ AGENTS.md (P2-1).
  - **Net savings: ~80 lines / ~1 500 tokens per session.**

## AGENTS.md audit

- **Size:** 60 lines / 3 311 chars / ~830 tokens.
- **Structure:** 17 lines of pointer-to-CLAUDE.md + 43 lines of GitNexus auto-injected block.
- **Relationship to CLAUDE.md:** The pointer pattern is good ("Content lives in CLAUDE.md to avoid duplication"). But then the GitNexus block at the bottom IS duplicated from CLAUDE.md verbatim (P2-1). So the file violates its own rule.
- **Action:**
  - KEEP the pointer header (lines 1-17).
  - Resolve GitNexus duplication (P2-1) — either keep the block here AND remove from CLAUDE.md, or keep in CLAUDE.md only. The auto-inject markers (`<!-- gitnexus:start -->`) are in BOTH files; configure GitNexus to write to one location.

## GitNexus auto-injection assessment

- **Block size:** 43 lines / ~750 tokens × 2 files (CLAUDE.md + AGENTS.md) = **~1 500 tokens per session**.
- **Content value:** The block has 3 useful pieces: (1) "23 843 symbols, 38 903 relationships, 300 execution flows" — useful for index freshness check, (2) the `gitnexus_impact` + `gitnexus_detect_changes` mandate, (3) the resource URI table. The CLI mapping table at the end (lines 51-58 of AGENTS.md / lines 283-290 of CLAUDE.md) duplicates what each skill's own SKILL.md frontmatter says, and Claude Code already auto-discovers skills — this part is pure bloat.
- **Verdict:** Block pays its token cost ONCE per session, not twice. It's loaded twice today. Half of it is ROI-positive (the "MUST run impact before edit" rule), the other half (resource URIs + CLI table) is reference material that belongs in `.claude/skills/gitnexus-guide/SKILL.md` and would be loaded only when needed.
- **Action:**
  1. Keep the GitNexus block in ONE file (recommend AGENTS.md since it's the one explicitly designed as the agent-pointer doc).
  2. Trim the CLI table at the bottom — Claude Code's skill autoloader makes it redundant.
  3. **Net save: ~1 000 tokens per session.**

## Skills memory check

- 27 skill directories under `.claude/skills/` — most are well-scoped (each has its own `SKILL.md`). No skill-level memory rot found in this audit pass (out of scope detail, see AGENT-09 for skills tree).
- `.claude/skills/team/` references `feedback_autonomy_100_only` and UFR-008 — verified live and consistent.
- `.claude/skills/team/team-reports/` is correctly documented as the runtime writer (CLAUDE.md:231 matches).

## Recommendations (concrete delete/edit/move list)

**Immediate (P0) — fix today:**

1. **REWRITE** `/Users/Tim/.claude/projects/-Users-Tim-Desktop-all-dev-Pro-InnovMind/memory/feedback_process_env_local_vs_ci.md` to recommend `typeofString(value)` (the helper used at `museum-frontend/app.config.ts:52`). Also fix the MEMORY.md index summary on line 29.
2. **EDIT** `/Users/Tim/Desktop/all/dev/Pro/InnovMind/CLAUDE.md:147` — split env bootstrap: `cp .env.example .env` (backend), `cp .env.local.example .env` (frontend).

**Soon (P1) — within a sprint:**

3. **DELETE** `/Users/Tim/.claude/projects/-Users-Tim-Desktop-all-dev-Pro-InnovMind/memory/project_ios26_crash_investigation.md` (37 days "PENDING"). Live tracker is `museum-frontend/docs/IOS26_CRASH_DIAG.md`.
4. **EDIT** `/Users/Tim/.claude/projects/-Users-Tim-Desktop-all-dev-Pro-InnovMind/memory/project_geolocation_pipeline.md` — compress 45 lines → ≤8 lines (invariant, not changelog).
5. **EDIT** `/Users/Tim/.claude/projects/-Users-Tim-Desktop-all-dev-Pro-InnovMind/memory/feedback_tier_baseline_cap_discipline.md` — strip historical value list (2→4→5), keep rule.
6. **EDIT** `/Users/Tim/.claude/projects/-Users-Tim-Desktop-all-dev-Pro-InnovMind/memory/project_hybrid_product_philosophy.md` — strip "(P0, 1 day)" / "(P1, 2 days)" tags (violates `feedback_no_solo_dev_estimates`).
7. **EDIT** `/Users/Tim/Desktop/all/dev/Pro/InnovMind/CLAUDE.md`:
   - Line 28 — remove `.claude/tasks/` (does not exist).
   - Line 100-105 — replace Architecture hedge with `→ docs/ARCHITECTURE.md`.
   - Line 123 — fix migration count or strip it.
   - Lines 206 + 218 — replace "not yet extracted" hedges with direct doc links.

**Bloat (P2) — when refactoring CLAUDE.md:**

8. **MOVE** ADR-detail bullets from CLAUDE.md `Pièges connus` (3 bullets: pgvector halfvec, SigLIP preprocessing, Prometheus targets) → ADR-037 + `infra/grafana/` config comment.
9. **RESOLVE** GitNexus duplication between CLAUDE.md:250-292 and AGENTS.md:18-60 — configure `gitnexus analyze` to inject in one file only (recommend AGENTS.md).
10. **TRIM** the GitNexus CLI table (gitnexus-exploring / -impact-analysis / -debugging / -refactoring / -guide / -cli) — Claude Code's skill autoloader handles discovery.
11. **OPTIONAL** — `reference_ios_build_chain.md` defense-in-depth section → move to `museum-frontend/shared/observability/` JSDoc.

**Net effect if all applied:**

- 1 hard contradiction resolved.
- ~80 lines / ~1 500 tokens saved per session on CLAUDE.md.
- ~750 tokens saved per session on GitNexus de-duplication.
- 1 memory deleted (ios26), 4 memories edited.
- 1 P0 onboarding lie fixed.

---

## 5-line summary

- **Hygiene score: 62/100.** 11 of 17 memory files clean; 1 P0 contradiction, 6 P1 staleness items.
- **Tokens wasted/session: ~5 800.** Largest offender: GitNexus block duplicated across CLAUDE.md + AGENTS.md (~1 500). Second: CLAUDE.md "not yet extracted" hedge paragraphs forcing re-reads (~400). Third: 5 over-long memory files (~3 800 that could be ~800).
- **Worst-offender memory:** `feedback_process_env_local_vs_ci.md` — recommends `as string`, MEMORY.md index summary contradicts and recommends `String()` wraps, live code uses neither (`typeofString()` helper at `museum-frontend/app.config.ts:52`). Triple-contradiction.
- **Memory that contradicts current code:** Same as above — `feedback_process_env_local_vs_ci.md` is the only hard contradiction. Soft drifts: `project_ios26_crash_investigation` (DIAGNOSTIC PENDING for 37 days), `feedback_tier_baseline_cap_discipline` (cap value 5 → actually 11), CLAUDE.md migration count (34 → 56), CLAUDE.md `.claude/tasks/` (doesn't exist).
- **Recommended deletes: 1** (`project_ios26_crash_investigation`). Recommended edits: 5 memory files + CLAUDE.md (7 distinct edits) + AGENTS.md GitNexus dedup. Recommended moves: 3 (ADR-detail bullets → ADR-037, defense-in-depth → observability JSDoc, ios26 → existing crash doc).
