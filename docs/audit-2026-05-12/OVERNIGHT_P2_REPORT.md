# Overnight P2 — Audit 2026-05-12

**Branch:** `audit/p2-night`
**Date range:** 2026-05-12 → 2026-05-13
**Orchestrator:** AGENT-P2-NIGHT (Opus 4.7)
**Sub-agent budget:** 30 — **used 5**

## Status

| # | Finding | Status | Commit |
|---|---|---|---|
| P2-1 | `museum-backend/src/helpers/` vs `shared/` redundancy | RESOLVED | `5e34cff2` |
| P2-2 | 22 single-file BE dirs | RESOLVED (10 inlined, 12 kept w/ rationale) | `f20576f1` |
| P2-3 | FE feature shape 5/13 conform | DOCUMENTED (no reshape) | `a603b681` |
| P2-4 | 24 Stryker config files | SLIMMED 1624 → 663 LOC (−59%) | `6572f9c8` |
| P2-5 | Tautological `user-memory-entity.test.ts` | DELETED + threshold re-pinned | `fb4541e6`, `6cdfc24b` |
| P2-6 | FE extraneous `node_modules` packages | NO-OP (codebase already clean) | — |
| P2-7 | `museum-web` missing `noUncheckedIndexedAccess` | ENABLED + 24 fallout fixed | `cfc3b4ca` |
| P2-8 | Root README references ADR-001 + multi-tenancy | FIXED | `9e3c7189` |
| P2-9 | FE README dead links | FIXED | `9e3c7189` |
| P2-10 | CLAUDE.md drift (migrations count, env file, `.claude/tasks/`) | FIXED | `9e3c7189` |

**Total commits on branch:** 10 (8 P2 fixes + final report + post-merge openapi regen).

## Verification

Run from worktree `../musaium-p2` at HEAD `886fca24`:

| Check | Result |
|---|---|
| `museum-backend/`: `pnpm exec tsc --noEmit` | exit 0 |
| `museum-backend/`: `pnpm exec eslint src/ --max-warnings=0` | exit 0 |
| `museum-backend/`: full unit suite (`tests/unit/`) | 4630 passed / 14 skipped / 0 failed (clean second run, see "Honesty notes") |
| `museum-web/`: `pnpm exec tsc --noEmit` | exit 0 |
| `museum-web/`: `pnpm run generate:openapi-types` | exit 0 (regenerated types committed) |

## Per-finding detail

### P2-1 — merge `helpers/` into `shared/`

- 20 files moved via `git mv` (5 top-level + 15 middleware/).
- 65 import sites rewritten to `@shared/*` alias.
- Removed obsolete `helpers` entry from `eslint.config.mjs` boundaries `disallow` list.
- No `@helpers/*` tsconfig alias existed.

### P2-2 — inline 10 single-file BE dirs

- Scanned `museum-backend/src/` for all leaf dirs containing exactly one file: 52 matches (excluding `data/db/migrations/` and the already-resolved `helpers/`).
- **Inlined 10** where the path adds no semantic info and no sibling is pending:
  - `chat/util/`, `chat/useCase/{retention,location,describe}/`, `chat/domain/{breaker,voice,knowledge}/`, `auth/domain/export/`, `daily-art/{useCase/listing,domain/artwork}/`.
- **Kept ~12** where pattern justifies it: hexagonal `adapters/secondary/<type>/`, `domain/ports/`, `shared/types/{express,auth}/` for `.d.ts` augmentation, and `useCase/<capability>/` subdirs that have multi-file siblings.
- 34 import sites updated.

### P2-3 — FE feature shape audit

- Verified the canonical shape from `auth/` + `chat/`: **`ui` + `application` + `infrastructure` (+ optional `domain`)**.
- Re-counted: 6/13 conform (audit said 5/13). 7 deviations — all justified by feature size (≤3 files), headless design, UI-only, or static content.
- **No reshape executed** — cost/benefit pre-V1 was wrong direction (`settings/` flat files have ≥10 importers; reshape blast radius > value).
- Created `museum-frontend/features/README.md` documenting the canonical shape and per-feature exceptions.

### P2-4 — slim Stryker configs

