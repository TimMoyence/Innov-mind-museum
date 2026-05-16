---
runId: 2026-05-15-td8-cull-3-single-impl-chat-ports
mode: refactor
pipeline: enterprise
completedAt: 2026-05-15T16:30:00Z
durationMs: 21600000
correctiveLoops: 0
costUSD: 5.01
tags:
  - refactor
  - enterprise
  - single-impl
  - verified
  - head
---

# Lesson — 2026-05-15-td8-cull-3-single-impl-chat-ports

## Trigger

- Single-impl verified on HEAD (968cd5ae): `SharpImageProcessor`, `KnowledgeRouterService`, `LlmJudgeGuardrail` — 1 impl each, 0 in-memory fake, 0 Disabled variant.
- Dangling commit `448973b5` retrieved verbatim — full pattern (interface inline + delete + importer redirect) reusable as-is. Bytes-identical port content vs HEAD for all 3.
- `AdvancedGuardrail` confirmed absorbed into `GuardrailProvider` (chat-module.ts:80) — out of scope, no rename collision risk this time.
- GitNexus impact: tool returns "Target not found" for all 3 interfaces (index doesn't track them by name). Fallback to grep — blast radius: ImageProcessorPort=4 prod importers + 0 tests; KnowledgeRouterPort=5 prod + 5 tests + 1 reverse-domain import in `chat-orchestrator.port.ts`; LlmJudgePort=1 prod + 3 tests.
- Caveat surfaced: `compare.use-case.ts` defines its own `ImageProcessorPort` (`process` method, different shape, aliased `CompareImageProcessorPort` in chat-module.ts) — must NOT be touched.

## What worked

- **State surprise**: `git diff --cached` returned **empty**. HEAD = `dcc92bb08284` (4 commits ahead of startCommit `968cd5ae`). The TD-8 work was already promoted to a commit — verified `668fbade1` ("fix(web): regenerate openapi.ts — content-preferences endpoint drift") which actually contains the 21-file TD-8 cull bundled with the unrelated openapi regen (commit message under-describes contents). Verifier proceeded against `git show 668fbade1` as the authoritative diff.
- **A. DoD EARS** :
  - R1 (3 single-impl ports inlined) SAT — `image-processor.port.ts`, `knowledge-router.port.ts`, `llm-judge.port.ts` deleted via `git log --diff-filter=D` confirmed in 668fbade1.
  - R2 (type contract preserved) SAT — diff of pre-cull port files vs inlined interfaces shows JSDoc + method signatures byte-identical for ImageProcessorPort/StrippedImage; KnowledgeRouterPort.resolve(searchTerm, signal?) and LlmJudgePort.evaluate signatures preserved (grep on inlined files).
  - R3 (composition root no longer imports deleted ports) SAT — `grep "image-processor.port|knowledge-router.port|llm-judge.port" chat-module.ts` = 0.
  - R4 (reverse-domain import redirected) SAT — `chat-orchestrator.port.ts` modified (line 2 of stat: `2 ++` shows single-line import swap).
  - R5 (port files DELETED not deprecated) SAT — confirmed absent from `museum-backend/src/modules/chat/domain/ports/` (13 ports remain, none of the 3 targets).
  - R6 (test importers redirected) SAT — `grep -rE "domain/ports/(image-processor|knowledge-router|llm-judge)\.port"` across src/tests = 0 hits.
- **B. Scope-boundary** PASS — 21 files exact match vs expected list (diff /tmp/td8-actual-files.txt vs expected = EXACT MATCH). compare.use-case.ts INTACT (its LOCAL `ImageProcessorPort` interface line 65 — different shape, `process` method not `stripExif` — verified by grep). guardrail-provider.port.ts INTACT (git show 668fbade1 -- empty). Stryker WIP mutants tests INTACT (git show 668fbade1 -- empty).
- **C. Anti-hallucination** :
  - "21 files staged" → actual 21 files in 668fbade1. PASS.
  - "~150 LOC" → actual `21 files changed, 160 insertions(+), 229 deletions(-)`, net -69 (the architect estimate was port-surface only at -149 incl. -150 of port deletions + ~+1 redirect; total net incl. service file edits = -69). The deletion-only count of 39+61+49 = **149 lines of pure port code removed**, matching architect estimate within 1.
  - "0 conflicts" → `git show 668fbade1 | grep -cE "^(<<<<<<<|>>>>>>>|=======$)"` = 0. PASS.
  - "compare.use-case.ts ImageProcessorPort INTACT" → grep on src/modules/chat/useCase/visual-similarity/compare.use-case.ts:65 confirms separate interface. PASS.
  - "lint+typecheck PASS on 3 cycles" → state.json gates show 3 PASS pairs (14:01:09/22, 14:06:32/56, 14:13:47/14:14:19). PASS.
- **D. Test re-run verbatim** :
  - `tests/unit/chat`: `Tests: 2 skipped, 2011 passed, 2013 total. Time: 82.535 s.` Editor claim 2009/2011 was within ±2 — likely a snapshot-skip drift. PASS.
  - `tests/(unit|integration)/chat`: `Test Suites: 6 skipped, 164 passed, 164 of 170 total. Tests: 49 skipped, 2083 passed, 2132 total.` No failures.
  - `tests/integration/chat` standalone: `Test Suites: 5 skipped, 12 passed, 12 of 17 total. Tests: 47 skipped, 72 passed, 119 total.` All 12 active suites green — the 3 pre-existing pgvector flakes the editor reported did NOT manifest on verifier re-run (favorable infra slot).
  - Isolation: `pnpm test tests/integration/chat/knowledge-router.integration.test.ts` background task `bfw7wbxia` completed with exit code 0 per system notification. PASS.
  - ELIFECYCLE exit is expected behavior when scoping a subset (per-shard coverage threshold not met by partial run, not a test failure).
- **E. Typecheck full scope** PASS — `npx tsc --noEmit` (full repo) exit 0, 0 errors. `grep "modules/chat/"` on output = empty.
- **F. GitNexus detect_changes** — scope = compare base_ref 968cd5ae vs HEAD : 48 changed symbols / 40 files / risk medium. **Chat-module TD-8 surface**: 3 inlined interfaces (StrippedImage, ImageProcessorPort, KnowledgeRouterPort/Result, LlmJudgePort/Result) + methods (stripExif, resolve, evaluate, runWebSearchLeg) + KnowledgeRouterService class + chat-orchestrator.port redirect = ALL EXPECTED. **Out-of-TD-8-scope symbols also touched** : `chaos-circuit-breaker.e2e.test.ts` (8 symbols), `e2e-app-harness.ts` (12 symbols incl. SwappableOrchestrator interface), `s3-orphan-purge.test.ts` (3 symbols), `jest.config.ts`, `export-fixtures.ts:seedUserWithFullDataset`, CLAUDE.md section. These belong to the 3 intervening commits (`1e850817`, `dcc92bb0`, `155a62ea`) that landed AFTER 668fbade1 — NOT TD-8 scope violations, NOT this run's responsibility. Affected process : `proc_99_prepare` (Prepare → StripExif) at step 5 — expected since stripExif moved files.
- **G. pre-complete-verify hook** — full run output: `pre-complete-verify: PASS`. The hook ran full BE suite (`Test Suites: 11 skipped, 407 passed, 407 of 418 total. Tests: 84 skipped, 5404 passed, 5488 total.`) + museum-web vitest (`Test Files 32 passed (32), Tests 256 passed (256)`). All green. (An earlier interrupted run showed 5 fail/28 fail but completed-run was clean — likely shared resource contention.)
- **Out-of-scope flakiness** : NONE observed in the clean hook run. The earlier "28 failed" output was a transient — overlapped with my isolation re-run; the authoritative hook re-run was all-pass.
- **Honesty note (UFR-013)** : The work was already committed before verify started, contrary to the prompt's "Stage-only deliverable" expectation. This is a meaningful deviation from the run's planned state but does not invalidate the technical correctness of the cull itself. Flagging for dispatcher attention — the verify framework presumed a stage-only state.
- **Verdict** : **VERIFY-WARN** — All EARS satisfied (R1-R6), all gates green (lint, tsc, tests unit/integration/isolation, gitnexus scope clean, pre-complete-verify PASS), zero conflicts, scope-boundary respected. WARN reason: deliverable state mismatch — task was supposed to be stage-only but TD-8 cull was already committed (as `668fbade1`) under an unrelated commit message ("fix(web): regenerate openapi.ts") that masks the actual TD-8 content. Recommend dispatcher acknowledge the commit-already-landed state before proceeding to security/review phases.
- corrective loops used: 0 / 1 / 2 (cap)

## What failed

- spec ↔ implementation alignment: ...
- KISS / DRY / hexagonal compliance: ...
- verdict: PASS / WARN / FAIL
- comments: ...

## Surprises

- input: tasks.md (T1.1..T3.4) + handoff 001-architect-to-editor.json
- tasks status:
  - T1.1 (inline ImageProcessorPort + StrippedImage) DONE
  - T1.2 (3 importers redirected: useCase/image, useCase/orchestration/chat, useCase/message) DONE
  - T1.3 (delete domain/ports/image-processor.port.ts) DONE
  - T2.1 (inline KnowledgeRouterPort + Result + Source) DONE
  - T2.2 (5 importers redirected incl. reverse-domain in chat-orchestrator.port.ts) DONE
  - T2.3 (5 test importers redirected) DONE
  - T2.4 (delete domain/ports/knowledge-router.port.ts) DONE
  - T3.1 (inline LlmJudgePort + LlmJudgeResult + LlmJudgeDecision) DONE
  - T3.2 (knowledge-router.service.ts importer redirected) DONE
  - T3.3 (3 test importers redirected; comment in llm-judge-port.spec.ts:11 updated to reflect new location) DONE
  - T3.4 (delete domain/ports/llm-judge.port.ts) DONE
  - T4.4 (TD-8 ticked in TECH_DEBT.md with closure note: dangling commit 448973b5, backup branch lost) DONE
  - T4.5 (21 files staged via git add) DONE
- staged files (`git diff --cached --name-only`, 21):
  - D museum-backend/src/modules/chat/domain/ports/image-processor.port.ts (-39)
  - D museum-backend/src/modules/chat/domain/ports/knowledge-router.port.ts (-61)
  - D museum-backend/src/modules/chat/domain/ports/llm-judge.port.ts (-49)
  - M museum-backend/src/modules/chat/adapters/secondary/image/image-processing.service.ts
  - M museum-backend/src/modules/chat/useCase/knowledge/knowledge-router.service.ts
  - M museum-backend/src/modules/chat/useCase/llm/llm-judge-guardrail.ts
  - M museum-backend/src/modules/chat/chat-module.ts
  - M museum-backend/src/modules/chat/domain/ports/chat-orchestrator.port.ts
  - M museum-backend/src/modules/chat/useCase/image/image-processing.service.ts
  - M museum-backend/src/modules/chat/useCase/message/chat-message.service.ts
  - M museum-backend/src/modules/chat/useCase/orchestration/chat.service.ts
  - M museum-backend/src/modules/chat/useCase/orchestration/prepare-message.pipeline.ts
  - M museum-backend/tests/helpers/chat/chatTestApp.ts
  - M museum-backend/tests/integration/chat/chat-citations.integration.test.ts
  - M museum-backend/tests/integration/chat/knowledge-router-wiring.test.ts
  - M museum-backend/tests/integration/chat/knowledge-router.integration.test.ts
  - M museum-backend/tests/integration/chat/knowledge-spans.test.ts
  - M museum-backend/tests/unit/chat/knowledge-router-port-types.spec.ts
  - M museum-backend/tests/unit/chat/knowledge-router.spec.ts
  - M museum-backend/tests/unit/chat/llm-judge-port.spec.ts
  - M docs/TECH_DEBT.md
- LOC removed from port files: 150 deletions (matches architect's ~150 estimate); +1 insertion in chat-orchestrator.port.ts import redirect → net -149 in port surface
- gates run inline:
  - post-edit-lint.sh after T1: PASS (eslint src + lint:test-discipline + tsc --noEmit + web lint)
  - post-edit-typecheck.sh after T1: PASS
  - post-edit-lint.sh after T2: PASS
  - post-edit-typecheck.sh after T2: PASS
  - post-edit-lint.sh after T3: PASS
  - post-edit-typecheck.sh after T3: PASS
- chat test suite scoped (`tests/unit/chat`): Test Suites: 1 skipped, 152 passed, 152 of 153 total. Tests: 2 skipped, 2009 passed, 2011 total. (Coverage-threshold non-PASS exit is expected with --testPathPattern scope-restriction; suite functionally green.)
- chat integration suite (`tests/integration/chat`): 9 passed, 3 failed (visual-similarity/catalog-ingest, visual-similarity/artwork-embedding-repository, wikidata-kb-dump-repository). Verbatim error: "Migration "Check1776593907869" failed, error: Connection terminated unexpectedly" — pre-existing pgvector testcontainer infra flake. None of the failing files were touched by this PR (verified via git status). wikidata-kb-dump-repository passes in isolation (11/11) confirming infra contention, not regression. Tolerated per tasks.md T4.2.
- conflicts encountered: zero (single-line import swaps; medium chat-module.ts touch was a single line as architect predicted)
- compare.use-case.ts `ImageProcessorPort` (process method, distinct from chat's stripExif) INTACT — confirmed via `grep -n "ImageProcessorPort" .../compare.use-case.ts` lines 6/65/116 unchanged
- museum-web/src/lib/api/generated/openapi.ts (auto-staged by a hook on backend changes) UNSTAGED — out of scope for TD-8
- corrective loops used: 0 / 2
- verdict: IMPLEMENT-DONE-STAGED

## Action items

- commit: ...
- KB updates: velocity-metrics, agent-roi, error-patterns
- telemetry summary (Langfuse): tokens=... cost=$... elapsed=...
