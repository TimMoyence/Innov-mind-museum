# Phase 4 — Stryker Mutation Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Stryker mutation testing into pre-commit (smart-skip) + CI (every push incremental, nightly full), enforce ≥80% kill ratio on 7 banking-grade hot files via a registry-backed wrapper script.

**Architecture:** A new `museum-backend/.stryker-hot-files.json` registry lists each hot file with its `killRatioMin`. A `stryker-hot-files-gate.mjs` script parses Stryker's `mutation.json` output and exits non-zero on per-file violations. Pre-commit hook (extension of `.claude/hooks/pre-commit-gate.sh`) runs Stryker incremental ONLY when staged files intersect the `mutate:` list (smart skip = 0s for 80% of commits). CI gets a `mutation` job that runs incremental on every push, full nightly via cron, with `actions/cache@v4` warming the incremental cache across runs.

**Tech Stack:** Stryker 9.6 (already installed), `@stryker-mutator/jest-runner`, Node 22 + pnpm 10, Bash + jq for the pre-commit step, GitHub Actions for CI.

**Spec:** `docs/superpowers/specs/2026-05-01-phase4-stryker-mutation-design.md`

**Total commits:** 4 (A / B / C / D per spec §9).

---

## Pre-Flight (no commit)

- [ ] **Step 0.1: Capture baseline + verify Stryker boots**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
pnpm test 2>&1 | tail -5
git status --short | head -20
ls reports/ 2>&1 | head -5
```

Capture exact pass count for Phase 4 verification. Confirm `museum-backend/reports/` is gitignored (already covered by root `.gitignore` — `museum-backend/reports/`).

- [ ] **Step 0.2: Anti-leak protocol**

NEVER touch:
- `museum-frontend/ios/...`, `museum-frontend/__tests__/hooks/useSocialLogin.test.ts`, `museum-frontend/__tests__/infrastructure/socialAuthProviders.test.ts`, `museum-frontend/features/auth/...`
- `docs/superpowers/plans/2026-04-30-A1-A2-critical-fk-indexes.md`
- Any path in `git status --short` you didn't create

Apply before EVERY commit:
```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .
git add <intended files only>
git diff --cached --name-only | sort
```

---

## Commit A — Group A: Hot files registry + stryker.config update

### Task A1: Create the hot files registry

**Files:**
- Create: `museum-backend/.stryker-hot-files.json`

- [ ] **Step A1.1: Write the registry**

```bash
cat > /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/.stryker-hot-files.json <<'EOF'
{
  "version": 1,
  "description": "Banking-grade hot files. Each entry MUST also be in stryker.config.mjs `mutate:` list. The hot-files gate script enforces killRatioMin per file.",
  "hotFiles": [
    {
      "path": "src/modules/chat/useCase/art-topic-guardrail.ts",
      "killRatioMin": 80,
      "rationale": "Input guardrail — blocks insults, off-topic, prompt injection. Banking-grade contract."
    },
    {
      "path": "src/shared/pagination/cursor-codec.ts",
      "killRatioMin": 80,
      "rationale": "Cursor encode/decode — IDOR risk if a mutant flips the boundary check."
    },
    {
      "path": "src/shared/validation/input.ts",
      "killRatioMin": 80,
      "rationale": "sanitizePromptInput — Unicode normalisation + zero-width strip + truncation. SSRF/injection adjacent."
    },
    {
      "path": "src/shared/audit/audit-chain.ts",
      "killRatioMin": 80,
      "rationale": "Audit log chain integrity. Mutation here = silent compliance break."
    },
    {
      "path": "src/modules/chat/adapters/secondary/llm-circuit-breaker.ts",
      "killRatioMin": 80,
      "rationale": "Circuit breaker for LLM provider failures. Mutation = stuck-open or stuck-closed."
    },
    {
      "path": "src/modules/auth/adapters/secondary/refresh-token.repository.pg.ts",
      "killRatioMin": 80,
      "rationale": "Refresh-token rotation persistence. Mutation = token-reuse vulnerability."
    },
    {
      "path": "src/modules/auth/useCase/authSession.service.ts",
      "killRatioMin": 80,
      "rationale": "Auth session orchestration including rotation policy + MFA gating. Co-pinned with refresh-token repo."
    }
  ]
}
EOF
```

- [ ] **Step A1.2: Validate JSON**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
node -e 'const j = require("./museum-backend/.stryker-hot-files.json"); console.log("entries:", j.hotFiles.length, "version:", j.version)'
```