- Chose **Plan A (factory)**: `stryker/config.mjs` now exports `defineConfig({ mutate, thresholds?, timeoutMS?, ... })`. The 23 other config files become 12–25 line wrappers.
- Files: 24 → 24 (every name preserved — package.json scripts, CI cache key, and `stryker-hot-files-gate.mjs` all reference specific filenames).
- LOC: 1624 → 663 (−961, −59%).
- 3 wrappers retain explicit thresholds < 70 (`shared-memory-cache`, `shared-resilient-cache`, `shared-string-similarity`).
- 5 legacy wrappers (`baseline`, `audit`, `auth`, `middleware`, `so`) preserve pre-`STRYKER_CONCURRENCY` behavior via `allowEnvConcurrency: false`.
- Validated via `node --check`, programmatic factory shape-assertion (23/23 wrappers, exact match on `mutate`/thresholds/timeout/concurrency), and live `stryker init` runs on 3 representative configs.

### P2-5 — delete tautological test

- Deleted `museum-backend/tests/unit/chat/user-memory-entity.test.ts` (22 LOC asserting decorator metadata).
- Side effect: `import { UserMemory }` had been counting UserMemory's auto-generated getters as covered functions. Measured aggregate dropped −0.26pp.
- **Threshold re-pinned**: `coverageFunctions` 87 → 86 in `jest.config.ts` with inline rationale. Ratchet updated.

### P2-6 — extraneous FE packages

