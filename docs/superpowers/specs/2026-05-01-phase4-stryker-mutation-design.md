# Phase 4 — Stryker Mutation Testing on Hot Files (Design Spec)

- **Status**: Proposed (2026-05-01)
- **Owner**: QA/SDET
- **Scope**: museum-backend + `.github/workflows/ci-cd-backend.yml` + `.claude/hooks/pre-commit-gate.sh`
- **Pre-req for**: nothing (independent of Phases 5–8)
- **Estimated effort**: 1 working week
- **Spec lineage**: Phase 0 spec §6 (mutation kill ratio ≥75% on hot files) + ADR-007 (coverage policy)

## 1. Problem Statement

`museum-backend/stryker.config.mjs` ships with 40+ files in the `mutate:` list and a global break threshold of 50%. The `mutation` and `mutation:ci` scripts work locally. **Stryker is not in any CI workflow** and is never run automatically on PR or push. Banking-grade discipline requires:

1. Mutation kill ratio ≥80% on the 6 hot files identified in Phase 0 (banking-grade contract surface).
2. Hard-fail PR gate when a hot file's kill ratio drops.
3. Pre-commit feedback so the user catches regressions before push.
4. Solo-dev workflow: only one developer, one machine; cache stays local, no shared-cache complexity.

Phase 4 closes this gap.

## 2. Verified state (2026-05-01)

| Hot file (Phase 0 spec §6) | Path | In stryker.config |
|---|---|---|
| `art-topic-guardrail` | `src/modules/chat/useCase/art-topic-guardrail.ts` | ✓ |
| `cursor-codec` | `src/shared/pagination/cursor-codec.ts` | ✓ |
| `sanitizePromptInput` | `src/shared/validation/input.ts` | ✓ |
| `audit-chain` | `src/shared/audit/audit-chain.ts` | **MISSING** |
| `llm-circuit-breaker` | `src/modules/chat/adapters/secondary/llm-circuit-breaker.ts` | **MISSING** |
| `refresh-token rotation` | `src/modules/auth/adapters/secondary/refresh-token.repository.pg.ts` + `src/modules/auth/useCase/authSession.service.ts` | **MISSING** |

**3 hot files** need to be added to `stryker.config.mjs`'s `mutate:` array.

The current global break threshold of 50% is too lenient for banking-grade hot files. Phase 4 raises gates per Q2/Q4 user decisions.

## 3. Goals

1. Add the 3 missing hot files to `stryker.config.mjs`.
2. Adopt a **two-tier threshold model**:
   - **Global** thresholds tighten: `high=85, low=70, break=70`.
   - **Hot-files** per-file gate: ≥80% kill ratio enforced via a wrapper script that parses `reports/mutation/mutation.json`.
3. **Pre-commit hook** runs Stryker incremental ONLY when `git diff --cached` touches a file in the `mutate:` list. Smart skip on commits that don't touch mutate files (0s overhead).
4. **CI workflow** runs Stryker incremental on every push (any branch) + full mutation nightly.
5. **Local cache** stays at `museum-backend/reports/stryker-incremental.json` (gitignored — already covered by `**/reports/mutation/`; verify the incremental file path is also ignored).
6. **Hard-fail** when hot-file kill ratio drops below 80% (Q4=y).
7. CLAUDE.md updated with the workflow.

## 4. Non-Goals

- Mutation testing of museum-frontend or museum-web (not in Phase 4 scope; can be added in a future phase if banking-grade discipline extends to UI logic).
- Adding new mutators or operators beyond Stryker defaults.
- Coverage threshold uplift (Phase 8).
- E2E tests added based on mutation gaps (Phase 5+ has its own scope).

## 5. Architecture

### 5.1 Hot-files registry

A new file `museum-backend/.stryker-hot-files.json` enumerates the 6 banking-grade hot files plus their per-file kill-ratio threshold (default 80%):

```json
{
  "version": 1,
  "hotFiles": [
    { "path": "src/modules/chat/useCase/art-topic-guardrail.ts", "killRatioMin": 80 },
    { "path": "src/shared/pagination/cursor-codec.ts", "killRatioMin": 80 },
    { "path": "src/shared/validation/input.ts", "killRatioMin": 80 },
    { "path": "src/shared/audit/audit-chain.ts", "killRatioMin": 80 },
    { "path": "src/modules/chat/adapters/secondary/llm-circuit-breaker.ts", "killRatioMin": 80 },
    { "path": "src/modules/auth/adapters/secondary/refresh-token.repository.pg.ts", "killRatioMin": 80 },
    { "path": "src/modules/auth/useCase/authSession.service.ts", "killRatioMin": 80 }
  ]
}
```

(7 entries — `refresh-token rotation` spans 2 files.)

The registry is the source of truth for the per-file gate. Adding a new hot file = adding an entry; no code change needed.

### 5.2 Stryker config updates

In `museum-backend/stryker.config.mjs`:

- Add the 3 missing paths to the `mutate:` array.
- Tighten thresholds:

```js
thresholds: {
  high: 85,
  low: 70,
  break: 70,
},
```