Expected: `entries: 7 version: 1`.

### Task A2: Add 3 missing paths to stryker.config + tighten thresholds

**Files:**
- Modify: `museum-backend/stryker.config.mjs`

- [ ] **Step A2.1: Add the 3 missing hot file paths**

In `museum-backend/stryker.config.mjs`, the `mutate:` array currently ends with the comment `// Phase 2 Wave 4 — use cases` followed by 8 entries. Add a new wave after that block, before the `// Exclusions` comment:

```js
    // Phase 4 Wave 5 — banking-grade hot files
    'src/shared/audit/audit-chain.ts',
    'src/modules/chat/adapters/secondary/llm-circuit-breaker.ts',
    'src/modules/auth/adapters/secondary/refresh-token.repository.pg.ts',
    'src/modules/auth/useCase/authSession.service.ts',
```

Use `Edit` to insert this block. Do NOT touch the existing entries.

(`authSession.service.ts` is the 7th hot-file path — `refresh-token rotation` spans 2 files per the registry.)

- [ ] **Step A2.2: Tighten thresholds**

Find the `thresholds` block:

```js
  thresholds: {
    high: 80,
    low: 60,
    break: 50,
  },
```

Replace with:

```js
  thresholds: {
    high: 85,
    low: 70,
    break: 70,
  },
```

- [ ] **Step A2.3: Validate the config loads**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
node -e 'import("./stryker.config.mjs").then((m) => { const c = m.default; console.log("mutate count:", c.mutate.filter(p => !p.startsWith("!")).length, "thresholds:", c.thresholds); })'
```

Expected: `mutate count: <previous_count + 4>` (= 36 + 4 = 40 if your baseline was 36) and `thresholds: { high: 85, low: 70, break: 70 }`.

### Task A3: Commit A

- [ ] **Step A3.1: Anti-leak commit**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .
git add museum-backend/.stryker-hot-files.json
git add museum-backend/stryker.config.mjs

git diff --cached --name-only | sort
```

Expected: exactly 2 paths.

```bash
git commit -m "$(cat <<'EOF'
test(stryker): hot-files registry + 3 new mutate paths + tighten thresholds (Phase 4 Group A)

Phase 4 Group A — banking-grade mutation testing setup.

- museum-backend/.stryker-hot-files.json: source of truth for the
  7 hot-file paths + per-file killRatioMin (80%). Includes a rationale
  for each entry.
- museum-backend/stryker.config.mjs:
  - Add 4 new mutate entries: audit-chain, llm-circuit-breaker,
    refresh-token.repository.pg, authSession.service. (refresh-token
    rotation logic spans 2 files; both pinned.)
  - Thresholds: high 80→85, low 60→70, break 50→70 (banking-grade).

The per-file gate script + pre-commit hook + CI wiring land in
Commits B/C/D.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -3
git show --stat HEAD | head -10
```

If pre-commit hook bundles unrelated files: STOP, do NOT amend, report DONE_WITH_CONCERNS.

---

## Commit B — Group B: Hot-files threshold gate script + package scripts

### Task B1: Write the gate script (TDD)

**Files:**
- Create: `museum-backend/scripts/stryker-hot-files-gate.mjs`
- Create: `museum-backend/scripts/__tests__/stryker-hot-files-gate.test.mjs`

- [ ] **Step B1.1: Write the failing test (RED)**

Create the test file:

```bash
mkdir -p /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/scripts/__tests__
cat > /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/scripts/__tests__/stryker-hot-files-gate.test.mjs <<'EOF'
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const SCRIPT = resolve(process.cwd(), 'scripts/stryker-hot-files-gate.mjs');

let workDir;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'stryker-gate-'));
  mkdirSync(join(workDir, 'reports', 'mutation'), { recursive: true });
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function runScript() {
  try {
    const stdout = execFileSync('node', [SCRIPT], {
      env: { ...process.env, STRYKER_GATE_ROOT: workDir },
      encoding: 'utf-8',
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      code: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

function writeRegistry(entries) {
  writeFileSync(
    join(workDir, '.stryker-hot-files.json'),
    JSON.stringify({ version: 1, hotFiles: entries }),
  );
}

function writeMutationJson(files) {
  writeFileSync(
    join(workDir, 'reports', 'mutation', 'mutation.json'),
    JSON.stringify({
      schemaVersion: '1.7.0',
      thresholds: { high: 85, low: 70, break: 70 },
      files,
    }),
  );
}

function makeFileMutants(killed, survived, noCoverage = 0, timeout = 0) {
  const mutants = [];
  for (let i = 0; i < killed; i += 1) mutants.push({ status: 'Killed' });
  for (let i = 0; i < survived; i += 1) mutants.push({ status: 'Survived' });
  for (let i = 0; i < noCoverage; i += 1) mutants.push({ status: 'NoCoverage' });
  for (let i = 0; i < timeout; i += 1) mutants.push({ status: 'Timeout' });
  return { mutants };
}

describe('stryker-hot-files-gate', () => {
  it('exits 0 when every hot file meets killRatioMin', () => {
    writeRegistry([
      { path: 'src/a.ts', killRatioMin: 80 },
      { path: 'src/b.ts', killRatioMin: 80 },
    ]);
    writeMutationJson({
      'src/a.ts': makeFileMutants(8, 2),  // 80%
      'src/b.ts': makeFileMutants(9, 1),  // 90%
    });
    const r = runScript();
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/2\/2 hot files passed/);
  });

  it('exits 1 when a hot file falls below killRatioMin', () => {
    writeRegistry([{ path: 'src/a.ts', killRatioMin: 80 }]);
    writeMutationJson({ 'src/a.ts': makeFileMutants(7, 3) });  // 70%
    const r = runScript();
    expect(r.code).toBe(1);
    expect(r.stderr + r.stdout).toMatch(/src\/a\.ts/);
    expect(r.stderr + r.stdout).toMatch(/70(\.\d+)?%.*<.*80%/);
  });

  it('exits 2 when registry references a file absent from mutation.json', () => {
    writeRegistry([{ path: 'src/missing.ts', killRatioMin: 80 }]);
    writeMutationJson({ 'src/a.ts': makeFileMutants(8, 2) });
    const r = runScript();
    expect(r.code).toBe(2);
    expect(r.stderr + r.stdout).toMatch(/missing\.ts/);
  });

  it('counts NoCoverage and Timeout as not-killed (denominator)', () => {
    writeRegistry([{ path: 'src/a.ts', killRatioMin: 80 }]);
    // 8 killed, 1 survived, 1 noCoverage = 8/10 = 80% — passes
    writeMutationJson({ 'src/a.ts': makeFileMutants(8, 1, 1, 0) });
    const r = runScript();
    expect(r.code).toBe(0);
  });

  it('exits 0 when registry is empty', () => {
    writeRegistry([]);
    writeMutationJson({ 'src/a.ts': makeFileMutants(8, 2) });
    const r = runScript();
    expect(r.code).toBe(0);
  });
});
EOF
```

- [ ] **Step B1.2: Run the test to confirm FAIL (script doesn't exist yet)**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
pnpm test -- scripts/__tests__/stryker-hot-files-gate.test.mjs 2>&1 | tail -10
```

Expected: ENOENT or "Cannot find module" or similar — confirms RED.

- [ ] **Step B1.3: Implement the gate script (GREEN)**

```bash
cat > /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/scripts/stryker-hot-files-gate.mjs <<'EOF'
#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Phase 4 Stryker hot-files gate.
 *
 * Reads:
 *   museum-backend/.stryker-hot-files.json — registry of hot files + thresholds
 *   museum-backend/reports/mutation/mutation.json — Stryker output
 *
 * For each registered hot file, computes kill ratio:
 *   killed / (killed + survived + noCoverage + timeout)
 *
 * Exit codes:
 *   0 — every hot file >= killRatioMin
 *   1 — at least one hot file below threshold
 *   2 — registry references a file absent from mutation.json
 *
 * Env: STRYKER_GATE_ROOT overrides the root directory (used in tests).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.env.STRYKER_GATE_ROOT ?? process.cwd());
