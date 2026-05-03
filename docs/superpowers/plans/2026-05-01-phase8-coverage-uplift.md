# Phase 8 — Coverage Uplift Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift BE coverage to 90/78/85/90 + FE to 90/80/80/90 via TDD red-then-green tests targeting Phase 4 hot files first; enforce on every commit via pre-commit smart-skip + CI hard-fail.

**Architecture:** Audit-first approach (Commit A produces a gap-analysis doc per app per file). Test additions (Commits B + C) target uncovered hot files first per Phase 4 Stryker registry, then uncovered service / use-case code, with explicit anti-cosmetic-test discipline. Wire-up (Commit D) tightens jest configs, adds `test:coverage` scripts, extends `pre-commit-gate.sh` with smart-skip coverage step, enforces in `ci-cd-backend.yml` + `ci-cd-mobile.yml`, updates ratchet file + CLAUDE.md.

**Tech Stack:** Jest 29 (BE+FE), Vitest (web — skipped this phase), GitHub Actions, Bash hooks, Node 22, pnpm 10.

**Spec:** `docs/superpowers/specs/2026-05-01-phase8-coverage-uplift-design.md`

**Total commits:** 4 (A / B / C / D per spec §8).

---

## Pre-Flight (no commit)

- [ ] **Step 0.1: Capture exact current coverage**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
pnpm test -- --coverage --coverageReporters=text-summary 2>&1 | tail -20
```

Capture: stmt / branches / fn / lines numbers. Match against the ratchet file (87.56 / 76.72 / 81.29 / 87.98). If actual differs significantly, the ratchet is stale — note for Commit D.

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend
npm run test:coverage -- --coverageReporters=text-summary 2>&1 | tail -20
```

Capture FE numbers; the ratchet file doesn't track FE coverage today.

- [ ] **Step 0.2: Anti-leak protocol**

NEVER touch:
- `museum-frontend/ios/...`
- `museum-frontend/__tests__/hooks/useSocialLogin.test.ts`
- `museum-frontend/__tests__/infrastructure/socialAuthProviders.test.ts`
- `museum-frontend/features/auth/...`
- `museum-frontend/__tests__/a11y/...`
- `museum-frontend/__tests__/components/AuthScreen.test.tsx`
- `AGENTS.md`, `docs/plans/README.md`, `museum-backend/src/helpers/swagger.ts`
- Any path in `git status --short` you didn't create

Apply before EVERY commit:
```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind && git restore --staged . && git add <intended only> && git diff --cached --name-only | sort
```

---

## Commit A — Audit + gap analysis

### Task A1: Write the audit script

**Files:**
- Create: `scripts/audits/coverage-gap-analysis.mjs`

- [ ] **Step A1.1: Write the script**