(Was: `high=80, low=60, break=50`.)

### 5.3 Hot-files threshold gate script

New file: `museum-backend/scripts/stryker-hot-files-gate.mjs`

Reads:
- `museum-backend/.stryker-hot-files.json`
- `museum-backend/reports/mutation/mutation.json` (Stryker's machine-readable output)

For each hot file in the registry, computes the kill ratio: `killed / (killed + survived + noCoverage + timeout)` (Stryker's standard formula, mirroring the global score).

Exit codes:
- `0` — all hot files satisfy `killRatioMin`.
- `1` — at least one hot file is below threshold; prints offending files + actual ratios.
- `2` — registry references a file not present in `mutation.json` (covers the case where the hot file isn't in `stryker.config.mjs`'s `mutate:` list — fail loud).

Wired into:
- `package.json` script: `"mutation:gate": "node scripts/stryker-hot-files-gate.mjs"`.
- Pre-commit hook (after `pnpm mutation:ci` runs).
- CI workflow (after Stryker job completes).

### 5.4 Pre-commit hook extension

Extend `.claude/hooks/pre-commit-gate.sh` with a new step (after the existing tsc + ESLint + lint-staged steps, before commit):

```bash
# Phase 4: Stryker incremental on hot-file touches
STAGED_BE=$(git diff --cached --name-only --diff-filter=d -- 'museum-backend/src/**/*.ts' 2>/dev/null)
if [ -n "$STAGED_BE" ]; then
  # Read mutate paths from stryker.config.mjs (eval-style)
  MUTATE_PATHS=$(node -e '
    import("./museum-backend/stryker.config.mjs").then((m) => {
      const cfg = m.default;
      console.log((cfg.mutate ?? []).filter((p) => !p.startsWith("!")).join("\n"));
    });
  ' 2>/dev/null)

  STAGED_MUTATE=$(echo "$STAGED_BE" | sed 's|^museum-backend/||' | grep -Fxf <(echo "$MUTATE_PATHS"))

  if [ -n "$STAGED_MUTATE" ]; then
    echo "[stryker] mutate-list files touched — running incremental:"
    echo "$STAGED_MUTATE" | sed 's/^/  /'
    if ! (cd "$REPO_ROOT/museum-backend" && pnpm run mutation:ci); then
      ERRORS="${ERRORS}Stryker incremental FAIL. "
    fi
    if ! (cd "$REPO_ROOT/museum-backend" && pnpm run mutation:gate); then
      ERRORS="${ERRORS}Stryker hot-files gate FAIL (kill ratio < 80% on a hot file). "
    fi
  fi
fi
```

**Smart skip:** if no staged file matches the `mutate:` list, the hook is a no-op (0s).
**Cold cache first run:** the user is warned via Stryker's standard output and the commit blocks until the run completes. Once warmed, subsequent commits on the same branch reuse the incremental cache (typically 30s–3min per touched file).

### 5.5 CI workflow

`.github/workflows/ci-cd-backend.yml` gains a new `mutation` job. Triggered:
- **Every push to any branch (PR + non-PR)**: incremental.
- **Schedule (nightly)**: full, no-incremental, regenerates the cache.

Uses `actions/cache@v4` keyed on `hashFiles('museum-backend/stryker.config.mjs', 'museum-backend/jest.config.ts')` to share the incremental cache across runs.

```yaml
mutation:
  needs: quality
  runs-on: ubuntu-latest
  timeout-minutes: 45
  defaults:
    run:
      working-directory: museum-backend
  services:
    postgres:
      image: postgres:16
      env: { POSTGRES_USER: museum_dev, POSTGRES_PASSWORD: museum_dev_password, POSTGRES_DB: museum_dev }
      ports: ['5433:5432']
      options: >-
        --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
  steps:
    - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
    - uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320
      with: { version: 10 }
    - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
      with: { node-version: '22', cache: pnpm, cache-dependency-path: museum-backend/pnpm-lock.yaml }
    - run: pnpm install --frozen-lockfile
    - name: Restore Stryker cache
      uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830
      with:
        path: museum-backend/reports/stryker-incremental.json
        key: stryker-cache-${{ hashFiles('museum-backend/stryker.config.mjs', 'museum-backend/jest.config.ts') }}
        restore-keys: stryker-cache-
    - name: Run Stryker
      run: |
        if [ "${{ github.event_name }}" = "schedule" ]; then
          pnpm run mutation         # full, regenerates cache
        else
          pnpm run mutation:ci      # incremental
        fi
    - name: Hot-files gate
      run: pnpm run mutation:gate
    - name: Upload Stryker HTML report
      if: always()
      uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02
      with:
        name: stryker-report
        path: museum-backend/reports/mutation/
        retention-days: 14
```

### 5.6 Cache hygiene

`museum-backend/.gitignore` already has `**/reports/mutation/` and `**/.stryker-tmp/`. Verify it also covers `museum-backend/reports/stryker-incremental.json` — if not, add the explicit entry. The incremental cache file MUST stay gitignored.

### 5.7 First-run baseline

The first `pnpm mutation` run on a clean checkout takes ~20–40 min. To bootstrap:
1. User runs `pnpm mutation` once after merging Commit A.
2. Cache lands at `reports/stryker-incremental.json`.
3. Subsequent commits hit the warm cache.

For CI, the first push after Commit D triggers a cold run; subsequent PRs use the cache.

A `pnpm mutation:warm` script (alias for `pnpm mutation`) is documented in CLAUDE.md as the bootstrap command.

## 6. Hard-fail mode

Per Q4=y:
- Pre-commit: blocks commit if the hot-files gate fails.
- CI: fails the workflow if the hot-files gate fails (regardless of trigger).
- Global break threshold (`break=70`) also fails CI on overall regression — but the hot-files gate is the primary banking-grade check.

A `--soft` mode is NOT exposed for hot files. The user can still bypass via `--no-verify` on commit, but that's a documented escape hatch consistent with the existing pre-commit gate behaviour.

## 7. Risks & Mitigations

### Risk: First Stryker run on a new branch hits cold cache → 20–40min wait

Pre-commit blocks for that long.

**Mitigation:** the smart-skip rule in §5.4 means most commits don't touch mutate files at all (0s). For commits that do touch a mutate file, the user can:
1. Run `pnpm mutation:warm` overnight before starting feature work.
2. Or accept the wait — it only happens once per branch.

If the wait becomes a real friction, document a `STRYKER_SKIP_PRE_COMMIT=1` env-var escape hatch (still hard-fail in CI, just lets the local commit through).

### Risk: Stryker false-positives on the hot-files gate due to flaky tests

Mutants that survive due to timing-dependent or environment-dependent tests would block commits unfairly.

**Mitigation:** Stryker's `timeoutMS: 30000` is already configured. If flake rate emerges, isolate the offending test, fix or mark it `excluded` (Stryker's `mutate:` array supports `!path` exclusions). Re-run.

### Risk: Hot-files registry drift

A new banking-grade file (e.g., a new circuit breaker) gets created but isn't added to `.stryker-hot-files.json`.

**Mitigation:** the registry is small (7 entries today). A grep in CLAUDE.md describes when to extend it. No mechanical guard for now (Phase 8 could add one).

### Risk: CI runtime exceeds 45min timeout on cold cache

Full Stryker run on the runner can be slow.

**Mitigation:** `timeout-minutes: 45` configured. Concurrency: 2. If runs hit the ceiling, raise to 60 or shard the `mutate:` list across matrix workers.

### Risk: Solo-dev cache assumption breaks if a second machine joins

Cache lives in `~/.../reports/stryker-incremental.json` on this machine only.

**Mitigation:** documented as solo-dev assumption. If a second machine joins, switch to the GH Actions cache pattern as the source of truth (cache uploaded after each CI run, downloaded by other machines via `gh cache list && gh cache restore`). Out of scope for Phase 4.

## 8. Acceptance Criteria

Phase 4 is **done** when ALL hold:

- [ ] `museum-backend/.stryker-hot-files.json` exists with 7 entries (the 6 banking-grade hot files + the 2-file split for refresh-token rotation).
- [ ] `museum-backend/stryker.config.mjs` `mutate:` array contains all 7 paths (3 newly added).
- [ ] `museum-backend/stryker.config.mjs` thresholds tightened to `high=85, low=70, break=70`.
- [ ] `museum-backend/scripts/stryker-hot-files-gate.mjs` exists, parses `reports/mutation/mutation.json`, exits 0/1/2 per §5.3.
- [ ] `museum-backend/package.json` exposes `mutation:gate` + `mutation:warm` scripts.
- [ ] `.claude/hooks/pre-commit-gate.sh` extended with the smart-skip Stryker step from §5.4.
- [ ] `.github/workflows/ci-cd-backend.yml` declares a `mutation` job per §5.5.
- [ ] First-run baseline captured (the user runs `pnpm mutation` once before Commit D); kill ratio per hot file recorded in the commit message body.
- [ ] CLAUDE.md updated with a Phase 4 subsection.
- [ ] Phase 4 lands as 4 commits.

## 9. Phase 4 Commit Decomposition

1. **Commit A** — Hot files registry + add 3 paths to `stryker.config.mjs` + tighten thresholds.
2. **Commit B** — `stryker-hot-files-gate.mjs` script + `mutation:gate` + `mutation:warm` package scripts.
3. **Commit C** — `.claude/hooks/pre-commit-gate.sh` extension (smart-skip + run-or-block).
4. **Commit D** — CI `mutation` job in `ci-cd-backend.yml` + CLAUDE.md update + capture baseline kill ratios in commit message.

## 10. Resolved decisions (2026-05-01)

- **Q1 = B0-simple** (pre-commit incremental w/ smart-skip, local cache gitignored, solo-dev assumption).
- **Q2 = iii** (two-tier: global break=70, hot-files break=80).
- **Q3 = OK** (3 missing hot files added to stryker.config: audit-chain, llm-circuit-breaker, refresh-token rotation).
- **Q4 = y** (hard-fail on threshold).

No remaining open questions. Ready for plan generation.