const REGISTRY_PATH = resolve(ROOT, '.stryker-hot-files.json');
const MUTATION_PATH = resolve(ROOT, 'reports', 'mutation', 'mutation.json');

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    console.error(`Cannot read ${path}: ${err.message}`);
    process.exit(2);
  }
  return null;
}

function killRatio(file) {
  const mutants = file.mutants ?? [];
  if (mutants.length === 0) return null;
  const killed = mutants.filter((m) => m.status === 'Killed').length;
  const counted = mutants.filter((m) =>
    m.status === 'Killed' || m.status === 'Survived' || m.status === 'NoCoverage' || m.status === 'Timeout',
  ).length;
  if (counted === 0) return null;
  return (killed / counted) * 100;
}

function main() {
  const registry = readJson(REGISTRY_PATH);
  const mutation = readJson(MUTATION_PATH);

  if (!Array.isArray(registry.hotFiles)) {
    console.error('Registry .stryker-hot-files.json must have a `hotFiles` array.');
    process.exit(2);
  }

  if (registry.hotFiles.length === 0) {
    console.log('OK — no hot files registered, gate is a no-op.');
    process.exit(0);
  }

  const failures = [];
  const missing = [];

  for (const entry of registry.hotFiles) {
    const file = mutation.files?.[entry.path];
    if (!file) {
      missing.push(entry.path);
      continue;
    }
    const ratio = killRatio(file);
    if (ratio === null) {
      missing.push(`${entry.path} (no mutants found in report)`);
      continue;
    }
    if (ratio < entry.killRatioMin) {
      failures.push({ path: entry.path, ratio, min: entry.killRatioMin });
    }
  }

  if (missing.length > 0) {
    console.error('Hot files referenced in registry but absent from mutation.json:');
    for (const m of missing) console.error(`  - ${m}`);
    console.error('');
    console.error('Add the file to stryker.config.mjs `mutate:` list, OR remove from .stryker-hot-files.json.');
    process.exit(2);
  }

  if (failures.length > 0) {
    console.error('Hot-file kill-ratio gate failures:');
    for (const f of failures) {
      console.error(`  - ${f.path}: ${f.ratio.toFixed(1)}% < ${f.min}%`);
    }
    process.exit(1);
  }

  console.log(`OK — ${registry.hotFiles.length}/${registry.hotFiles.length} hot files passed (kill ratio ≥ killRatioMin).`);
  process.exit(0);
}

main();
EOF
chmod +x /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/scripts/stryker-hot-files-gate.mjs
```

- [ ] **Step B1.4: Re-run the test, expect GREEN**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
pnpm test -- scripts/__tests__/stryker-hot-files-gate.test.mjs 2>&1 | tail -10
```

Expected: 5 tests pass.

If a test fails: read the error, fix the script (NOT the test), iterate.

### Task B2: Add `mutation:gate` + `mutation:warm` package scripts

**Files:**
- Modify: `museum-backend/package.json`

- [ ] **Step B2.1: Add scripts**

In `museum-backend/package.json`, find the `scripts` block. The existing mutation entries are:

```json
"mutation": "stryker run",
"mutation:ci": "stryker run --incremental --concurrency 2"
```

Use `Edit` to add 2 new scripts immediately after `mutation:ci` (before the closing `}` of `scripts`):

```json
"mutation:gate": "node scripts/stryker-hot-files-gate.mjs",
"mutation:warm": "stryker run --concurrency 2"
```

`mutation:warm` is a documented alias for the bootstrapping cold-cache run.

- [ ] **Step B2.2: Verify scripts**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
node -e 'const p = require("./package.json"); console.log("mutation:", p.scripts.mutation, "mutation:gate:", p.scripts["mutation:gate"], "mutation:warm:", p.scripts["mutation:warm"]);'
```

Expected: all 3 scripts printed correctly.

### Task B3: Commit B

- [ ] **Step B3.1: Anti-leak commit**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .
git add museum-backend/scripts/stryker-hot-files-gate.mjs
git add museum-backend/scripts/__tests__/stryker-hot-files-gate.test.mjs
git add museum-backend/package.json

git diff --cached --name-only | sort
```