```bash
mkdir -p /Users/Tim/Desktop/all/dev/Pro/InnovMind/scripts/audits
cat > /Users/Tim/Desktop/all/dev/Pro/InnovMind/scripts/audits/coverage-gap-analysis.mjs <<'EOF'
#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Phase 8 audit: parses lcov coverage outputs from BE + FE and emits a
 * markdown gap-analysis doc.
 *
 * For each file:
 *   - lines covered / total
 *   - branches covered / total
 *   - whether file is in Phase 4 hot-files registry
 *
 * Output: per-app, sorted by uncovered-line count descending. Top-N
 * shows highest-ROI uplift candidates.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(__dirname, '..', '..');

function parseLcov(path) {
  let lcov;
  try {
    lcov = readFileSync(path, 'utf-8');
  } catch (err) {
    return [];
  }
  const out = [];
  let cur = null;
  for (const line of lcov.split('\n')) {
    if (line.startsWith('SF:')) cur = { file: line.slice(3), lf: 0, lh: 0, bf: 0, bh: 0, fnf: 0, fnh: 0 };
    else if (line.startsWith('LF:') && cur) cur.lf = Number(line.slice(3));
    else if (line.startsWith('LH:') && cur) cur.lh = Number(line.slice(3));
    else if (line.startsWith('BRF:') && cur) cur.bf = Number(line.slice(4));
    else if (line.startsWith('BRH:') && cur) cur.bh = Number(line.slice(4));
    else if (line.startsWith('FNF:') && cur) cur.fnf = Number(line.slice(4));
    else if (line.startsWith('FNH:') && cur) cur.fnh = Number(line.slice(4));
    else if (line === 'end_of_record' && cur) {
      out.push(cur);
      cur = null;
    }
  }
  return out;
}

function pct(hit, total) {
  if (total === 0) return 100;
  return (hit / total) * 100;
}

function loadHotFiles() {
  try {
    const reg = JSON.parse(readFileSync(resolve(ROOT, 'museum-backend/.stryker-hot-files.json'), 'utf-8'));
    return new Set(reg.hotFiles.map((e) => e.path));
  } catch {
    return new Set();
  }
}

function formatApp(name, lcovPath, hotFiles, target) {
  const records = parseLcov(lcovPath);
  if (records.length === 0) return `## ${name}\n\n_No lcov found at ${lcovPath} — run \`pnpm test:coverage\` first._\n`;

  const totals = records.reduce(
    (acc, r) => ({
      lf: acc.lf + r.lf, lh: acc.lh + r.lh,
      bf: acc.bf + r.bf, bh: acc.bh + r.bh,
      fnf: acc.fnf + r.fnf, fnh: acc.fnh + r.fnh,
    }),
    { lf: 0, lh: 0, bf: 0, bh: 0, fnf: 0, fnh: 0 },
  );

  const lines = [`## ${name}`, ''];
  lines.push(`**Globals:** lines ${pct(totals.lh, totals.lf).toFixed(2)}% (target ${target.lines}) | branches ${pct(totals.bh, totals.bf).toFixed(2)}% (target ${target.branches}) | functions ${pct(totals.fnh, totals.fnf).toFixed(2)}% (target ${target.functions})`);
  lines.push('');
  lines.push('### Top 30 files by uncovered-line count');
  lines.push('');
  lines.push('| File | Lines | Branches | Functions | Hot? |');
  lines.push('|---|---|---|---|---|');
  records
    .map((r) => ({ ...r, uncovered: r.lf - r.lh }))
    .sort((a, b) => b.uncovered - a.uncovered)
    .slice(0, 30)
    .forEach((r) => {
      const rel = r.file.replace(ROOT + '/', '').replace('museum-backend/', '').replace('museum-frontend/', '');
      const hot = hotFiles.has(rel) || hotFiles.has(r.file.replace(ROOT + '/', ''));
      lines.push(
        `| ${rel} | ${r.lh}/${r.lf} (${pct(r.lh, r.lf).toFixed(0)}%) | ${r.bh}/${r.bf} (${pct(r.bh, r.bf).toFixed(0)}%) | ${r.fnh}/${r.fnf} (${pct(r.fnh, r.fnf).toFixed(0)}%) | ${hot ? '🔥' : ''} |`,
      );
    });
  lines.push('');
  return lines.join('\n');
}

function main() {
  const hotFiles = loadHotFiles();
  const beLcov = resolve(ROOT, 'museum-backend/coverage/lcov.info');
  const feLcov = resolve(ROOT, 'museum-frontend/coverage/lcov.info');

  const out = [
    '# Phase 8 — Coverage Gap Analysis',
    '',
    `_Generated 2026-05-01 by scripts/audits/coverage-gap-analysis.mjs_`,
    '',
    formatApp('museum-backend', beLcov, hotFiles, { lines: 90, branches: 78, functions: 85 }),
    formatApp('museum-frontend', feLcov, hotFiles, { lines: 90, branches: 80, functions: 80 }),
    '## Recommendations',
    '',
    '1. **Hot files (🔥)** are highest priority — Phase 4 Stryker registry overlap.',
    '2. **Top-uncovered services / use-cases** next.',
    '3. **Skip** generated code, migrations, type-only files.',
    '4. **Banking-grade rule**: every new test must pin a named regression. NO cosmetic tests.',
    '',
  ].join('\n');

  const outPath = resolve(ROOT, 'docs/audits/2026-05-01-coverage-gaps.md');
  writeFileSync(outPath, out);
  console.log(`Wrote ${outPath}`);
}

