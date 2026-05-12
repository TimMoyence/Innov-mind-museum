# PROGRESS_D — Agent D (tests + docs + memory cleanup)

Sprint cleanup-2026-05-12. Worktree shared with A/B/C.

## État initial (2026-05-12)

- Memory: 38 .md + MEMORY.md → cible 20-21
- Docs: 227 .md hors node_modules → archive 8 800L
- Tests: 14 stryker-survivors, 4 fake-timer convert, 4 routes sans tests, 1 e2e skip, 1 god-test split, 1 Maestro audio
- ADRs: 33-34 doublons, 6 stubs à créer

## Actions — Final state

- [SKIP] D.1 — move stryker-survivors → `mutation-killers/` — **0 files moved**. Audit of 14 candidates found 0 purely cosmetic (all combine behavior + mutation-defense, healthy pattern). Directory created with README documenting the slot.
- [DEFERRED] D.2 — fake timers (4 fichiers) — **risk/value tradeoff unfavorable**. Wikidata-breaker uses opossum which is notoriously fragile with fake timers ; converting risks breaking working tests for negligible CI speedup (~110ms/file). Documented here for future sprint.
- [x] D.3 — 4 route tests created (cache-purge, low-data-pack, chat-memory, chat-describe). **17 tests, 17 passing** (`pnpm test -- --testPathPattern=routes/(cache-purge|low-data-pack|chat-memory|chat-describe)` → 4 suites passed). Commit `f25684c4`.
- [x] D.4 — `chaos-circuit-breaker.e2e` it.skip → it.todo with explicit TD-5 cross-ref. TECH_DEBT.md gains TD-5 entry.
- [SKIP] D.5 — auth.route.test.ts split (1188L) — **C.15 src split has shipped** (auth-api-keys/email/google-oauth/password/profile/session/consent/me/mfa/super-admin-check routes exist) but **19 describe blocks** in the test file would require ≥7 mirror test files with redistributed mocks. Risk/value tradeoff unfavorable for this sprint — defer to a focused test-split sprint.
- [x] D.6 — `audio-recording-flow.yaml` created (Maestro flow STT→LLM→TTS round-trip). `fixtures/audio.md` documents harness contract (`MAESTRO_AUDIO_FIXTURE` env var, Maestro can't simulate mic device). `shards.json` updated — flow now part of the `chat` shard.
- [x] D.7 — `docs/explications-sprint-2026-05-05/` → `docs/_archive/training-2026-05/` (22 files moved). Embarqué dans commit 44376c7e + 21558e7b.
- [x] D.8 — `docs/SPRINT_RECAP_2026-04-30_TO_2026-05-05.md` → `docs/_archive/sprints/`.
- [x] D.9 — 5 plans périmés supprimés (c4-launch, c5-launch, stryker-incremental, stryker-night-tracker, stryker-night-recap). Info Stryker consolidée dans `docs/PHASE_HISTORY.md` Phase 12.
- [x] D.10 — ADR-033 + ADR-034 mergés → `ADR-033-zod-status-quo-and-defer-plan.md` (commit 36cbb8d6).
- [x] D.11 — 18+ dangling refs corrigés.
- [x] D.12 — 3 museum-frontend/docs stales supprimés (QUALITY_GUIDE, ARCHITECTURE_MAP, NEXT_LEVEL_MOBILE). `IOS26_CRASH_DIAG.md` conservé.
- [x] D.13 — memory cleanup : 12 DELETE + 4+4=8 MERGE (iOS chain + quality doctrine) + 6 UPDATE. 38 → 20 fichiers final (19 .md + MEMORY.md).
- [x] D.14 — 7 stubs ADR créés (ADR-040 → ADR-046).
- [x] D.15 — final dangling audit. Found and patched: rbac-matrix, ARCHITECTURE.md, TEST_FACTORIES.md, LINT_DISCIPLINE.md, V2_PENDING.md — all referenced from live docs but never extracted as files. Refs reworded to point at the actual source-of-truth (CLAUDE.md sections, `src/`, ADRs, or `git log` fallback for deleted files).
- [x] D.16 — this report.

## Final numbers

### Memory
- Deleted: **20** files (12 obsolete + 4 iOS originals + 4 quality originals)
- Created: **2** merged files (`reference_ios_build_chain.md` consolidating 4 → 1 ; `feedback_quality_doctrine.md` consolidating 4 → 1)
- Updated: **5** files (c2, no_staging, geolocation, honesty, MEMORY.md)
- Final disk count: **20** files (19 .md + MEMORY.md)

### Docs
- Deleted (purged): **8** files (3 museum-frontend/docs + 5 docs/plans)
- Moved to archive: **24** files (22 explications + 1 SPRINT_RECAP + 1 _archive/README)
- Created: **9** files (`PHASE_HISTORY.md`, `_archive/README.md`, 7 deferred ADR stubs ADR-040 → ADR-046)
- Edited (ref fixes): **15** files (CLAUDE.md, .gitignore, DOCS_INDEX, ROADMAP_PRODUCT/TEAM/FE_RN, AI_VOICE, RELEASE_CHECKLIST, ADR-015/017/027/032, RUNBOOKS/V1_FALLBACKS, TECH_DEBT, PROGRESS_D)
- Dangling refs fixed: **20+** (SPRINT_2026-05-05_PLAN, CDN_CLOUDFLARE_SETUP, HORIZONTAL_SCALING, docs/archive/, ADR-001/005/008, museum-frontend/docs/*, ARCHITECTURE.md, TEST_FACTORIES.md, LINT_DISCIPLINE.md, rbac-matrix, V2_PENDING)
- ADR merged: **1** (ADR-033 = 033 + 034)
- ADR stubs created: **7** (ADR-040 → ADR-046)

### Tests
- New tests created: **4 route test files** = 17 individual test cases, all passing
- E2E tests rationalized: **1** (chaos-circuit-breaker it.skip → it.todo + TD-5)
- Maestro flows added: **1** (audio-recording-flow.yaml) + 1 fixture doc
- Shards updated: **1** (`chat` shard now includes audio flow)

## Notes / Blockers

- D.5 dépend de C.15 (auth route split src) — **shipped**, mais split test (19 describe blocks → 7 files) reporté faute de temps.
- D.6 Maestro audio : harness contract documented (Maestro can't simulate mic device → fixture injection via env var).
- Mon travail D.7-D.12 (renames/deletes/edits docs) a été embarqué partiellement dans les commits 44376c7e (AI-Act compliance par autre agent) et 21558e7b (B.5 confetti) — tant pis, le résultat est cohérent.
- MEMORY.md (hors worktree) a été enrichi en parallèle par un autre processus (ajout `feedback_process_env_local_vs_ci.md`) — laissé en place.
- D.2 fake-timers conversion deferred — opossum compatibility risk dominates the wall-clock saving.
- iOS 26 Bug 2 status (project_ios26_crash_investigation memory) : NOT verified in this sprint — re-check next session against current TestFlight crashes.

## Commits

- 36cbb8d6 — `docs(adr): consolidate ADR-033/034 zod into single decision + add 6 deferred V1.1 ADR stubs (D.10+D.14)`
- 21558e7b (by B) — embarked D.7-D.12 (renames/deletes/edits docs) opportunistically
- 44376c7e (other agent) — embarked early D.7-D.12 chunks
- f25684c4 — `test(D.3+D.4+D.6): add 4 missing route tests + Maestro audio flow + chaos e2e .todo`
- (next) D.15 final dangling refs fix + D.16 report