Expected: exactly 3 paths.

```bash
git commit -m "$(cat <<'EOF'
test(stryker): hot-files gate script + package scripts (Phase 4 Group B)

Phase 4 Group B — per-file kill-ratio enforcement.

- scripts/stryker-hot-files-gate.mjs: reads .stryker-hot-files.json
  registry + reports/mutation/mutation.json. For each hot file,
  computes kill ratio (killed / (killed + survived + noCoverage +
  timeout) * 100) and asserts ≥ killRatioMin. Exits 0/1/2 per spec.
- scripts/__tests__/stryker-hot-files-gate.test.mjs: 5 Jest tests
  cover happy-path, below-threshold fail, missing-file fail (exit
  2), NoCoverage/Timeout denominator counting, empty-registry no-op.
- package.json scripts: mutation:gate (run gate) + mutation:warm
  (alias for `stryker run` for cold-cache bootstrap).

Pre-commit hook + CI wiring land in Commits C/D.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -3
git show --stat HEAD | head -10
```

---

## Commit C — Group C: Pre-commit hook extension (smart skip + run-or-block)

### Task C1: Extend `.claude/hooks/pre-commit-gate.sh`

**Files:**
- Modify: `.claude/hooks/pre-commit-gate.sh`

- [ ] **Step C1.1: Read the existing hook**

```bash
cat /Users/Tim/Desktop/all/dev/Pro/InnovMind/.claude/hooks/pre-commit-gate.sh | tail -60
```

Identify where the existing checks end (the file builds an `$ERRORS` string, then at the bottom decides to block or pass via JSON output to Claude Code). The Stryker step goes immediately before the final `if [ -n "$ERRORS" ]` block.

- [ ] **Step C1.2: Insert the Stryker step**

Use `Edit` to add the following immediately before the final error-decision block. The hook already has `REPO_ROOT="/Users/Tim/Desktop/all/dev/Pro/InnovMind"` set at the top.

```bash
# 4. Stryker incremental (smart skip — only if a mutate-list file is staged)
STAGED_BE_TS=$(git diff --cached --name-only --diff-filter=d 2>/dev/null | grep '^museum-backend/src/.*\.ts$' || true)
if [ -n "$STAGED_BE_TS" ]; then
  # Extract mutate list (positive entries only) from stryker.config.mjs
  MUTATE_PATHS=$(node -e '
    import("./museum-backend/stryker.config.mjs").then((m) => {
      const cfg = m.default;
      console.log((cfg.mutate ?? []).filter((p) => !p.startsWith("!")).join("\n"));
    }).catch((e) => { process.stderr.write(e.message); process.exit(1); });
  ' 2>/dev/null)

  if [ -n "$MUTATE_PATHS" ]; then
    STAGED_RELATIVE=$(echo "$STAGED_BE_TS" | sed 's|^museum-backend/||')
    STAGED_MUTATE=$(echo "$STAGED_RELATIVE" | grep -Fxf <(echo "$MUTATE_PATHS") || true)

    if [ -n "$STAGED_MUTATE" ]; then
      echo "[stryker] mutate-list files touched — running incremental:"
      echo "$STAGED_MUTATE" | sed 's/^/  /'
      if ! (cd "$REPO_ROOT/museum-backend" && pnpm run mutation:ci 2>&1 | tail -20); then
        ERRORS="${ERRORS}Stryker incremental FAIL. "
      else
        if ! (cd "$REPO_ROOT/museum-backend" && pnpm run mutation:gate 2>&1 | tail -20); then
          ERRORS="${ERRORS}Stryker hot-files gate FAIL (kill ratio < threshold on a hot file). "
        fi
      fi
    fi
  fi
fi
```

The script reads `stryker.config.mjs` dynamically so the hook stays in sync without re-encoding the mutate list.

- [ ] **Step C1.3: Verify the hook passes shellcheck**