main();
EOF
chmod +x /Users/Tim/Desktop/all/dev/Pro/InnovMind/scripts/audits/coverage-gap-analysis.mjs
```

### Task A2: Run BE + FE coverage to populate lcov

- [ ] **Step A2.1: Run BE coverage**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
pnpm test -- --coverage 2>&1 | tail -10
ls coverage/lcov.info
```

Expected: `coverage/lcov.info` exists.

- [ ] **Step A2.2: Run FE coverage**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend
npm run test:coverage 2>&1 | tail -10
ls coverage/lcov.info
```

Expected: `coverage/lcov.info` exists.

### Task A3: Run audit + write gap doc

- [ ] **Step A3.1: Run the audit**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
mkdir -p docs/audits
node scripts/audits/coverage-gap-analysis.mjs
cat docs/audits/2026-05-01-coverage-gaps.md | head -80
```

Verify the doc contains globals + top-30 file tables for BE + FE.

### Task A4: Anti-leak commit A

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .
git add scripts/audits/coverage-gap-analysis.mjs
git add docs/audits/2026-05-01-coverage-gaps.md

git diff --cached --name-only | sort
```

```bash
git commit -m "$(cat <<'EOF'
test(coverage): Phase 8 gap analysis script + initial audit (Phase 8 Group A)

Phase 8 Group A — audit-first approach to coverage uplift.

- scripts/audits/coverage-gap-analysis.mjs: parses BE + FE lcov.info,
  intersects with Phase 4 Stryker hot-files registry, emits markdown
  per-app + top-30 by uncovered-line count.
- docs/audits/2026-05-01-coverage-gaps.md: first run, captures
  current globals + top files needing tests. Phase 8 Commits B + C
  use this as the priority queue (hot files first).

Banking-grade discipline: NO cosmetic tests. The audit ranks files
by uncovered-line count + flags hot files; implementer adds tests
that pin named regressions per spec §5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -3
git show --stat HEAD | head -10
```

---

## Commit B — BE coverage uplift tests

The implementer reads `docs/audits/2026-05-01-coverage-gaps.md` and writes tests for the top files. **No prescribed test code in this plan** — the actual tests depend on which files surface as gaps.

### Task B1: Iterative TDD against the gap list

- [ ] **Step B1.1: Read the BE section of the audit doc**

```bash
sed -n '/^## museum-backend/,/^## museum-frontend/p' /Users/Tim/Desktop/all/dev/Pro/InnovMind/docs/audits/2026-05-01-coverage-gaps.md | head -50
```

Identify the top 5-10 files with the largest gap. Prioritise hot files (🔥) first.

- [ ] **Step B1.2: For each top file — TDD pattern**

Repeat for each prioritised file:

1. Read the file (`cat museum-backend/src/<path>`).
2. Identify the uncovered branches / functions (cross-reference via `coverage/lcov-report/<path>.html`).
3. For each named uncovered branch, write a test that **pins the regression that would fire if the branch silently changed behavior**. Examples:
   - Uncovered `if (token === null) throw badRequest(...)` → test that `null` token throws specifically `INVALID_TOKEN` AppError, not a generic 500.
   - Uncovered `catch` block that downgrades a Sentry error → test that the error is captured + the user gets a user-facing message (no stack-trace leak).
4. Add tests to the existing test file (or create a new one if no test file exists for that source).
5. Run `pnpm test -- --testPathPattern=<file basename>` to verify the test passes.
6. Re-run global coverage: `pnpm test -- --coverage --coverageReporters=text-summary 2>&1 | tail -5`. Verify the relevant metric ticks up.

**Anti-cosmetic-test rule:** if you find yourself writing a test like `expect(fn(input)).toBeDefined()` or `expect(() => fn()).not.toThrow()` without an asserting on a specific output value or error code, STOP. That's a cosmetic test. Find a real assertion or move to the next file.

If a file's uncovered branches genuinely cannot be tested without refactoring (e.g., tightly coupled module with no DI seam), STOP after 30 minutes on it, add a `// @TODO Phase 9: refactor for testability — uncovered branch at L<N>` comment, and lower the BE branches threshold by the file's contribution to the gap. Document the deferral in the Commit B body.

