# Phase 2 — Maestro Mobile E2E on PR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing 11 Maestro flows into PR CI on Android (4-shard parallel), iOS nightly cron, with cached APK artifact and a shard-manifest sentinel preventing flow drift.

**Architecture:** Self-hosted on `macos-latest` GitHub runners (no Maestro Cloud). A new `prebuild` job builds the EAS preview APK once per PR (cached on a content-hash of mobile source paths) and uploads it as a workflow artifact. Four `maestro-shard` matrix jobs each download the APK, boot a docker-compose backend + Android emulator, install the APK, and run their assigned subset of flows from `museum-frontend/.maestro/shards.json`. A `maestro-summary` aggregator posts a PR comment. iOS runs nightly via cron in a separate `maestro-ios-nightly` job (full 11 flows on a single runner).

**Tech Stack:** Maestro CLI (self-installed, version-pinned), Android emulator (`reactivecircus/android-emulator-runner@v2`), Expo + Gradle for APK build, `actions/cache@v4`, `actions/upload-artifact@v4`, `actions/download-artifact@v4`, `actions/github-script@v7`, Bash + bats-core for helper-script tests, Node 22 + Jest for sentinel.

**Spec:** `docs/superpowers/specs/2026-05-01-phase2-maestro-mobile-pr-design.md`

**Total commits:** 4 (A / B / C / D per spec §9).

---

## Pre-Flight (no commit)