```bash
which shellcheck > /dev/null 2>&1 || brew install shellcheck
shellcheck /Users/Tim/Desktop/all/dev/Pro/InnovMind/.claude/hooks/pre-commit-gate.sh
```

Expected: 0 errors. Warnings are acceptable but read each one.

- [ ] **Step C1.4: Manual smoke — verify smart-skip works on a non-mutate file**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
echo "// test" > /tmp/non-mutate-test.txt
git add /tmp/non-mutate-test.txt 2>&1 || true
# (Don't actually commit — just simulate the hook input)
# Actually the hook only runs via Claude Code's tool dispatch; manual smoke skipped.
# CI test below verifies behaviour end-to-end.
```

(Skip manual smoke — the hook is invoked by Claude Code's PreToolUse mechanism, not by `git commit` directly. CI behaviour will validate.)

### Task C2: Commit C

- [ ] **Step C2.1: Anti-leak commit**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .
git add .claude/hooks/pre-commit-gate.sh

git diff --cached --name-only | sort
```

Expected: exactly 1 path.

```bash
git commit -m "$(cat <<'EOF'
test(stryker): pre-commit smart-skip Stryker incremental + hot-files gate (Phase 4 Group C)

Phase 4 Group C — pre-commit feedback loop.

The pre-commit hook now runs Stryker incremental + the hot-files
gate ONLY when staged BE files intersect the `mutate:` list in
stryker.config.mjs. The mutate list is read dynamically (no
duplication between the hook and the config).

Smart-skip behaviour:
- Commits touching no mutate-list file → skip entirely (0s).
- Commits touching at least one mutate-list file → run
  `pnpm mutation:ci` + `pnpm mutation:gate`. Block commit if either
  fails. First-run cold cache may take ~20–40 min; subsequent
  warm-cache runs are 30s–5min depending on file size + test density.

Cache stays at museum-backend/reports/stryker-incremental.json
(gitignored via root .gitignore covering museum-backend/reports/).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -3
git show --stat HEAD | head -10
```

---

## Commit D — Group D: CI wiring + nightly cron + CLAUDE.md

### Task D1: Add the `mutation` job to `ci-cd-backend.yml`

**Files:**
- Modify: `.github/workflows/ci-cd-backend.yml`

- [ ] **Step D1.1: Read existing workflow**

```bash
sed -n '1,50p' /Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/ci-cd-backend.yml
sed -n '50,140p' /Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/ci-cd-backend.yml
```

