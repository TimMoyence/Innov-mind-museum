# Phase 8 — Coverage Uplift Gates (Design Spec)

- **Status**: Proposed (2026-05-01)
- **Owner**: QA/SDET
- **Scope**: museum-backend + museum-frontend (web Vitest skipped per Q5)
- **Pre-req for**: nothing (final phase of the banking-grade test transformation)
- **Estimated effort**: 1-2 working weeks (depends on gap size)
- **Spec lineage**: ADR-007 coverage gate policy + Phase 0 challenger pushback (mutation kill ratio replaces aggressive branches uplift) + Phase 4 Stryker pre-commit pattern

## 1. Problem Statement

ADR-007 wired coverage thresholds into per-app jest/vitest configs, but enforcement is inconsistent:

| App | Current threshold | Current actual (per ratchet 2026-04-27) | Phase 8 target | Gap |
|---|---|---|---|---|
| museum-backend | 87 / 76 / 81 / 87 | 87.56 / 76.72 / 81.29 / 87.98 | **90 / 78 / 85 / 90** | +2.5 / +1.3 / +3.7 / +2.0 |
| museum-frontend | 86 / 74 / 72 / 87 | unknown (CI skips `--coverage`) | **90 / 80 / 80 / 90** | TBD on first run |
| museum-web | 70 / 60 / 70 / 70 | unknown | **skipped Phase 8** (Q5=a) | n/a |

ADR-007 also called out: "no CI step calls `pnpm test --coverage`". Coverage today is "marketing" — defined but not enforced on every PR. Phase 8 closes that gap.

The Phase 0 challenger pushback (acknowledged at brainstorming): pushing branches above 78-80% on banking-grade BE forces cosmetic test patterns. Phase 4 mutation kill ratio (≥80% on hot files) is the real banking-grade signal; Phase 8 branches uplift stays moderate (78 BE, 80 FE) to avoid cosmetic-test churn.

## 2. Goals

1. **Lift coverage** to target via TDD red-then-green tests targeting:
   - Uncovered HOT files first (Phase 4 Stryker registry overlap = highest banking-grade ROI).
   - Uncovered service / use-case / middleware code paths next.
   - **Avoid cosmetic-test additions** (e.g., a test that calls a function but never asserts on its output) — every new test must pin a real regression.
2. **Enforce coverage on every commit** via a smart-skip pre-commit hook (mirrors Phase 4 Stryker pattern):
   - If staged files include any source under `museum-backend/src/` OR `museum-frontend/{src,features,shared,app}/` → run incremental coverage on touched files; gate fails on threshold miss.
   - If no source touched → 0s overhead.
3. **CI hard-fail** on coverage miss across all 3 apps' pipelines (push + PR), matching Phase 4 mutation testing pattern.
4. **Ratchet file update** to lock the new floor.
5. **ADR-007 follow-up** documenting the new policy.

## 3. Non-Goals

- museum-web Vitest uplift (Q5=a — Playwright + a11y + Lighthouse cover web; Vitest stays at 70/60/70/70 floor).
- Per-file thresholds (Q3 = global only; Phase 4 mutation gates per-hot-file already).
- New mutators or Stryker config changes (Phase 4 owns).
- Replacing Jest with another runner.

## 4. Architecture

### 4.1 Coverage caching strategy (Q3 — local cache like Phase 4)

Jest natively supports incremental coverage via the `--coverage` flag's lcov persistence under `coverage/`. But `--coverage` re-runs the full suite each time. For pre-commit, we don't want full-suite cost.

Two paths:
- **Path A — Run full coverage on every relevant commit** (~2-3 min for BE, ~1-2 min for FE). Heavy but always accurate.
- **Path B — Targeted coverage**: run `jest --coverage --findRelatedTests <staged-files>`. Fast (~10-30s) but only covers the touched files; doesn't reveal global threshold drift.

**Decision: Path A with local `coverage/` cache committed to `.gitignore` as a no-op (Jest already caches).** Banking-grade priority is correctness, not raw speed. 2-3 min per relevant commit is acceptable; non-source commits skip entirely.

For CI: same `pnpm test:coverage` invocation; GH Actions cache for `node_modules/.cache/jest/` to amortise across runs.

### 4.2 Pre-commit hook extension (`.claude/hooks/pre-commit-gate.sh`)

Add a new step (after the existing tsc + ESLint + lint-staged + Stryker steps, before the final error-decision block):