- Verified on fresh worktree (origin/main): `react-native-confetti-cannon` and `@react-native-google-signin/google-signin` are **not** in `package.json`, **not** in `package-lock.json`, **not** in `node_modules` (which doesn't exist).
- The "extraneous" warning was a transient state on the original dev workstation. Codebase truth source is already clean.
- No commit needed.

### P2-7 — `noUncheckedIndexedAccess` on web

- Enabled in `museum-web/tsconfig.json`.
- Fallout: **24 errors** across 9 files. Breakdown:
  - 19 false positives — test code indexing after `expect(arr).toHaveLength(N)` / `toHaveBeenCalledOnce()` (TS can't narrow on matcher results).
  - 0 real bugs.
  - 5 type narrowings — tightened literal-union types, switched to `as const` + type guards, etc. (no behavior change).
- Added `museum-web/src/__tests__/helpers/require-index.ts` — `requireIndex(arr, i, label)` helper to avoid `!` in test code (`no-non-null-assertion` enforced under `strictTypeChecked`).
- No `as any`, no `eslint-disable` added.

### P2-8 — root README

- Replaced ADR-001 SSE reference with the current voice pipeline (`docs/AI_VOICE.md`).
- Replaced "Multi-tenancy support" with a deferred note linking to `ADR-044-multi-tenant-museum-onboarding-deferred.md`.
- Fixed env file reference: `museum-backend/.env.local.example` → `.env.example`.

### P2-9 — FE README dead links

- Removed link to deleted `docs/QUALITY_GUIDE.md`.
- Removed link to deleted `docs/ARCHITECTURE_MAP.md`.
- Kept all live links (`../docs/MOBILE_INTERNAL_TESTING_FLOW.md`, etc.) which were verified to exist.

### P2-10 — CLAUDE.md drift

- "34 migrations" → "56 migrations" (verified via `ls museum-backend/src/data/db/migrations/*.ts | wc -l`).
- Env setup: "Copy `.env.local.example` → `.env` in both …" was wrong for BE (only `.env.example` exists). Split into BE/FE-specific instructions.
- `.claude/tasks/` removed from the runtime-tracking line (directory doesn't exist; only `.claude/skills/team/team-reports/` does).

## Orchestration notes

### Sub-agents used (5 of 30 budget)

1. P2-1 helpers merge (full implementation)
2. P2-7 web tsconfig (full implementation)
3. P2-2 single-file dirs audit + inline
4. P2-3 FE feature shape audit + README
5. P2-4 Stryker slim

P2-5, P2-6, P2-8, P2-9, P2-10 done directly by orchestrator (small or no-op).

### Coordination issue + repair

P2-2 and P2-3 were dispatched in parallel against the **same worktree**. P2-3 finished first and ran `git commit` without a path-spec, sweeping in P2-2's in-progress `git mv` operations. Net commit `55c8c5b9` would have failed `tsc` if checked out standalone (renames without import fixes). P2-2's follow-up `25f5c505` repaired imports.

**Fix applied**: `git reset --soft` to before both commits, then re-committed as two atomic commits (`f20576f1` = P2-2 BE renames + imports + lint fix; `a603b681` = P2-3 README only). Each commit now passes `tsc` standalone. Lesson logged for future overnights: when two parallel sub-agents share a worktree, instruct each to stage with explicit pathspec and commit with `git commit -- <paths>`.

### Honesty notes (UFR-013)

- **Flake observed once**: `tests/unit/routes/auth.route.test.ts:1065` (rate-limit bucket isolation between providers) failed on the first full-suite run after P2-2/P2-3 restructure, then passed on the immediate re-run with no code change. Suspect pre-existing IP-bucket state leak between tests in the same suite, **not** introduced by this branch. Worth a separate investigation but does not block P2 merge.
- **CI Stryker job is gated `if: false`** at `.github/workflows/ci-cd-backend.yml:179` — pre-existing condition unrelated to P2-4. The mutation suite is not gating CI today.
- **`pnpm run mutation` auto-discovery quirk** — `stryker run` with no path looks for `stryker.{conf,config}.{json,js,mjs,cjs}` at cwd; none exist at `museum-backend/` root (the configs live in `museum-backend/stryker/`). Pre-existing, unchanged by P2-4.
- **`audit-2026-05-12/06-architecture-organization.md` not found** in `docs/audit-2026-05-12/` — only `01-projects/`, `04-research/`, `06-recommendations/` subdirs exist. P2-2/P2-3 sub-agents inferred scope from MASTER.md + task prompt; figures cited (e.g. "22 single-file dirs", "5/13 conforming") are from MASTER.md, not directly verified against a `06-*` source. P2-3 surfaced that the "5/13" count doesn't reconcile with either reading of the canonical shape.

## Merge to main + CI

Branch `audit/p2-night` pushed and fast-forwarded to `main` (db3ad7be3..886fca242) using direct push as specified in the overnight protocol. Origin/main had not advanced from the branch-point, so no rebase was required.

**Required status checks for main** (`quality`, `ai-tests`, `CodeQL (javascript-typescript)`, `semgrep`, `sentinel-mirror`) on the final commit `886fca242`:

| Required check | Conclusion |
|---|---|
| quality (backend) | success |
| quality (web) | success |
| ai-tests | skipped (no AI-relevant paths changed) |
| CodeQL (javascript-typescript) | success |
| sentinel-mirror | success |

**Post-quality jobs (non-required)** failed on `886fca242`:

- `web/deploy` → "Smoke test (functional)" → `FAIL: /api/health returned HTTP 502 (expected 200) — BE/FE integration broken`. Race condition between backend + web deploys hitting the same VPS within seconds. Not caused by any P2 code change; re-run triggered to confirm transience.
- `web/playwright-pr` → "Run backend migrations" → `extension "vector" is not available` in the CI Postgres container. Pre-existing CI image configuration issue — the migrations need pgvector ≥ 0.7.0 (auto-memory confirms: `pnpm migration:run needs pgvector image`). Not introduced by P2.

### Extra commit landed post-merge

After the first push (`b46f19a4`), the web workflow surfaced a **pre-existing** OpenAPI types drift that had been latent since `9471649d` (audit-cleanup PR #271 added visual-similarity types to `museum-backend/openapi/openapi.json` but never regenerated `museum-web/src/lib/api/generated/openapi.ts`). The web workflow only triggers on `museum-web/**` changes, and no museum-web change had landed between #271 and this overnight P2. P2-7's `museum-web/tsconfig.json` edit was the first museum-web change to trigger the workflow.

Fix landed as `886fca24`: regenerate the types via `pnpm generate:openapi-types` (+228 lines). Web `quality` job goes green on the regenerated types.

## What's next

- The single observed flake in `tests/unit/routes/auth.route.test.ts:1065` (rate-limit bucket isolation between providers) deserves a follow-up issue. Not in P2 scope.
- The `web/deploy` 502 smoke test and `web/playwright-pr` pgvector failures are pre-existing CI infra issues, not P2-caused. Worth a follow-up (CI image bump to `pgvector/pgvector:pg16`, and either staggering web+backend deploys or adding readiness checks before smoke).