The workflow currently has a `schedule:` cron (verify it). The `mutation` job goes after `quality:` (and after Phase 1's `integration:` if that landed) and before any deploy job.

- [ ] **Step D1.2: Add the `mutation` job**

Use `Edit` to insert the following block before the deploy job(s) (or at the end of `jobs:` if no deploy jobs are present):

```yaml
  # ─── 3. Mutation testing (Stryker — incremental on push, full nightly) ──
  mutation:
    needs: quality
    runs-on: ubuntu-latest
    timeout-minutes: 50
    defaults:
      run:
        working-directory: museum-backend
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: museum_dev
          POSTGRES_PASSWORD: museum_dev_password
          POSTGRES_DB: museum_dev
        ports:
          - 5433:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd  # v6
      - name: Setup pnpm
        uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320  # v5
        with:
          version: 10
      - name: Setup Node
        uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e  # v6
        with:
          node-version: '22'
          cache: 'pnpm'
          cache-dependency-path: museum-backend/pnpm-lock.yaml
      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Restore Stryker incremental cache
        uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830  # v4
        with:
          path: museum-backend/reports/stryker-incremental.json
          key: stryker-cache-${{ hashFiles('museum-backend/stryker.config.mjs', 'museum-backend/jest.config.ts', 'museum-backend/.stryker-hot-files.json') }}
          restore-keys: |
            stryker-cache-

      - name: Run Stryker (incremental on push, full nightly)
        env:
          DB_HOST: localhost
          DB_PORT: '5433'
          DB_USER: museum_dev
          DB_PASSWORD: museum_dev_password
          PGDATABASE: museum_dev
        run: |
          if [ "${{ github.event_name }}" = "schedule" ]; then
            echo "[mutation] Nightly — running FULL Stryker (cache regen)"
            pnpm run mutation
          else
            echo "[mutation] Push/PR — running INCREMENTAL Stryker"
            pnpm run mutation:ci
          fi

      - name: Hot-files kill-ratio gate
        run: pnpm run mutation:gate

      - name: Upload Stryker HTML report
        if: always()
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02  # v4
        with:
          name: stryker-report-${{ github.event_name }}-${{ github.run_number }}
          path: museum-backend/reports/mutation/
          retention-days: 14
```

- [ ] **Step D1.3: Validate YAML**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-cd-backend.yml')); print('YAML OK')"
```

Expected: `YAML OK`. If parse fails, re-read the diff and fix indentation.

If `actionlint` is installed: `actionlint .github/workflows/ci-cd-backend.yml`.

### Task D2: CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step D2.1: Find insertion point**

```bash
grep -n "Maestro\|Playwright\|Stryker\|Mutation\|mutation" /Users/Tim/Desktop/all/dev/Pro/InnovMind/CLAUDE.md | head -10
```

Find the existing Phase 2 (Maestro) and Phase 3 (Playwright) subsections under the "## CI" section. Add Phase 4 immediately after Phase 3.

- [ ] **Step D2.2: Append the Phase 4 subsection**

Use `Edit` to insert this content after the Phase 3 "Web admin Playwright + a11y" subsection:

```markdown
### Stryker mutation testing (Phase 4)

- 7 banking-grade hot files registered at `museum-backend/.stryker-hot-files.json` with per-file `killRatioMin` (currently 80%): art-topic-guardrail, cursor-codec, sanitizePromptInput, audit-chain, llm-circuit-breaker, refresh-token.repository.pg, authSession.service.
- `museum-backend/scripts/stryker-hot-files-gate.mjs` parses `reports/mutation/mutation.json` and asserts each hot file ≥ killRatioMin. Exits 0/1/2.
- Pre-commit hook (`.claude/hooks/pre-commit-gate.sh`) runs `pnpm mutation:ci` + `pnpm mutation:gate` ONLY when staged BE files intersect the `mutate:` list. Most commits skip Stryker entirely (0s overhead). First-run cold cache may take ~20–40 min — run `pnpm mutation:warm` overnight to bootstrap.
- CI: `mutation` job in `ci-cd-backend.yml` runs incremental on every push (any branch) + full nightly via cron (03:17 UTC). Stryker incremental cache shared across runs via `actions/cache@v4`.
- Hard-fail policy: a hot file dropping below 80% blocks commit AND CI. Global thresholds: high=85, low=70, break=70.
- See `docs/superpowers/specs/2026-05-01-phase4-stryker-mutation-design.md`.
```

### Task D3: Bootstrap baseline (recommended local step before commit)

- [ ] **Step D3.1: Warm the cache + capture baseline**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
pnpm run mutation:warm 2>&1 | tee /tmp/phase4-baseline.log | tail -50
```

This is the cold-cache bootstrap — it takes 20–40 min. Once it completes, the incremental cache is ready locally and on the next CI run (which will populate the GH cache).

If you cannot wait 20–40 min in this session, skip and document in the commit body that the first CI run will be cold (one-time). The CI job has `timeout-minutes: 50` to accommodate.

If the run completes locally:
- Capture the per-hot-file kill ratios from `reports/mutation/mutation.json`:
  ```bash
  node -e '
    const m = require("./reports/mutation/mutation.json");
    const reg = require("./.stryker-hot-files.json");
    for (const e of reg.hotFiles) {
      const f = m.files[e.path];
      if (!f) { console.log(e.path, "MISSING"); continue; }
      const mut = f.mutants || [];
      const k = mut.filter(x => x.status === "Killed").length;
      const c = mut.filter(x => ["Killed","Survived","NoCoverage","Timeout"].includes(x.status)).length;
      console.log(e.path, c ? (k/c*100).toFixed(1) + "%" : "no-mutants");
    }
  '
  ```
- Include the output in the Commit D body so the baseline is recorded.

If the gate fails (a hot file < 80% on this baseline), DO NOT lower the threshold. Either:
- Add tests to lift the kill ratio.
- Document the gap as a `// @TODO Phase 4 follow-up` and either:
  - Temporarily lower that file's `killRatioMin` to the actual value (with rationale + approved_by) — and bump the cap test to track the temporarily-lowered value.
  - Block Commit D until the kill ratio reaches 80%.

For a first iteration, the pragmatic path is: lower the failing file's `killRatioMin` to its actual value, document the gap, and ratchet up over time. Strict banking-grade path: add tests until 80% holds. User policy says "ratchet upward, never relax" — pick the strict path.

### Task D4: Commit D

- [ ] **Step D4.1: Anti-leak commit**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .
git add .github/workflows/ci-cd-backend.yml
git add CLAUDE.md

# If you adjusted .stryker-hot-files.json based on the baseline run:
git add museum-backend/.stryker-hot-files.json 2>/dev/null || true

git diff --cached --name-only | sort
```

Expected: 2 paths (3 if the registry was adjusted).

```bash
git commit -m "$(cat <<'EOF'
ci(stryker): wire mutation job + nightly cron + Phase 4 docs (Phase 4 Group D)

Phase 4 Group D — closes Phase 4.

- ci-cd-backend.yml gains a `mutation` job: runs Stryker incremental
  on every push (any branch), full nightly via the existing `schedule`
  cron. Postgres service container on port 5433 supports tests that
  hit a real DB. actions/cache@v4 shares the incremental cache across
  runs, keyed on stryker.config.mjs + jest.config.ts + hot-files
  registry hash.
- Hot-files gate runs after Stryker; pipeline fails if any hot file
  drops below 80% kill ratio.
- HTML report uploaded as artifact (14-day retention).
- CLAUDE.md gains a Phase 4 subsection documenting the pre-commit
  smart-skip + CI cadence + bootstrap commands.

Baseline kill ratios (from local `pnpm mutation:warm` run, see
commit body for per-file numbers — or "TBD on first CI run" if the
local warm was skipped).

Phase 4 closes. Phase 5 (auth e2e completeness) is the next
milestone per the master plan.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -5
git show --stat HEAD | head -15
```

If pre-commit hook bundles unrelated files: STOP, do NOT amend, report DONE_WITH_CONCERNS.

---

## Phase 4 Final Verification

- [ ] **Step F.1: All 4 commits landed**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind && git log --oneline -6
```

Expected (most recent first): D, C, B, A.

- [ ] **Step F.2: Gate script tests green**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
pnpm test -- scripts/__tests__/stryker-hot-files-gate.test.mjs 2>&1 | tail -10
```

Expected: 5 tests pass.

- [ ] **Step F.3: Workflow YAML clean**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-cd-backend.yml')); print('YAML OK')"
```

- [ ] **Step F.4: Stryker config valid**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
node -e 'import("./stryker.config.mjs").then((m) => { const c = m.default; console.log("mutate:", c.mutate.filter(p => !p.startsWith("!")).length, "thresholds:", c.thresholds); })'
```

Expected: mutate count includes the new 4 paths; thresholds are `high=85, low=70, break=70`.

- [ ] **Step F.5: Hot-files registry parseable**

```bash
node -e 'const j = require("./museum-backend/.stryker-hot-files.json"); console.log("entries:", j.hotFiles.length); for (const e of j.hotFiles) console.log("  -", e.path, "killRatioMin:", e.killRatioMin)'
```

Expected: 7 entries, each with `killRatioMin: 80` (or per-file overrides if you ratcheted down based on baseline).

- [ ] **Step F.6: Mark Phase 4 done in tracker**

Update tasks #31-#34 to completed.

---

## Out-of-Scope (Phase 5+)

- Mutation testing of museum-frontend or museum-web.
- Adding new Stryker mutators / operators beyond defaults.
- Coverage threshold uplift (Phase 8).
- Notification on nightly mutation regressions (Slack/email).
- Per-commit historical kill-ratio tracking dashboard.
- Refactoring `pre-commit-gate.sh` (already large; Phase 8 could split it).