```bash
# Phase 8: coverage gate — runs full coverage when source files are staged
STAGED_BE_SRC=$(git diff --cached --name-only --diff-filter=d 2>/dev/null | grep -E '^museum-backend/src/.*\.ts$' || true)
STAGED_FE_SRC=$(git diff --cached --name-only --diff-filter=d 2>/dev/null | grep -E '^museum-frontend/(src|features|shared|app)/.*\.tsx?$' || true)

if [ -n "$STAGED_BE_SRC" ]; then
  echo "[coverage] BE source staged — running coverage gate"
  if ! (cd "$REPO_ROOT/museum-backend" && pnpm test:coverage 2>&1 | tail -25); then
    ERRORS="${ERRORS}BE coverage threshold FAIL. "
  fi
fi

if [ -n "$STAGED_FE_SRC" ]; then
  echo "[coverage] FE source staged — running coverage gate"
  if ! (cd "$REPO_ROOT/museum-frontend" && npm run test:coverage 2>&1 | tail -25); then
    ERRORS="${ERRORS}FE coverage threshold FAIL. "
  fi
fi
```

**Smart skip:** docs-only commits, test-only commits, config commits → 0s. Source-touching commits → coverage gate runs (~2-3 min).

If pre-commit feels too slow, the user can opt out via `SKIP_COVERAGE_GATE=1 git commit ...` env var. CI still enforces unconditionally.

### 4.3 New thresholds (per Q4=α)

#### BE (`museum-backend/jest.config.ts`):

```ts
coverageThreshold: {
  global: {
    statements: 90,
    branches: 78,
    functions: 85,
    lines: 90,
  },
},
```

#### FE (`museum-frontend/jest.config.js`):

```js
coverageThreshold: {
  global: {
    statements: 90,
    branches: 80,
    functions: 80,
    lines: 90,
  },
},
```

#### Web (`museum-web/vitest.config.ts`):

Unchanged at 70 / 60 / 70 / 70 (Q5=a defers).

### 4.4 Test additions plan (Commits B + C)

The Phase 8 test additions follow the **anti-cosmetic-test rule**: every new test must pin a named regression. The audit (Commit A) outputs a per-file gap list with a recommendation per file:

- **Hot file (Phase 4 Stryker registry)**: highest priority. If kill ratio is at threshold but coverage is below, add tests that exercise edge branches.
- **Service / use-case file**: medium priority. Target the largest uncovered branches first.
- **Middleware**: medium priority. Test boundary cases (401, 403, error handler).
- **Pure utility**: low priority. Often easy to lift coverage cheaply, but ROI lowest.
- **Generated code (e.g. openapi.ts)**: skip; mark as exclusion in jest config if not already.
- **Migration files**: skip; per-Phase-1 migration round-trip test covers them.

If the audit reveals a gap that requires writing tests for a poorly-designed module (low testability), the spec recommends marking the gap as a `// @TODO Phase 9: refactor for testability` and lowering the threshold by the gap delta in jest.config.ts. A future PR fixes the testability + raises the threshold back. Banking-grade discipline > big-bang grand-slam.

### 4.5 CI enforcement (per Q2=on-commit, Q1=A=hard fail)

Both `ci-cd-backend.yml` and `ci-cd-mobile.yml` gain a coverage step in their `quality` job:

**Backend (`ci-cd-backend.yml` `quality` job):**
```yaml
- name: Run tests with coverage gate
  run: pnpm test:coverage
  working-directory: museum-backend
```

**Mobile (`ci-cd-mobile.yml` `quality` job):**
```yaml
- name: Run tests with coverage gate
  run: npm run test:coverage
  working-directory: museum-frontend
```

The `test:coverage` script in each app's package.json runs `jest --coverage --runInBand` (BE) / `jest --coverage` (FE). Jest's built-in threshold enforcement propagates a non-zero exit on miss → CI step fails → PR blocked.

### 4.6 Ratchet file update

`.claude/quality-ratchet.json` updates:

```diff
{
  "lastUpdated": "2026-05-01",
  ...
- "coverageStatements": 87.56,
- "coverageBranches": 76.72,
- "coverageFunctions": 81.29,
- "coverageLines": 87.98,
+ "coverageStatements": 90,
+ "coverageBranches": 78,
+ "coverageFunctions": 85,
+ "coverageLines": 90,
+ "coverageBranchesFrontend": 80,
+ "coverageStatementsFrontend": 90,
+ "coverageFunctionsFrontend": 80,
+ "coverageLinesFrontend": 90,
  ...
}
```

Phase 8 closes by locking the floor at the new targets. Future phases can ratchet incrementally.

### 4.7 ADR-007 follow-up

A new ADR-013 (or update ADR-007) documents:
- The challenger pushback on aggressive branches uplift.
- Phase 8 final thresholds.
- The pre-commit smart-skip policy.
- The web Vitest deferral (Phase 8 Q5=a).

## 5. Anti-cosmetic-test discipline