- [ ] **Step B1.3: Final pass — verify globals**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
pnpm test -- --coverage --coverageReporters=text-summary 2>&1 | tail -10
```

Expected: stmt ≥ 90, branches ≥ 78, fn ≥ 85, lines ≥ 90 (Q4=α targets).

If any metric falls short:
- If gap ≤ 1pt: keep iterating (small lift).
- If gap > 1pt and the audit's remaining files are all hard-to-test: lower the threshold to the actual achieved value + 0.5pt buffer in `museum-backend/jest.config.ts` AND add a `// TODO Phase 9: target was 90; achieved <X>; deferred until <reason>` comment. Document in Commit B body.

### Task B2: Anti-leak commit B

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .
# Stage all new + modified BE test files
git add museum-backend/tests/
git add museum-backend/jest.config.ts 2>/dev/null || true  # only if threshold lowered

git diff --cached --name-only | sort
```

Verify scope = only BE test files + (optionally) jest.config.ts.

```bash
git commit -m "$(cat <<'EOF'
test(coverage): BE uplift to <achieved>/<achieved>/<achieved>/<achieved> (Phase 8 Group B)

Phase 8 Group B — BE coverage uplift via TDD on hot files first.

- Added <N> tests across <M> files to pin named regressions in
  Phase 4 hot files + top-uncovered services.
- Final coverage: stmt <X>%, branches <X>%, fn <X>%, lines <X>%.
  [If threshold lowered, document delta + Phase 9 follow-up.]
- Each new test pins a specific contract — no cosmetic additions.

Files touched (test additions only):
- [list]

[If any production code @TODO Phase 9 markers added, list here.]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -3
git show --stat HEAD | head -15
```

---

## Commit C — FE coverage uplift tests

Same TDD pattern as Commit B, but targets `museum-frontend`.

### Task C1: Iterative TDD against FE gap list

- [ ] **Step C1.1: Read FE section**

```bash
sed -n '/^## museum-frontend/,/^## Recommendations/p' /Users/Tim/Desktop/all/dev/Pro/InnovMind/docs/audits/2026-05-01-coverage-gaps.md | head -50
```

- [ ] **Step C1.2: For each top file — TDD pattern**

Repeat per file (same procedure as Commit B Step B1.2):
1. Read the source file.
2. Identify uncovered branches / functions (`coverage/lcov-report/<path>.html`).
3. Write tests pinning real regressions.
4. Use Phase 7 factories where applicable.
5. Use existing test-utils from `museum-frontend/__tests__/helpers/`.
6. Re-run coverage; verify uplift.

**Mobile-specific anti-pattern reminder:** prefer role-query / behaviour assertions over snapshot tests (Phase 0 already established this). Don't lift coverage by adding `toMatchSnapshot()` — that's the canonical cosmetic-test pattern.

- [ ] **Step C1.3: Final pass**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend
npm run test:coverage 2>&1 | tail -10
```

Expected: stmt ≥ 90, branches ≥ 80, fn ≥ 80, lines ≥ 90.

If gap remains: same fallback as Commit B (lower threshold + document).