- [ ] **Step 0.1: Capture baseline**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind && git status --short | head -20
ls museum-frontend/.maestro/*.yaml | wc -l   # expect 12 (11 flows + config.yaml)
```

- [ ] **Step 0.2: Confirm parallel-session dirt list (anti-leak input)**

NEVER touch the existing files listed by previous Phase 0/1 commits (iOS, auth WIP, parallel plans). Run `git status --short` and treat anything not yours as off-limits.

Anti-leak protocol mandate before every `git commit`:

```bash
git restore --staged .
git add <intended files only>
git diff --cached --name-only | sort
# If any path outside intended list appears → STOP, run git restore --staged <bad path>
```

- [ ] **Step 0.3: Pin Maestro CLI version**

```bash
curl -sL https://maestro.mobile.dev/install.sh | head -5
```

Note the version that `latest` resolves to. Pin that exact version in workflow + helper scripts. Use `MAESTRO_VERSION=1.43.0` (or whatever the live release is at install time) consistently across all files.

---

## Commit A — Group A: Manifest + sentinel + helper scripts (no workflow changes)

### Task A1: Create the shard manifest

**Files:**
- Create: `museum-frontend/.maestro/shards.json`

- [ ] **Step A1.1: Write the manifest**

```bash
cat > /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/.maestro/shards.json <<'EOF'
{
  "shards": [
    {
      "name": "auth",
      "flows": ["auth-flow.yaml", "auth-persistence.yaml", "onboarding-flow.yaml"]
    },
    {
      "name": "chat",
      "flows": ["chat-flow.yaml", "chat-history-pagination.yaml", "museum-chat-flow.yaml"]
    },
    {
      "name": "museum",
      "flows": ["museum-search-geo.yaml", "navigation-flow.yaml"]
    },
    {
      "name": "settings",
      "flows": ["settings-flow.yaml", "settings-locale-switch.yaml", "support-ticket-create.yaml"]
    }
  ],
  "iosNightly": "all",
  "excluded": ["config.yaml"]
}
EOF
```

- [ ] **Step A1.2: Verify all 11 flows are accounted for**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
node -e '
const { readdirSync } = require("node:fs");
const flows = readdirSync("museum-frontend/.maestro").filter(f => f.endsWith(".yaml") && f !== "config.yaml");
const manifest = require("./museum-frontend/.maestro/shards.json");
const inShards = new Set(manifest.shards.flatMap(s => s.flows));
const missing = flows.filter(f => !inShards.has(f));
const extra = [...inShards].filter(f => !flows.includes(f));
console.log("flows on disk:", flows.length);
console.log("flows in shards:", inShards.size);
console.log("missing from shards:", missing);
console.log("extra in shards:", extra);
'
```

Expected: `flows on disk: 11`, `flows in shards: 11`, `missing: []`, `extra: []`. If a count is off, fix the manifest.

### Task A2: Sentinel — `maestro-shard-manifest.mjs` (TDD)

**Files:**
- Create: `scripts/sentinels/maestro-shard-manifest.mjs`
- Create: `museum-frontend/__tests__/sentinels/maestro-shard-manifest.test.ts`

- [ ] **Step A2.1: Write the failing Jest test (RED)**

Create `museum-frontend/__tests__/sentinels/maestro-shard-manifest.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SENTINEL = join(__dirname, '..', '..', '..', 'scripts', 'sentinels', 'maestro-shard-manifest.mjs');

function runSentinel(repoRoot: string): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [SENTINEL], {
      env: { ...process.env, MAESTRO_REPO_ROOT: repoRoot },
      encoding: 'utf-8',
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer; stderr?: Buffer };
    return {
      code: e.status ?? 1,
      stdout: e.stdout?.toString() ?? '',
      stderr: e.stderr?.toString() ?? '',
    };
  }
}

function setupFakeRepo(opts: {
  flows: string[];
  manifestFlows: string[][]; // one inner array per shard
}): string {
  const root = mkdtempSync(join(tmpdir(), 'maestro-sentinel-'));
  const maestroDir = join(root, 'museum-frontend', '.maestro');
  mkdirSync(maestroDir, { recursive: true });
  for (const f of opts.flows) {
    writeFileSync(join(maestroDir, f), '# fake flow\n');
  }
  writeFileSync(
    join(maestroDir, 'shards.json'),
    JSON.stringify({
      shards: opts.manifestFlows.map((flows, i) => ({ name: `shard${i}`, flows })),
      iosNightly: 'all',
      excluded: ['config.yaml'],
    }),
  );
  return root;
}

describe('maestro-shard-manifest sentinel', () => {
  it('exits 0 when every flow file appears in exactly one shard', () => {
    const root = setupFakeRepo({
      flows: ['a.yaml', 'b.yaml', 'c.yaml'],
      manifestFlows: [['a.yaml', 'b.yaml'], ['c.yaml']],
    });
    try {
      const r = runSentinel(root);
      expect(r.code).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('exits 1 when a flow file is missing from the manifest', () => {
    const root = setupFakeRepo({
      flows: ['a.yaml', 'b.yaml', 'unmapped.yaml'],
      manifestFlows: [['a.yaml', 'b.yaml']],
    });
    try {
      const r = runSentinel(root);
      expect(r.code).toBe(1);
      expect(r.stderr + r.stdout).toMatch(/unmapped\.yaml/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('exits 1 when a flow appears in more than one shard', () => {
    const root = setupFakeRepo({
      flows: ['a.yaml', 'b.yaml'],
      manifestFlows: [['a.yaml'], ['a.yaml', 'b.yaml']],
    });
    try {
      const r = runSentinel(root);
      expect(r.code).toBe(1);
      expect(r.stderr + r.stdout).toMatch(/duplicat/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('exits 1 when manifest references a flow that does not exist on disk', () => {
    const root = setupFakeRepo({
      flows: ['a.yaml'],
      manifestFlows: [['a.yaml', 'phantom.yaml']],
    });
    try {
      const r = runSentinel(root);
      expect(r.code).toBe(1);
      expect(r.stderr + r.stdout).toMatch(/phantom\.yaml/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step A2.2: Run the test, expect FAIL**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend
npm test -- --testPathPattern=maestro-shard-manifest 2>&1 | tail -10
```

Expected: All 4 tests FAIL with `ENOENT` or `Cannot find module` (sentinel doesn't exist yet). Confirms RED.

- [ ] **Step A2.3: Implement the sentinel**

```bash
cat > /Users/Tim/Desktop/all/dev/Pro/InnovMind/scripts/sentinels/maestro-shard-manifest.mjs <<'EOF'
#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Phase 2 sentinel: every Maestro flow file under museum-frontend/.maestro/
 * (excluding config.yaml and helpers/) MUST be listed in exactly one shard
 * of museum-frontend/.maestro/shards.json.
 *
 * Exit codes:
 *   0 — every flow is in exactly one shard, every shard reference exists on disk
 *   1 — at least one flow missing, duplicated, or phantom
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = process.env.MAESTRO_REPO_ROOT
  ? resolve(process.env.MAESTRO_REPO_ROOT)
  : resolve(__dirname, '..', '..');
const MAESTRO_DIR = resolve(REPO_ROOT, 'museum-frontend/.maestro');
const MANIFEST_PATH = resolve(MAESTRO_DIR, 'shards.json');

function listFlowFiles() {
  const out = [];
  for (const entry of readdirSync(MAESTRO_DIR)) {
    const full = join(MAESTRO_DIR, entry);
    if (!statSync(full).isFile()) continue;
    if (!entry.endsWith('.yaml')) continue;
    out.push(entry);
  }
  return out;
}

function main() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  } catch (err) {
    console.error(`Cannot read shard manifest at ${MANIFEST_PATH}: ${err.message}`);
    process.exit(1);
  }

  const excluded = new Set(manifest.excluded ?? []);
  const onDisk = listFlowFiles().filter((f) => !excluded.has(f));

  const inShards = manifest.shards.flatMap((s) => s.flows);
  const seen = new Map();
  const duplicates = [];
  for (const f of inShards) {
    if (seen.has(f)) duplicates.push(f);
    seen.set(f, true);
  }

  const missing = onDisk.filter((f) => !seen.has(f));
  const phantom = inShards.filter((f) => !onDisk.includes(f));

  const errors = [];
  if (missing.length) errors.push(`Flows missing from shard manifest: ${missing.join(', ')}`);
  if (phantom.length) errors.push(`Manifest references phantom flow files: ${phantom.join(', ')}`);
  if (duplicates.length) errors.push(`Duplicated flows across shards: ${duplicates.join(', ')}`);

  if (errors.length) {
    for (const e of errors) console.error(e);
    console.error('');
    console.error('Add the new flow file to a shard in museum-frontend/.maestro/shards.json,');
    console.error('OR remove the manifest entry if the flow was deleted.');
    process.exit(1);
  }

  console.log(`OK — ${onDisk.length} Maestro flows mapped to ${manifest.shards.length} shards.`);
  process.exit(0);
}

main();
EOF
chmod +x /Users/Tim/Desktop/all/dev/Pro/InnovMind/scripts/sentinels/maestro-shard-manifest.mjs
```

- [ ] **Step A2.4: Re-run the Jest test, expect PASS**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend
npm test -- --testPathPattern=maestro-shard-manifest 2>&1 | tail -10
```

Expected: 4 tests pass.

- [ ] **Step A2.5: Run the sentinel against the real repo, expect exit 0**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
node scripts/sentinels/maestro-shard-manifest.mjs ; echo "exit=$?"
```

Expected: `OK — 11 Maestro flows mapped to 4 shards.` and `exit=0`.

### Task A3: Helper scripts — `maestro-runner-setup.sh` + `maestro-run-shard.sh`

**Files:**
- Create: `museum-frontend/scripts/maestro-runner-setup.sh`
- Create: `museum-frontend/scripts/maestro-run-shard.sh`
- Create: `museum-frontend/__tests__/scripts/maestro-run-shard.test.sh`

- [ ] **Step A3.1: Write `maestro-runner-setup.sh`**

```bash
cat > /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/scripts/maestro-runner-setup.sh <<'EOF'
#!/usr/bin/env bash
# Phase 2 — Maestro runner setup.
# Boots the docker-compose backend (Postgres + API) and waits for /api/health.
#
# Usage: maestro-runner-setup.sh
#   No arguments. Reads from cwd; expects museum-backend/ to be at ../museum-backend.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "[setup] starting docker-compose backend stack…"
cd "$REPO_ROOT/museum-backend"
docker compose -f docker-compose.dev.yml up -d
cd "$REPO_ROOT/museum-backend"

# Install backend deps + run migrations (Phase 2 requires real schema for flows that hit /api/auth/register)
echo "[setup] installing backend deps…"
corepack enable
pnpm install --frozen-lockfile

echo "[setup] running migrations…"
DB_HOST=localhost DB_PORT=5433 DB_USER=museum_dev DB_PASSWORD=museum_dev_password PGDATABASE=museum_dev \
  pnpm migration:run

# Start the backend API in the background, log to /tmp/backend.log
echo "[setup] starting backend API…"
DB_HOST=localhost DB_PORT=5433 DB_USER=museum_dev DB_PASSWORD=museum_dev_password PGDATABASE=museum_dev \
  PORT=3000 \
  JWT_ACCESS_SECRET=phase2-e2e-access JWT_REFRESH_SECRET=phase2-e2e-refresh \
  CORS_ORIGINS=http://localhost:8081 \
  pnpm dev > /tmp/backend.log 2>&1 &

# Wait for /api/health up to 120s
echo "[setup] waiting for /api/health…"
for i in $(seq 1 120); do
  if curl -fsS http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "[setup] backend ready after ${i}s"
    exit 0
  fi
  sleep 1
done

echo "[setup] backend did NOT come up in 120s — last 30 lines of log:"
tail -30 /tmp/backend.log || true
exit 1
EOF
chmod +x /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/scripts/maestro-runner-setup.sh
```

- [ ] **Step A3.2: Write `maestro-run-shard.sh`**

```bash
cat > /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/scripts/maestro-run-shard.sh <<'EOF'
#!/usr/bin/env bash
# Phase 2 — Run the Maestro flows for a given shard.
#
# Usage: maestro-run-shard.sh <shard_name>
#   <shard_name>: must match a shard.name in .maestro/shards.json (auth | chat | museum | settings | all)
#
# When <shard_name> = "all", runs the iOS-nightly union (all flows in shards[*].flows).
set -euo pipefail

SHARD="${1:?Usage: maestro-run-shard.sh <shard_name>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAESTRO_DIR="$(cd "$SCRIPT_DIR/../.maestro" && pwd)"
LOG_DIR="$MAESTRO_DIR/logs"
mkdir -p "$LOG_DIR"

if ! command -v jq > /dev/null 2>&1; then
  echo "[shard] jq is required — install via brew install jq" >&2
  exit 1
fi
if ! command -v maestro > /dev/null 2>&1; then
  echo "[shard] maestro CLI is required — see https://maestro.mobile.dev/" >&2
  exit 1
fi

if [ "$SHARD" = "all" ]; then
  FLOWS=$(jq -r '.shards[].flows[]' "$MAESTRO_DIR/shards.json")
else
  FLOWS=$(jq -r --arg s "$SHARD" '.shards[] | select(.name == $s) | .flows[]' "$MAESTRO_DIR/shards.json")
fi

if [ -z "$FLOWS" ]; then
  echo "[shard] no flows found for shard '$SHARD' — check shards.json" >&2
  exit 1
fi

FAIL_COUNT=0
echo "[shard:$SHARD] flows to run:"
echo "$FLOWS"

while IFS= read -r flow; do
  [ -z "$flow" ] && continue
  echo "[shard:$SHARD] running $flow…"
  if maestro test "$MAESTRO_DIR/$flow" 2>&1 | tee "$LOG_DIR/${SHARD}-${flow%.yaml}.log"; then
    echo "[shard:$SHARD] $flow PASS"
  else
    echo "[shard:$SHARD] $flow FAIL"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done <<< "$FLOWS"

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "[shard:$SHARD] $FAIL_COUNT flow(s) failed."
  exit 1
fi

echo "[shard:$SHARD] all flows passed."
exit 0
EOF
chmod +x /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/scripts/maestro-run-shard.sh
```

- [ ] **Step A3.3: Write a bats-core test for shard parsing**

First install bats:

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend
npm install --save-dev --no-audit --no-fund bats@1.10.0 2>&1 | tail -3
```

Then create the test:

```bash
mkdir -p /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/__tests__/scripts
cat > /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/__tests__/scripts/maestro-run-shard.test.sh <<'EOF'
#!/usr/bin/env bats
# Phase 2 — Tests for maestro-run-shard.sh shard parsing.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/maestro-run-shard.sh"
  TMPDIR_TEST="$(mktemp -d)"
  mkdir -p "$TMPDIR_TEST/.maestro"
  cat > "$TMPDIR_TEST/.maestro/shards.json" <<JSON
{
  "shards": [
    { "name": "auth",     "flows": ["x.yaml", "y.yaml"] },
    { "name": "chat",     "flows": ["z.yaml"] }
  ],
  "iosNightly": "all",
  "excluded": []
}
JSON
}

teardown() {
  rm -rf "$TMPDIR_TEST"
}

@test "fails fast when no shard name is provided" {
  run bash "$SCRIPT"
  [ "$status" -ne 0 ]
  [[ "$output" =~ "Usage:" ]]
}

@test "fails fast on unknown shard name" {
  # use mocked maestro CLI to skip the actual run
  PATH="$TMPDIR_TEST/bin:$PATH"
  mkdir -p "$TMPDIR_TEST/bin"
  echo '#!/usr/bin/env bash' > "$TMPDIR_TEST/bin/maestro"
  echo 'exit 0' >> "$TMPDIR_TEST/bin/maestro"
  chmod +x "$TMPDIR_TEST/bin/maestro"

  # also stub jq + script's MAESTRO_DIR resolution
  # The script resolves .maestro relative to itself; we only sanity-check the
  # error path — real execution covered by GH Actions integration.
  run bash "$SCRIPT" definitely-not-a-shard
  [ "$status" -ne 0 ]
}
EOF
chmod +x /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/__tests__/scripts/maestro-run-shard.test.sh
```

- [ ] **Step A3.4: Run the bats test**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend
npx bats __tests__/scripts/maestro-run-shard.test.sh 2>&1 | tail -10
```

Expected: 2 tests pass.

- [ ] **Step A3.5: shellcheck both scripts**

```bash
which shellcheck > /dev/null 2>&1 || brew install shellcheck
shellcheck /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/scripts/maestro-runner-setup.sh
shellcheck /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend/scripts/maestro-run-shard.sh
```

Expected: 0 errors. Warnings about heredocs or unquoted assignments may appear; treat each individually — only `error` (severity ≥ error) is blocking.

### Task A4: Wire shard sentinel into `quality` job and commit

- [ ] **Step A4.1: Insert sentinel step in `ci-cd-mobile.yml` `quality` job**

In `.github/workflows/ci-cd-mobile.yml`, find the existing step:

```yaml
      - name: Check no unicode emoji in screens/copy (P4 emoji guard)
        # UX policy: mobile uses PNG (require) + Ionicons only. ...
        run: node ../scripts/check-no-unicode-emoji.cjs
```

Add a new step IMMEDIATELY AFTER it:

```yaml
      - name: Maestro shard-manifest sentinel
        run: node ../scripts/sentinels/maestro-shard-manifest.mjs
```

(`working-directory` defaults to `museum-frontend` for this job, hence the `../scripts/` relative path.)

Validate YAML:

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-cd-mobile.yml')); print('YAML OK')"
```

- [ ] **Step A4.2: Run sentinel + tests one final time**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
node scripts/sentinels/maestro-shard-manifest.mjs && echo OK
cd museum-frontend && npm test -- --testPathPattern=maestro-shard-manifest 2>&1 | tail -5
npx bats __tests__/scripts/maestro-run-shard.test.sh 2>&1 | tail -5
```

All green.

- [ ] **Step A4.3: Anti-leak commit**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .

git add museum-frontend/.maestro/shards.json
git add scripts/sentinels/maestro-shard-manifest.mjs
git add museum-frontend/scripts/maestro-runner-setup.sh
git add museum-frontend/scripts/maestro-run-shard.sh
git add museum-frontend/__tests__/sentinels/maestro-shard-manifest.test.ts
git add museum-frontend/__tests__/scripts/maestro-run-shard.test.sh
git add museum-frontend/package.json
git add museum-frontend/package-lock.json 2>/dev/null || true
git add .github/workflows/ci-cd-mobile.yml

git diff --cached --name-only | sort
```

Verify only the above paths. If anything else: `git restore --staged <bad path>`.

- [ ] **Step A4.4: Commit A**

```bash
git commit -m "$(cat <<'EOF'
test(maestro): shard manifest + sentinel + helper scripts (Phase 2 Group A)

Phase 2 Group A — establishes the manifest + helper-script infrastructure
needed by the PR Maestro pipeline. No CI workflow change yet (the
maestro-shard matrix lands in Group B).

- museum-frontend/.maestro/shards.json: 4-shard split of the existing
  11 flows (auth/chat/museum/settings, ~3 flows each).
- scripts/sentinels/maestro-shard-manifest.mjs: walks the .maestro
  directory, asserts every flow is in exactly one shard with no
  phantom or duplicate entries. Exits non-zero on violation. Wired
  into ci-cd-mobile.yml `quality` job.
- museum-frontend/scripts/maestro-runner-setup.sh: boots
  docker-compose + runs migrations + waits for /api/health.
- museum-frontend/scripts/maestro-run-shard.sh: reads shards.json,
  runs each flow in the shard via `maestro test`. Self-tested via
  bats-core fixtures.
- Sentinel covered by Jest tests with synthetic-repo fixtures.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -3
git show --stat HEAD | head -15
```

If pre-commit hook bundles unrelated files: STOP, do NOT amend, report DONE_WITH_CONCERNS.

---

## Commit B — Group B: PR matrix wiring (`prebuild` + `maestro-shard` + `maestro-summary`)

This commit replaces the existing `maestro-e2e` (Maestro Cloud) job with three new jobs: `prebuild` (cached APK build), `maestro-shard` (4-way matrix), `maestro-summary` (PR comment aggregator). Changes only `.github/workflows/ci-cd-mobile.yml`.

### Task B1: Read the current `maestro-e2e` job + locate exact replace boundary

- [ ] **Step B1.1: Capture current maestro-e2e job content**

```bash
sed -n '/^  maestro-e2e:/,/^  [a-z]/p' /Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/ci-cd-mobile.yml | head -40
```

Note the start line + the line where the next top-level job begins. The maestro-e2e job will be entirely replaced by 3 new jobs.

### Task B2: Replace `maestro-e2e` with `prebuild` + `maestro-shard` + `maestro-summary`

- [ ] **Step B2.1: Write the replacement YAML block**

Use `Edit` to replace the entire `maestro-e2e:` job block (from `  maestro-e2e:` line through the line before the next top-level job, typically `  build:` or end-of-file) with this content:

```yaml
  # ─── 2. Maestro APK prebuild (cached on mobile-source content hash) ──────
  prebuild:
    needs: quality
    runs-on: macos-latest
    timeout-minutes: 20
    defaults:
      run:
        working-directory: museum-frontend
    outputs:
      cache-hit: ${{ steps.cache-apk.outputs.cache-hit }}
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd  # v6
      - name: Setup Node
        uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e  # v6
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: museum-frontend/package-lock.json

      - name: Restore APK cache
        id: cache-apk
        uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830  # v4
        with:
          path: museum-frontend/android/app/build/outputs/apk/debug/app-debug.apk
          key: maestro-apk-${{ runner.os }}-${{ hashFiles('museum-frontend/src/**', 'museum-frontend/features/**', 'museum-frontend/shared/**', 'museum-frontend/app/**', 'museum-frontend/assets/**', 'museum-frontend/app.config.ts', 'museum-frontend/package.json', 'museum-frontend/package-lock.json') }}
          restore-keys: |
            maestro-apk-${{ runner.os }}-

      - name: Setup Java (cache miss only)
        if: steps.cache-apk.outputs.cache-hit != 'true'
        uses: actions/setup-java@3a4f6e1af504cf6a31855fa4c1abb7ff36cb7d8d  # v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Install npm deps (cache miss only)
        if: steps.cache-apk.outputs.cache-hit != 'true'
        run: npm install --no-audit --no-fund

      - name: Expo prebuild Android (cache miss only)
        if: steps.cache-apk.outputs.cache-hit != 'true'
        run: npx expo prebuild --platform android --clean

      - name: Gradle assembleDebug (cache miss only)
        if: steps.cache-apk.outputs.cache-hit != 'true'
        run: cd android && ./gradlew assembleDebug --no-daemon

      - name: Upload APK artifact
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02  # v4
        with:
          name: preview-apk
          path: museum-frontend/android/app/build/outputs/apk/debug/app-debug.apk
          retention-days: 1

  # ─── 3. Maestro shard matrix (Android, PR + push to main/staging) ─────────
  maestro-shard:
    if: ${{ github.event_name != 'schedule' }}
    needs: prebuild
    runs-on: macos-latest
    timeout-minutes: 20
    strategy:
      fail-fast: false
      matrix:
        shard: [auth, chat, museum, settings]
    defaults:
      run:
        working-directory: museum-frontend
    env:
      MAESTRO_VERSION: '1.43.0'
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd  # v6
      - name: Setup Node
        uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e  # v6
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: museum-frontend/package-lock.json
      - name: Setup pnpm
        uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320  # v5
        with:
          version: 10
      - name: Setup Java
        uses: actions/setup-java@3a4f6e1af504cf6a31855fa4c1abb7ff36cb7d8d  # v4
        with:
          distribution: 'temurin'
          java-version: '17'
      - name: Download APK artifact
        uses: actions/download-artifact@d3f86a106a0bac45b6f6c19abdd8bcd76ed47d72  # v4
        with:
          name: preview-apk
          path: museum-frontend/android/app/build/outputs/apk/debug/

      - name: Install Maestro CLI
        run: |
          curl -Ls "https://get.maestro.mobile.dev" | bash
          echo "$HOME/.maestro/bin" >> "$GITHUB_PATH"
      - name: Verify Maestro version
        run: maestro --version

      - name: Boot backend (docker-compose + migrations + API)
        working-directory: museum-frontend
        run: ./scripts/maestro-runner-setup.sh

      - name: Enable KVM (for hardware-accelerated emulator)
        if: runner.os == 'Linux'
        run: |
          echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' | sudo tee /etc/udev/rules.d/99-kvm4all.rules
          sudo udevadm control --reload-rules
          sudo udevadm trigger --name-match=kvm

      - name: Run Maestro shard on Android emulator
        uses: reactivecircus/android-emulator-runner@1dcd0090116d15e7c562f8db72807de5e036a4ed  # v2
        with:
          api-level: 33
          arch: x86_64
          profile: pixel_6
          force-avd-creation: false
          emulator-options: -no-snapshot-save -no-window -gpu swiftshader_indirect -noaudio -no-boot-anim -camera-back none
          disable-animations: true
          script: |
            cd museum-frontend
            adb install -r android/app/build/outputs/apk/debug/app-debug.apk
            ./scripts/maestro-run-shard.sh ${{ matrix.shard }}

      - name: Upload shard logs
        if: always()
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02  # v4
        with:
          name: maestro-shard-${{ matrix.shard }}-logs
          path: museum-frontend/.maestro/logs/
          retention-days: 7

  # ─── 4. Aggregate shard results into a PR comment ─────────────────────────
  maestro-summary:
    if: ${{ always() && github.event_name == 'pull_request' }}
    needs: maestro-shard
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/download-artifact@d3f86a106a0bac45b6f6c19abdd8bcd76ed47d72  # v4
        with:
          path: shard-logs
      - name: Post summary as PR comment
        uses: actions/github-script@60a0d83039c74a4aee543508d2ffcb1c3799cdea  # v7
        with:
          script: |
            const fs = require('fs');
            const path = require('path');
            const root = 'shard-logs';
            const shards = fs.existsSync(root) ? fs.readdirSync(root) : [];
            const lines = ['## Maestro shard results', ''];
            for (const shard of shards) {
              const dir = path.join(root, shard);
              const logs = fs.readdirSync(dir).filter(f => f.endsWith('.log'));
              const fails = logs.filter(f => fs.readFileSync(path.join(dir, f), 'utf-8').includes('FAIL'));
              lines.push(`- **${shard}**: ${logs.length - fails.length}/${logs.length} flows passed${fails.length ? ` — failed: ${fails.map(f => f.replace('.log','')).join(', ')}` : ''}`);
            }
            const body = lines.join('\n');
            const { owner, repo } = context.repo;
            const issueNumber = context.payload.pull_request?.number;
            if (!issueNumber) return;
            await github.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body });
```

- [ ] **Step B2.2: Validate YAML**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-cd-mobile.yml')); print('YAML OK')"
```

Expected: `YAML OK`. If parse fails: re-read the diff, fix indentation.

- [ ] **Step B2.3: Run actionlint locally**

```bash
which actionlint > /dev/null 2>&1 || brew install actionlint
actionlint /Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/ci-cd-mobile.yml
```

Expected: 0 errors. Warnings about expressions are OK; structural errors are blocking.

### Task B3: Anti-leak + commit B

- [ ] **Step B3.1: Stage + commit**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .
git add .github/workflows/ci-cd-mobile.yml
git diff --cached --name-only | sort
```

Expected: exactly one path. If anything else: `git restore --staged <bad path>`.

```bash
git commit -m "$(cat <<'EOF'
ci(maestro): wire PR Android matrix + summary, replace cloud job (Phase 2 Group B)

Phase 2 Group B — PR-triggered Maestro pipeline goes live for Android.

- prebuild: builds the EAS preview APK once per PR; caches under a
  hash of mobile-source paths so unrelated PRs hit the cache and skip
  the ~12-min Expo prebuild + Gradle build. Uploads the APK as a
  workflow artifact `preview-apk`.
- maestro-shard: 4-way matrix (auth | chat | museum | settings).
  Each shard downloads the APK, boots docker-compose backend via
  scripts/maestro-runner-setup.sh, runs scripts/maestro-run-shard.sh
  on a freshly booted Android emulator (api 33 / pixel_6).
- maestro-summary: aggregates shard logs and posts a PR comment with
  pass/fail per shard via actions/github-script@v7.
- Removed: the previous maestro-e2e (Maestro Cloud) job. Cloud action
  is no longer used; MAESTRO_CLOUD_API_KEY cleanup tracked in Group D.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -3
git show --stat HEAD | head -10
```

If pre-commit hook bundles unrelated files: STOP, report DONE_WITH_CONCERNS.

---

## Commit C — Group C: iOS nightly cron

### Task C1: Add `maestro-ios-nightly` job

- [ ] **Step C1.1: Append the new job to `ci-cd-mobile.yml`**

Use `Edit` to add immediately after the `maestro-summary:` job block (i.e., as the last top-level job before any deploy/build jobs):

```yaml
  # ─── 5. iOS nightly Maestro suite (cron-only) ───────────────────────────
  maestro-ios-nightly:
    if: ${{ github.event_name == 'schedule' }}
    needs: quality
    runs-on: macos-latest
    timeout-minutes: 60
    defaults:
      run:
        working-directory: museum-frontend
    env:
      MAESTRO_VERSION: '1.43.0'
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd  # v6
      - name: Setup Node
        uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e  # v6
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: museum-frontend/package-lock.json
      - name: Setup pnpm
        uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320  # v5
        with:
          version: 10
      - name: Install npm deps
        run: npm install --no-audit --no-fund
      - name: Expo prebuild iOS
        run: npx expo prebuild --platform ios --clean
      - name: Build iOS Debug app for Simulator
        run: |
          cd ios
          xcodebuild -workspace Musaium.xcworkspace \
            -scheme Musaium \
            -configuration Debug \
            -sdk iphonesimulator \
            -derivedDataPath build \
            CODE_SIGNING_ALLOWED=NO \
            build
      - name: Install Maestro CLI
        run: |
          curl -Ls "https://get.maestro.mobile.dev" | bash
          echo "$HOME/.maestro/bin" >> "$GITHUB_PATH"
      - name: Boot backend (docker-compose + migrations + API)
        run: ./scripts/maestro-runner-setup.sh
      - name: Boot iOS Simulator
        run: |
          xcrun simctl create maestro-sim "iPhone 15" "iOS17.5" || true
          xcrun simctl boot "maestro-sim" || true
      - name: Install app on simulator
        run: |
          APP_PATH=$(find ios/build/Build/Products/Debug-iphonesimulator -name "*.app" -type d | head -1)
          xcrun simctl install booted "$APP_PATH"
      - name: Run all Maestro flows (sequential)
        run: ./scripts/maestro-run-shard.sh all
      - name: Upload iOS Maestro logs
        if: always()
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02  # v4
        with:
          name: maestro-ios-nightly-logs
          path: museum-frontend/.maestro/logs/
          retention-days: 7
```

- [ ] **Step C1.2: Validate YAML**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-cd-mobile.yml')); print('YAML OK')" && actionlint .github/workflows/ci-cd-mobile.yml
```

Expected: YAML OK + actionlint clean.

### Task C2: Anti-leak + commit C

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .
git add .github/workflows/ci-cd-mobile.yml
git diff --cached --name-only | sort

git commit -m "$(cat <<'EOF'
ci(maestro): iOS nightly cron job runs full 11-flow suite (Phase 2 Group C)

Phase 2 Group C — iOS coverage via cron, no PR cost.

- maestro-ios-nightly job runs only on schedule (existing 03:17 UTC
  cron). Builds iOS Debug for Simulator (xcodebuild + simctl), boots
  the same docker-compose backend the Android shards use, runs the
  full 11-flow set sequentially via maestro-run-shard.sh all.
- Logs uploaded as artifact for 7 days. Failure does not block PRs
  but surfaces in the workflow run UI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -3
git show --stat HEAD | head -10
```

---

## Commit D — Group D: Cleanup (`MAESTRO_CLOUD_API_KEY` + CLAUDE.md)

### Task D1: Verify `MAESTRO_CLOUD_API_KEY` is unused, remove references

- [ ] **Step D1.1: Search for remaining references**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
grep -rn "MAESTRO_CLOUD_API_KEY\|action-maestro-cloud" .github/ docs/ scripts/ museum-frontend/ 2>&1 | grep -v "^Binary file" | grep -v "node_modules"
```

If any reference appears outside the now-deleted `maestro-e2e` job (which Group B removed):
- A workflow file — check whether it's actively used; if so, leave the secret alone and document.
- Docs — update the docs to reflect the new self-hosted approach.
- Scripts — remove the reference.

Expected: zero `action-maestro-cloud` references; zero `MAESTRO_CLOUD_API_KEY` references in workflow files. If grep returns empty, proceed.

- [ ] **Step D1.2: Note the secret for manual deletion**

The plan cannot delete repo secrets directly — that requires repo admin access via `gh secret delete MAESTRO_CLOUD_API_KEY`. Document for manual cleanup. Add to the commit message body so the cleanup is tracked.

### Task D2: Update CLAUDE.md mobile e2e section

- [ ] **Step D2.1: Read existing CLAUDE.md mobile section**

```bash
grep -A20 "Maestro\|mobile e2e\|.maestro" /Users/Tim/Desktop/all/dev/Pro/InnovMind/CLAUDE.md | head -40
```

If a Maestro section exists, edit it. If not, add a new subsection under "## CI" describing the new pipeline.

- [ ] **Step D2.2: Add or replace the Maestro section**

Append to the appropriate place in CLAUDE.md (use Edit, not Write):

```markdown
### Maestro mobile E2E (Phase 2)

- 11 flows in `museum-frontend/.maestro/`, sharded 4 ways for PR matrix Android runs (`auth | chat | museum | settings`). Shard manifest at `museum-frontend/.maestro/shards.json`.
- Self-hosted on `macos-latest` GitHub runners — no Maestro Cloud.
- PR pipeline: `prebuild` (cached APK) → 4× `maestro-shard` (parallel) → `maestro-summary` PR comment.
- iOS nightly (03:17 UTC cron) runs the full set sequentially in `maestro-ios-nightly`.
- Backend: docker-compose stack on the runner. V2 will swap to public staging.
- New flow files MUST be added to `shards.json`; the `maestro-shard-manifest.mjs` sentinel in the `quality` job rejects PRs that violate this.
- Helper scripts: `museum-frontend/scripts/maestro-runner-setup.sh` (backend boot), `museum-frontend/scripts/maestro-run-shard.sh` (flow runner). Bats-tested.
- See `docs/superpowers/specs/2026-05-01-phase2-maestro-mobile-pr-design.md` for the full spec.
```

### Task D3: Anti-leak + commit D

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .
git add CLAUDE.md
git diff --cached --name-only | sort

git commit -m "$(cat <<'EOF'
docs(claude-md): document Phase 2 Maestro pipeline (Phase 2 Group D)

Final Phase 2 commit — closes the documentation gap.

- CLAUDE.md gains a "Maestro mobile E2E (Phase 2)" subsection
  describing the 4-shard PR matrix, iOS nightly cron, helper scripts,
  and shard sentinel.
- No more references to MAESTRO_CLOUD_API_KEY in workflows or docs.
- TODO for repo admin: delete the MAESTRO_CLOUD_API_KEY secret via
  `gh secret delete MAESTRO_CLOUD_API_KEY` (cannot be done from a PR).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -5
```

---

## Phase 2 Final Verification (no commit)

- [ ] **Step F.1: All 4 commits landed**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind && git log --oneline -6
```

Expected (most recent first):
1. `docs(claude-md): document Phase 2 Maestro pipeline (Phase 2 Group D)`
2. `ci(maestro): iOS nightly cron job runs full 11-flow suite (Phase 2 Group C)`
3. `ci(maestro): wire PR Android matrix + summary, replace cloud job (Phase 2 Group B)`
4. `test(maestro): shard manifest + sentinel + helper scripts (Phase 2 Group A)`

- [ ] **Step F.2: Sentinel green on real repo**

```bash
node /Users/Tim/Desktop/all/dev/Pro/InnovMind/scripts/sentinels/maestro-shard-manifest.mjs && echo OK
```

- [ ] **Step F.3: Workflow YAML clean**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-cd-mobile.yml')); print('YAML OK')"
actionlint .github/workflows/ci-cd-mobile.yml
```

- [ ] **Step F.4: Helper scripts pass shellcheck + bats**

```bash
shellcheck museum-frontend/scripts/maestro-runner-setup.sh museum-frontend/scripts/maestro-run-shard.sh
cd museum-frontend && npx bats __tests__/scripts/maestro-run-shard.test.sh
```

- [ ] **Step F.5: Sentinel Jest test green**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-frontend
npm test -- --testPathPattern=maestro-shard-manifest 2>&1 | tail -5
```

- [ ] **Step F.6: First real PR — observe pipeline end-to-end**

After landing the 4 commits, open a synthetic PR that touches `museum-frontend/features/auth/login.tsx` to force cache miss. Observe in GitHub Actions:
1. `quality` runs (lint + typecheck + tests + sentinel + shard manifest sentinel).
2. `prebuild` runs the full Expo prebuild + Gradle build.
3. 4× `maestro-shard` run in parallel, each takes ~5 min.
4. `maestro-summary` posts a PR comment.

Capture the wall-clock time and per-shard runtime. If any shard exceeds 10 min, investigate (likely emulator boot or app install).

- [ ] **Step F.7: Mark Phase 2 done in the task tracker**

Update tasks #18–#22 to completed.

---

## Out-of-Scope (Phase 3+)

- Public-staging backend integration (V2 of mobile e2e).
- Adding new Maestro flows for new features (always must include shard-manifest entry per the sentinel).
- iOS PR coverage (currently nightly only).
- Real-device farm (currently emulator + simulator).
- Notification on iOS nightly failures (Slack/email — Phase 5 follow-up).
- Per-flow retry tuning (escalate from 0 retries if flake rate > 5%).