Banking-grade priority: every Phase 8 test added must:
- Pin a **named** regression (commit body must call out what would break if the test were removed).
- Use **factories** (Phase 7) — no inline entity construction.
- Use **integration harness** (Phase 1) when the test exercises persistence.
- Use **chaos helpers** (Phase 6) when the test exercises degradation paths.
- NOT be a "branch coverage padding" test (e.g., calling a function in 3 different ways without asserting differential behavior).

The audit script in Commit A flags candidate hot-files as the FIRST priority. The implementer should NOT chase the threshold blindly via random test additions.

## 6. Risks & Mitigations

### Risk: Coverage threshold uplift forces cosmetic tests

The Phase 0 challenger raised this risk explicitly.

**Mitigation:** the audit-first approach. If a file's gap requires cosmetic tests to close, the spec recommends `@TODO Phase 9: refactor for testability` + threshold drop. NEVER hit the threshold via meaningless tests.

### Risk: Pre-commit gate too slow (2-3 min)

User noted "I work with many agents simultaneously" — frequent commits.

**Mitigation:** smart-skip on non-source commits (most commits). For source commits, the user can `SKIP_COVERAGE_GATE=1 git commit ...` for a fast iteration loop; CI catches the miss. Document in CLAUDE.md.

### Risk: Coverage gap is large enough that big-bang isn't feasible in 1-2 weeks

If, e.g., BE functions gap is 15pts (not 4), the time investment balloons.

**Mitigation:** Phase 8 spec authorizes the implementer to lower the threshold by the actual gap delta in Commit B + create a follow-up Phase 9 issue. The pre-commit gate ratchets to whatever level Phase 8 lands at; subsequent PRs raise it.

### Risk: Phase 4 Stryker + Phase 8 coverage = 4-6 minutes pre-commit

Stryker incremental ~30s-3min + coverage ~2-3min on relevant commits.

**Mitigation:** parallelise the two: pre-commit hook can fire Stryker + coverage as concurrent background processes, wait for both. ~half the wall-clock time. Implementation detail in Commit D.

### Risk: parallel-session interference (still ongoing)

Same anti-leak protocol as Phases 0-7.

**Mitigation:** every commit goes through `git restore --staged .` + scoped `git add`.

## 7. Acceptance Criteria

Phase 8 is **done** when ALL hold:

- [ ] `docs/audits/2026-05-01-coverage-gaps.md` exists with per-app + per-file gap list (post-audit, Commit A).
- [ ] `museum-backend/jest.config.ts` thresholds: `90 / 78 / 85 / 90`.
- [ ] `museum-frontend/jest.config.js` thresholds: `90 / 80 / 80 / 90`.
- [ ] `museum-backend/package.json` exposes `test:coverage` script.
- [ ] `museum-frontend/package.json` exposes `test:coverage` script.
- [ ] `pnpm test:coverage` (BE) + `npm run test:coverage` (FE) both exit 0 with the new thresholds.
- [ ] `.claude/hooks/pre-commit-gate.sh` extended with smart-skip coverage step (BE + FE).
- [ ] `.github/workflows/ci-cd-backend.yml` `quality` job runs `pnpm test:coverage` and fails on miss.
- [ ] `.github/workflows/ci-cd-mobile.yml` `quality` job runs `npm run test:coverage` and fails on miss.
- [ ] `.claude/quality-ratchet.json` reflects new floor.
- [ ] CLAUDE.md "Phase 8 — coverage uplift" subsection added.
- [ ] All BE + FE tests + lint still pass.
- [ ] Phase 8 lands as 4 commits.

## 8. Phase 8 Commit Decomposition

1. **Commit A** — Audit: write `scripts/audits/coverage-gap-analysis.mjs`, run, output `docs/audits/2026-05-01-coverage-gaps.md` with per-file gap recommendations.
2. **Commit B** — BE coverage uplift: add tests to close BE gaps to 90/78/85/90 (target hot files first per audit).
3. **Commit C** — FE coverage uplift: add tests to close FE gaps to 90/80/80/90.
4. **Commit D** — Wire up: thresholds in jest configs, `test:coverage` scripts, pre-commit hook smart-skip step, CI workflow `quality` job updates, ratchet file update, CLAUDE.md doc.

If audit reveals gaps too large for 1-2 weeks: Commit B and/or C land at intermediate thresholds (current actual + 1pt) instead of full target. Commit D documents the deferral as a future Phase 9 item.

## 9. Resolved decisions (2026-05-01)

- **Q1 = A** (big-bang TDD red-then-green).
- **Q2 = on-commit** (pre-commit gate smart-skip on source commits).
- **Q3 = global gate, no per-file** (mutation testing covers per-file in Phase 4).
- **Q4 = α** (BE 78 branches / FE 80 / web n/a).
- **Q5 = a** (skip web Vitest; BE + FE only).

No remaining open questions.