### Task C2: Anti-leak commit C

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .
git add museum-frontend/__tests__/
git add museum-frontend/jest.config.js 2>/dev/null || true  # only if threshold lowered

git diff --cached --name-only | sort
```

```bash
git commit -m "$(cat <<'EOF'
test(coverage): FE uplift to <achieved>/<achieved>/<achieved>/<achieved> (Phase 8 Group C)

Phase 8 Group C — FE coverage uplift via TDD on top-uncovered files.

- Added <N> tests across <M> files. Used Phase 7 factories
  (makeUser, makeMessage, makeSession, makeReview, etc.) — no inline
  entity construction.
- No new toMatchSnapshot() additions — Phase 0 cosmetic-test rule
  enforced.
- Final coverage: stmt <X>%, branches <X>%, fn <X>%, lines <X>%.

Files touched (test additions only):
- [list]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -3
git show --stat HEAD | head -10
```

---

## Commit D — Wire-up: thresholds + scripts + hooks + CI + ratchet + docs

### Task D1: Update jest config thresholds

**Files:**
- Modify: `museum-backend/jest.config.ts`
- Modify: `museum-frontend/jest.config.js`

- [ ] **Step D1.1: BE thresholds**

In `museum-backend/jest.config.ts`, find:

```ts
coverageThreshold: {
  global: {
    statements: 87,
    branches: 76,
    functions: 81,
    lines: 87,
  },
},
```

Replace with the Phase 8 final values (90/78/85/90 if Commit B reached target; otherwise the achieved+0.5 buffer values from Commit B):

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

Remove the existing `// TODO(coverage-uplift)` comment block.

- [ ] **Step D1.2: FE thresholds**

In `museum-frontend/jest.config.js`, find:

```js
coverageThreshold: {
  global: {
    statements: 86,
    branches: 74,
    functions: 72,
    lines: 87,
  },
},
```

Replace with the Phase 8 final values (90/80/80/90 if Commit C reached target):

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

### Task D2: Add `test:coverage` script to BE package.json

**Files:**
- Modify: `museum-backend/package.json`

- [ ] **Step D2.1: Add script**

Find the existing `test:scripts` line (added in the Phase 6 bugfix) in `museum-backend/package.json`:

```json
"test": "jest --watchman=false --runInBand --selectProjects unit-integration",
"test:scripts": "NODE_OPTIONS=--experimental-vm-modules jest --watchman=false --runInBand --selectProjects scripts-esm",
```

Add a new `test:coverage` line after them:

```json
"test:coverage": "jest --watchman=false --runInBand --selectProjects unit-integration --coverage",
```

(FE already has `test:coverage` per package.json check at Step 0.1.)

### Task D3: Extend pre-commit hook with smart-skip coverage step

**Files:**
- Modify: `.claude/hooks/pre-commit-gate.sh`

- [ ] **Step D3.1: Add coverage step**

Use `Edit` to add this step IMMEDIATELY AFTER the existing Stryker step (Phase 4 Commit C added that), and BEFORE the final error-decision block:

```bash
# Phase 8: coverage gate — runs full coverage when source files are staged
if [ -z "${SKIP_COVERAGE_GATE:-}" ]; then
  STAGED_BE_SRC=$(git diff --cached --name-only --diff-filter=d 2>/dev/null | grep -E '^museum-backend/src/.*\.ts$' || true)
  STAGED_FE_SRC=$(git diff --cached --name-only --diff-filter=d 2>/dev/null | grep -E '^museum-frontend/(src|features|shared|app)/.*\.tsx?$' || true)

  if [ -n "$STAGED_BE_SRC" ]; then
    echo "[coverage] BE source staged — running coverage gate"
    if ! (cd "$REPO_ROOT/museum-backend" && pnpm run test:coverage 2>&1 | tail -25); then
      ERRORS="${ERRORS}BE coverage threshold FAIL. "
    fi
  fi

  if [ -n "$STAGED_FE_SRC" ]; then
    echo "[coverage] FE source staged — running coverage gate"
    if ! (cd "$REPO_ROOT/museum-frontend" && npm run test:coverage 2>&1 | tail -25); then
      ERRORS="${ERRORS}FE coverage threshold FAIL. "
    fi
  fi
fi
```

The `SKIP_COVERAGE_GATE` env var allows fast iteration loops (`SKIP_COVERAGE_GATE=1 git commit ...`); CI catches the miss.

- [ ] **Step D3.2: shellcheck**

```bash
which shellcheck > /dev/null 2>&1 && shellcheck /Users/Tim/Desktop/all/dev/Pro/InnovMind/.claude/hooks/pre-commit-gate.sh || echo "shellcheck skipped"
```

Expected: 0 errors. Warnings acceptable.

### Task D4: CI enforcement

**Files:**
- Modify: `.github/workflows/ci-cd-backend.yml`
- Modify: `.github/workflows/ci-cd-mobile.yml`

- [ ] **Step D4.1: BE workflow**

Locate the existing test step in `ci-cd-backend.yml` `quality` job. Add a coverage step (or replace the existing test step):

```bash
grep -n "pnpm test\|pnpm run test" /Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/ci-cd-backend.yml | head -5
```

Replace `pnpm test` with `pnpm run test:coverage` in the `quality` job (or add a new step right after if `quality` runs both unit + integration).

- [ ] **Step D4.2: FE workflow**

```bash
grep -n "npm test\|npm run test" /Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/ci-cd-mobile.yml | head -5
```

Replace `npm test` with `npm run test:coverage` (or add a new step).

- [ ] **Step D4.3: Validate YAML**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-cd-backend.yml')); yaml.safe_load(open('.github/workflows/ci-cd-mobile.yml')); print('YAML OK')"
```

Expected: `YAML OK`.

### Task D5: Update ratchet file

**Files:**
- Modify: `.claude/quality-ratchet.json`

- [ ] **Step D5.1: Update coverage values**

Read the file:

```bash
cat /Users/Tim/Desktop/all/dev/Pro/InnovMind/.claude/quality-ratchet.json
```

Use `Edit` to update the BE coverage fields to the Phase 8 achieved values + add FE coverage fields:

```json
{
  "lastUpdated": "2026-05-01",
  ...existing fields...
  "coverageStatements": <BE achieved stmt>,
  "coverageBranches": <BE achieved branches>,
  "coverageFunctions": <BE achieved functions>,
  "coverageLines": <BE achieved lines>,
  "coverageStatementsFrontend": <FE achieved stmt>,
  "coverageBranchesFrontend": <FE achieved branches>,
  "coverageFunctionsFrontend": <FE achieved functions>,
  "coverageLinesFrontend": <FE achieved lines>,
  ...
}
```

Use the actual numbers from `pnpm test:coverage` final summary (Step B1.3 + C1.3).

### Task D6: CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step D6.1: Add Phase 8 subsection**

Find the Phase 7 subsection in CLAUDE.md, add Phase 8 immediately after:

```bash
grep -n "Phase 7\|Factory locations" /Users/Tim/Desktop/all/dev/Pro/InnovMind/CLAUDE.md | head -5
```

Use `Edit` to insert this content:

```markdown
### Coverage uplift gates (Phase 8)

- BE thresholds: 90 / 78 / 85 / 90 (statements / branches / functions / lines).
- FE thresholds: 90 / 80 / 80 / 90.
- Web Vitest: unchanged at 70 / 60 / 70 / 70 (Phase 8 Q5=a — Playwright + a11y + Lighthouse cover web).
- Pre-commit gate (`.claude/hooks/pre-commit-gate.sh`) runs `pnpm test:coverage` (BE) + `npm run test:coverage` (FE) ONLY when staged files include source under `museum-backend/src/` or `museum-frontend/{src,features,shared,app}/`. Most commits skip (0s overhead).
- Escape hatch: `SKIP_COVERAGE_GATE=1 git commit ...` for fast local iteration; CI still enforces unconditionally.
- CI hard-fail: `ci-cd-backend.yml` + `ci-cd-mobile.yml` `quality` jobs run with `--coverage`; threshold miss blocks PR.
- Branches threshold deliberately stays at 78 BE / 80 FE — Phase 0 challenger pushback. Phase 4 mutation kill ratio (≥80% on hot files) is the banking-grade signal; aggressive branches uplift forces cosmetic test patterns.
- See `docs/superpowers/specs/2026-05-01-phase8-coverage-uplift-design.md`.
```

### Task D7: Final verification

- [ ] **Step D7.1: Run all gates locally**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
pnpm run test:coverage 2>&1 | tail -10

cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend
npm run test:coverage 2>&1 | tail -10

cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-cd-backend.yml')); yaml.safe_load(open('.github/workflows/ci-cd-mobile.yml')); print('YAML OK')"
```

Expected: both coverage runs pass thresholds; YAML OK.

### Task D8: Anti-leak commit D

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .
git add museum-backend/jest.config.ts museum-backend/package.json
git add museum-frontend/jest.config.js
git add .claude/hooks/pre-commit-gate.sh
git add .claude/quality-ratchet.json
git add .github/workflows/ci-cd-backend.yml
git add .github/workflows/ci-cd-mobile.yml
git add CLAUDE.md

git diff --cached --name-only | sort
```

Verify exactly 8 paths.

```bash
git commit -m "$(cat <<'EOF'
ci(coverage): Phase 8 thresholds + pre-commit gate + CI hard-fail (Phase 8 Group D)

Phase 8 Group D — closes Phase 8 + closes the entire banking-grade
test transformation series.

- museum-backend/jest.config.ts: thresholds 90/78/85/90 (was 87/76/81/87).
- museum-frontend/jest.config.js: thresholds 90/80/80/90 (was 86/74/72/87).
- museum-backend/package.json: new test:coverage script.
- .claude/hooks/pre-commit-gate.sh: smart-skip coverage step. Fires
  only when staged files include BE src/ or FE {src,features,shared,
  app}/. SKIP_COVERAGE_GATE=1 escape hatch for fast iteration.
- ci-cd-backend.yml + ci-cd-mobile.yml: quality job runs with
  --coverage; threshold miss hard-fails PR (matches Phase 4 Stryker
  pattern).
- .claude/quality-ratchet.json: updated to reflect Phase 8 achieved
  floor (BE + FE coverage fields).
- CLAUDE.md: Phase 8 subsection documenting the policy.

Phase 8 closes. The 8-phase banking-grade test transformation is
complete: ADR-012 taxonomy → real-PG integration → Maestro mobile
PR matrix → web admin Playwright + a11y → Stryker mutation testing
→ auth e2e completeness → chaos resilience → factory migration →
coverage uplift gates.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -6
git show --stat HEAD | head -15
```

---

## Phase 8 Final Verification

- [ ] **Step F.1: All 4 commits landed**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind && git log --oneline -6
```

Expected: D, C, B, A.

- [ ] **Step F.2: Gates green end-to-end**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && pnpm run test:coverage 2>&1 | tail -5
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend && npm run test:coverage 2>&1 | tail -5
```

Expected: both pass with the new thresholds.

- [ ] **Step F.3: Mark Phase 8 done in tracker**

Update tasks #55-#58 to completed.

---

## Out-of-Scope (Phase 9+)

- Web Vitest uplift (Q5=a deferral — Playwright covers web).
- Per-file coverage thresholds (Phase 4 mutation handles per-file).
- Refactors of any `// @TODO Phase 9: refactor for testability` markers Phase 8 may leave behind.
- Codecov / dashboard integration (out of scope).
- Branches threshold push beyond 78 BE / 80 FE — see ADR-007 + Phase 0 challenger.
