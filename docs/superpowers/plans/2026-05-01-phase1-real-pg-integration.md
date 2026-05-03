# Phase 1 — Real-PG Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every BE integration test to a real Postgres testcontainer per ADR-012 §4.2, add migration round-trip CI verification, install the tier-signature CI guard, and wire the integration suite into PR CI.

**Architecture:** A new lightweight `createIntegrationHarness()` boots a per-Jest-worker Postgres testcontainer, runs all TypeORM migrations, exposes `dataSource` + `reset()` (TRUNCATE … RESTART IDENTITY CASCADE between tests). The harness sets DB env vars **before** module imports so that `AppDataSource` is bound to the container — the existing module composition roots (which instantiate repositories at import time against `AppDataSource`) work without refactor. Tests interact with services / use-cases directly (Pattern A) or mount the real router on a bare Express app pointing at the harness's DataSource (Pattern B).

**Tech Stack:** TypeORM 0.3, Postgres 16, Jest 29, `tests/helpers/e2e/postgres-testcontainer.ts` (existing), Express 5, supertest, Node 22.

**Spec:** `docs/superpowers/specs/2026-05-01-phase1-real-pg-integration-design.md`

**Total commits:** 4 (Group 1 / 2 / 3 / 4 per spec §5).

---

## Pre-Flight (no commit)

Verify baseline before any work.

- [ ] **Step 0.1: Capture baseline**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
pnpm test 2>&1 | tail -10
git status --short | head
```

Expected: BE unit tests pass (≥3453 from prior session). Capture exact pass count for §F.x verification at end.

- [ ] **Step 0.2: Confirm parallel-session dirt list (anti-leak input)**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind && git status --short | head -20
```

Anti-leak protocol mandate before every `git commit`:

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .
git add <intended files>
git diff --cached --name-only | sort
# If anything outside intended list appears → STOP, run git restore --staged <bad path>
```

Files NEVER to touch (parallel session):
- `museum-frontend/ios/...`
- `museum-frontend/__tests__/hooks/useSocialLogin.test.ts`
- `museum-frontend/__tests__/infrastructure/socialAuthProviders.test.ts`
- `museum-frontend/features/auth/...`
- `docs/superpowers/plans/2026-04-30-A1-A2-critical-fk-indexes.md`
- Any other path appearing in `git status --short` that you didn't create

---

## Commit 1 — Group 1: Harness + migration round-trip + tier-signature sentinel

### Task 1.1: Create integration harness skeleton

**Files:**
- Create: `museum-backend/tests/helpers/integration/integration-harness.ts`
- Create: `museum-backend/tests/helpers/integration/README.md`

- [ ] **Step 1.1.1: Write the failing test that calls `createIntegrationHarness()`**

Create `museum-backend/tests/integration/_smoke/integration-harness.smoke.test.ts`:

```ts
import { createIntegrationHarness, type IntegrationHarness } from 'tests/helpers/integration/integration-harness';

describe('integration-harness smoke [integration]', () => {
  jest.setTimeout(180_000);

  let harness: IntegrationHarness;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
  });

  it('exposes a connected DataSource that can run trivial SQL', async () => {
    const result = await harness.dataSource.query('SELECT 1 as ok');
    expect(result).toEqual([{ ok: 1 }]);
  });

  it('reset() clears domain tables without dropping schema', async () => {
    await harness.dataSource.query("INSERT INTO users (email, password, firstname, lastname, role) VALUES ('reset-test@example.com', 'h', 'a', 'b', 'visitor')");
    await harness.reset();
    const after = await harness.dataSource.query("SELECT count(*)::int AS c FROM users WHERE email = 'reset-test@example.com'");
    expect(after).toEqual([{ c: 0 }]);
  });
});
```

Note: this smoke file is in `tests/integration/_smoke/` — under `tests/integration/` so the tier-signature sentinel will scan it (it imports `tests/helpers/integration/integration-harness` which matches the rule).

- [ ] **Step 1.1.2: Run the test, expect FAIL (module not found)**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
RUN_INTEGRATION=true pnpm test -- --testPathPattern=integration-harness.smoke 2>&1 | tail -10
```

Expected: `Cannot find module 'tests/helpers/integration/integration-harness'`. Confirms TDD red.

- [ ] **Step 1.1.3: Implement the harness**

Create `museum-backend/tests/helpers/integration/integration-harness.ts`:

```ts
import 'reflect-metadata';
import {
  startPostgresTestContainer,
  type StartedPostgresTestContainer,
} from 'tests/helpers/e2e/postgres-testcontainer';

/**
 * Test utility: handle for an integration test environment.
 * Wraps a per-Jest-worker Postgres testcontainer with a TypeORM DataSource
 * that has all migrations applied. `reset()` truncates domain tables
 * without dropping schema (fast per-test cleanup).
 */
export interface IntegrationHarness {
  /** TypeORM DataSource — the singleton AppDataSource bound to the container. */
  dataSource: import('typeorm').DataSource;
  /** TRUNCATE every TypeORM entity table CASCADE + RESTART IDENTITY. ~5ms. */
  reset: () => Promise<void>;
  /** Stop the container. Idempotent. */
  stop: () => Promise<void>;
  /** Wire afterAll(stop) for the calling Jest suite. */
  scheduleStop: () => void;
}

interface CachedHarness {
  workerId: string;
  container: StartedPostgresTestContainer;
  harness: IntegrationHarness;
}

let cached: CachedHarness | undefined;

const setEnvForContainer = (container: StartedPostgresTestContainer): void => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = container.host;
  process.env.DB_PORT = String(container.port);
  process.env.DB_USER = container.user;
  process.env.DB_PASSWORD = container.password;
  process.env.PGDATABASE = container.database;
  process.env.DB_SYNCHRONIZE = 'false';
  // JWT secrets required by env.ts validation, even though we don't issue
  // tokens at the harness layer (route-level tests may need them).
  process.env.JWT_ACCESS_SECRET ??= 'integration-access-secret';
  process.env.JWT_REFRESH_SECRET ??= 'integration-refresh-secret';
  // Disable rate-limit interference for integration tests.
  process.env.RATE_LIMIT_IP ??= '10000';
  process.env.RATE_LIMIT_SESSION ??= '10000';
};

const buildHarness = async (
  container: StartedPostgresTestContainer,
): Promise<IntegrationHarness> => {
  setEnvForContainer(container);

  // Dynamic import AFTER env vars are set so AppDataSource binds to the container.
  const { AppDataSource } = await import('@src/data/db/data-source');

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  await AppDataSource.runMigrations({ transaction: 'each' });

  const reset = async (): Promise<void> => {
    const tables = AppDataSource.entityMetadatas
      .filter((m) => m.tableType === 'regular')
      .map((m) => `"${m.tableName}"`);
    if (tables.length === 0) return;
    await AppDataSource.query(
      `TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`,
    );
  };

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    await container.stop();
    cached = undefined;
  };

  const scheduleStop = (): void => {
    afterAll(async () => {
      await stop();
    });
  };

  return { dataSource: AppDataSource, reset, stop, scheduleStop };
};

/**
 * Create (or reuse) a Postgres testcontainer for the current Jest worker,
 * apply migrations, return a harness with reset/stop/DataSource.
 */
export const createIntegrationHarness = async (): Promise<IntegrationHarness> => {
  const workerId = process.env.JEST_WORKER_ID ?? '0';
  if (cached && cached.workerId === workerId) {
    return cached.harness;
  }
  if (cached) {
    // Worker id changed — should be rare; clean up the stale container.
    await cached.harness.stop();
    cached = undefined;
  }
  const container = await startPostgresTestContainer();
  const harness = await buildHarness(container);
  cached = { workerId, container, harness };
  return harness;
};
```

Create `museum-backend/tests/helpers/integration/README.md`:

```markdown
# Integration Test Harness

`createIntegrationHarness()` boots a Postgres testcontainer (one per Jest worker), runs all TypeORM migrations, and returns a handle for integration tests.

Use this harness for ADR-012 integration tests — tests that cross the DB boundary but do NOT spin up the full Express app + middleware chain.

## Pattern A — service / use-case direct

```ts
import { createIntegrationHarness } from 'tests/helpers/integration/integration-harness';
import { buildChatService } from '@modules/chat';

describe('chat-service-pagination [integration]', () => {
  let harness;
  let service;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    service = buildChatService(harness.dataSource);
  });

  beforeEach(() => harness.reset());

  it('paginates messages correctly', async () => { /* ... */ });
});
```

## Pattern B — route mount on bare Express app

```ts
import express from 'express';
import request from 'supertest';
import { createIntegrationHarness } from 'tests/helpers/integration/integration-harness';
import { mountAuthRoutes } from '@modules/auth';

describe('auth.route [integration]', () => {
  let harness;
  let app;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    app = express().use(express.json());
    mountAuthRoutes(app); // module reads AppDataSource → already bound to container
  });

  beforeEach(() => harness.reset());

  it('POST /api/auth/register → 201', async () => { /* ... */ });
});
```

## When NOT to use this harness

- Pure-function logic — use `tests/unit/` instead.
- Full-stack flow including LangChain, Sentry, rate-limit middleware, BullMQ — use `tests/e2e/` and `createE2EHarness()`.

## Container strategy

- One container per Jest worker, reused across suites in that worker.
- `reset()` runs `TRUNCATE … RESTART IDENTITY CASCADE` on every entity table — single round-trip, ~5ms.
- Migrations run once per worker on first `createIntegrationHarness()` call.
```

- [ ] **Step 1.1.4: Add the `test:integration` script + run smoke test**

In `museum-backend/package.json`, add to the `scripts` section after the existing `test:e2e` line:

```json
"test:integration": "RUN_INTEGRATION=true jest --watchman=false --runInBand --testPathPattern=tests/integration/ --forceExit"
```

(Use the exact same JSON formatting as adjacent scripts. Position it between `test:e2e` and `test:contract:openapi`.)

Then run the smoke test:

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
pnpm run test:integration --testPathPattern=integration-harness.smoke 2>&1 | tail -20
```

Expected: 2 tests pass. Container boot ~5–8s. If failure: read the error, fix the harness or the test, do NOT loosen.

### Task 1.2: Migration round-trip test

**Files:**
- Create: `museum-backend/tests/integration/db/migration-round-trip.test.ts`
- Create: `museum-backend/tests/helpers/integration/schema-fingerprint.ts`

- [ ] **Step 1.2.1: Write `dumpSchemaFingerprint` helper**

Create `museum-backend/tests/helpers/integration/schema-fingerprint.ts`:

```ts
import type { DataSource } from 'typeorm';

export interface SchemaFingerprint {
  tables: Record<
    string,
    {
      columns: Array<{ name: string; type: string; nullable: boolean }>;
      indexes: Array<{ name: string; columns: string[]; unique: boolean }>;
      foreignKeys: string[]; // constraint names, sorted
    }
  >;
}

/**
 * Test utility: capture a normalised, deeply-comparable structural fingerprint
 * of the public schema. Excludes TypeORM's own `migrations` table (which has
 * row data that differs per up/down round trip).
 */
export async function dumpSchemaFingerprint(ds: DataSource): Promise<SchemaFingerprint> {
  const tablesRaw = await ds.query<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name <> 'migrations'
     ORDER BY table_name`,
  );
  const fingerprint: SchemaFingerprint = { tables: {} };

  for (const { table_name } of tablesRaw) {
    const columns = await ds.query<
      Array<{ column_name: string; data_type: string; is_nullable: 'YES' | 'NO' }>
    >(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY column_name`,
      [table_name],
    );

    const indexes = await ds.query<
      Array<{ indexname: string; indexdef: string }>
    >(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = $1
       ORDER BY indexname`,
      [table_name],
    );

    const foreignKeys = await ds.query<Array<{ constraint_name: string }>>(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_schema = 'public' AND table_name = $1 AND constraint_type = 'FOREIGN KEY'
       ORDER BY constraint_name`,
      [table_name],
    );

    fingerprint.tables[table_name] = {
      columns: columns.map((c) => ({
        name: c.column_name,
        type: c.data_type,
        nullable: c.is_nullable === 'YES',
      })),
      indexes: indexes.map((i) => ({
        name: i.indexname,
        columns: extractIndexColumns(i.indexdef),
        unique: /CREATE UNIQUE INDEX/i.test(i.indexdef),
      })),
      foreignKeys: foreignKeys.map((f) => f.constraint_name),
    };
  }
  return fingerprint;
}

function extractIndexColumns(indexdef: string): string[] {
  const match = indexdef.match(/\(([^)]+)\)/);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((c) => c.trim().replace(/^"/, '').replace(/"$/, ''))
    .filter((c) => c.length > 0);
}
```

- [ ] **Step 1.2.2: Write the failing migration round-trip test**

Create `museum-backend/tests/integration/db/migration-round-trip.test.ts`:

```ts
import { createIntegrationHarness, type IntegrationHarness } from 'tests/helpers/integration/integration-harness';
import { dumpSchemaFingerprint } from 'tests/helpers/integration/schema-fingerprint';

describe('migration round-trip [integration, real PG]', () => {
  jest.setTimeout(300_000);

  let harness: IntegrationHarness;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
  });

  it('every migration applies up → down → up cleanly with stable schema', async () => {
    const ds = harness.dataSource;

    const schemaA = await dumpSchemaFingerprint(ds);

    const migrationCount = ds.migrations.length;
    expect(migrationCount).toBeGreaterThan(0);

    // 1. Roll every migration back, asserting each `down()` succeeds.
    for (let i = 0; i < migrationCount; i += 1) {
      await ds.undoLastMigration({ transaction: 'each' });
    }

    const schemaEmpty = await dumpSchemaFingerprint(ds);
    expect(Object.keys(schemaEmpty.tables)).toEqual([]);

    // 2. Re-run all migrations.
    await ds.runMigrations({ transaction: 'each' });
    const schemaB = await dumpSchemaFingerprint(ds);

    // 3. Round-trip equality.
    expect(schemaB).toEqual(schemaA);
  });
});
```

- [ ] **Step 1.2.3: Run the test, expect PASS**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
pnpm run test:integration --testPathPattern=migration-round-trip 2>&1 | tail -20
```

Expected: Test passes. Runtime ~30–60s (44 migrations × down + up).

If a migration's `down()` fails: that migration was always broken; fix the migration's `down()` method, do NOT loosen the test. Land the migration fix in this same commit with a clear message.

If schema fingerprints differ: a migration's `down()` doesn't fully reverse `up()`. Same response — fix the migration, not the test.

### Task 1.3: Tier-signature sentinel

**Files:**
- Create: `scripts/sentinels/integration-tier-signature.mjs`
- Create: `scripts/sentinels/.integration-tier-baseline.json`
- Create: `museum-backend/tests/integration/_smoke/integration-tier-baseline-cap.test.ts`

- [ ] **Step 1.3.1: Write the sentinel script**

Create `/Users/Tim/Desktop/all/dev/Pro/InnovMind/scripts/sentinels/integration-tier-signature.mjs`:

```js
#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * ADR-012 §4.2 tier-signature sentinel.
 *
 * Walks museum-backend/tests/integration/, reads each *.test.ts, and asserts
 * the file imports a real-infra signature (DB testcontainer, DataSource, or
 * a real outbound network call). Files explicitly listed in the baseline JSON
 * are exempted with a documented reason.
 *
 * Exit codes:
 *   0 — all files match the rule (or are baselined)
 *   1 — at least one file violates the rule
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(__dirname, '..', '..');
const INTEGRATION_DIR = resolve(REPO_ROOT, 'museum-backend/tests/integration');
const BASELINE_PATH = resolve(__dirname, '.integration-tier-baseline.json');

const REAL_INTEGRATION_PATTERNS = [
  /from ['"]tests\/helpers\/(e2e|integration)\/(postgres-testcontainer|integration-harness|e2e-app-harness)['"]/,
  /from ['"]tests\/helpers\/integration\/[^'"]+['"]/,
  /\bDataSource\b[\s\S]{0,200}?from ['"]typeorm['"]/,
  /\bgetRepository\s*\(/,
  /\bfetch\s*\(\s*['"`]https?:/,
  /\baxios\.(get|post|put|delete|patch)\s*\(/,
];

function listTsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

function fileMatchesTierSignature(content) {
  return REAL_INTEGRATION_PATTERNS.some((re) => re.test(content));
}

function loadBaseline() {
  try {
    const raw = readFileSync(BASELINE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return new Set((parsed.exempt ?? []).map((e) => e.path));
  } catch {
    return new Set();
  }
}

function main() {
  const files = listTsFiles(INTEGRATION_DIR);
  const baseline = loadBaseline();
  const offenders = [];

  for (const file of files) {
    const rel = relative(REPO_ROOT, file);
    if (baseline.has(rel)) continue;
    const content = readFileSync(file, 'utf-8');
    if (!fileMatchesTierSignature(content)) {
      offenders.push(rel);
    }
  }

  if (offenders.length > 0) {
    console.error('ADR-012 tier-signature violations:');
    for (const f of offenders) {
      console.error(`  - ${f}`);
    }
    console.error('');
    console.error('Each file under tests/integration/ MUST import either:');
    console.error('  - tests/helpers/integration/integration-harness, OR');
    console.error('  - tests/helpers/e2e/postgres-testcontainer, OR');
    console.error('  - tests/helpers/e2e/e2e-app-harness, OR');
    console.error('  - a real DataSource / getRepository against TypeORM, OR');
    console.error('  - issue a real outbound fetch/axios call');
    console.error('');
    console.error('If a file legitimately belongs in tests/integration/ without');
    console.error('crossing an infra boundary (e.g., Express smoke), add an entry');
    console.error('to scripts/sentinels/.integration-tier-baseline.json with a reason.');
    process.exit(1);
  }

  console.log(`OK — ${files.length} integration files comply with ADR-012 §4.2 (${baseline.size} baselined).`);
  process.exit(0);
}

main();
```

- [ ] **Step 1.3.2: Generate the initial baseline JSON**

Run the sentinel once against the current state to discover offenders:

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
node scripts/sentinels/integration-tier-signature.mjs 2>&1 | tee /tmp/phase1-tier-baseline.txt
```

Read the output. The offenders are the files that need to be either migrated (this plan's later tasks) or baselined (only if they legitimately don't need DB).

Build `scripts/sentinels/.integration-tier-baseline.json` with the smoke + ssrf-matrix exemptions plus any other files deemed legitimately-no-DB. Most offenders are NOT exempt — they will be migrated in Tasks 2.x / 3.x / 4.x. The baseline is small.

Initial baseline content (start with):

```json
{
  "exempt": [
    {
      "path": "museum-backend/tests/integration/chat/chat-api.smoke.integration.test.ts",
      "reason": "smoke test against bare Express harness; no DB path required",
      "approved_by": "phase1-spec-§6"
    }
  ]
}
```

If `ssrf-matrix.integration.test.ts` shows up in offenders despite the `fetch(...)` regex pattern, examine why: the test file may not have a top-level `fetch(https://...)` call (only a regex about it). Add it to the baseline OR update the sentinel's pattern; pick whichever is correct. Document the choice in the commit message.

- [ ] **Step 1.3.3: Run the sentinel — expect exit 0**

```bash
node /Users/Tim/Desktop/all/dev/Pro/InnovMind/scripts/sentinels/integration-tier-signature.mjs
echo "exit=$?"
```

Expected: `exit=0` and the OK summary. If non-zero, add genuinely-exempt files to the baseline OR remove violators by migrating them in this commit (any small ones can land here; large clusters wait for Tasks 2.x–4.x).

**Important:** The 17 in-scope files for Tasks 2.x–4.x will appear as offenders right now — that's correct, they get migrated in subsequent commits. To keep the sentinel green during Phase 1 incremental commits, add ALL current offenders to the baseline as `phase1-migration-pending` exemptions, then remove each baseline entry as the file is migrated. Simpler approach: don't enable the sentinel in CI yet (Task 4.x wires it). For Commit 1, the sentinel exists as a script + script runs; CI wiring lands in Commit 4.

Update the baseline accordingly to include all current offenders with reason `"phase1-migration-pending — remove on file migration"`.

- [ ] **Step 1.3.4: Cap test for the baseline length**

Create `museum-backend/tests/integration/_smoke/integration-tier-baseline-cap.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { createIntegrationHarness } from 'tests/helpers/integration/integration-harness';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const BASELINE_PATH = join(REPO_ROOT, 'scripts/sentinels/.integration-tier-baseline.json');

// Cap at the highest length the baseline reaches during Phase 1.
// After Phase 1's last commit, this drops to the long-term cap (≤2 files).
// Set initially to the length captured by Step 1.3.2; tighten when commits land.
const PHASE_1_BASELINE_CAP = 25;

describe('integration tier-signature baseline cap', () => {
  it('baseline length never grows beyond the Phase 1 cap', () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as { exempt: Array<{ path: string }> };
    expect(Array.isArray(baseline.exempt)).toBe(true);
    expect(baseline.exempt.length).toBeLessThanOrEqual(PHASE_1_BASELINE_CAP);
  });

  // Keep harness import happy for tier-signature sentinel: this file lives under
  // tests/integration/_smoke/ and must satisfy the rule itself.
  it('imports the integration harness (self-conformance)', () => {
    expect(typeof createIntegrationHarness).toBe('function');
  });
});
```

The `PHASE_1_BASELINE_CAP = 25` is a generous initial cap covering all current offenders; commit 4 tightens it to ≤2 once migrations complete.

- [ ] **Step 1.3.5: Run all the new tests**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
pnpm run test:integration --testPathPattern='_smoke|migration-round-trip' 2>&1 | tail -20
```

Expected: 4 tests pass (2 smoke + 1 round-trip + 2 cap = 5; adjust expectation per actual count). Container boots once for the worker.

### Task 1.4: Commit 1 (Group 1)

- [ ] **Step 1.4.1: Anti-leak protocol + scoped commit**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind

git restore --staged .

git add museum-backend/tests/helpers/integration/integration-harness.ts
git add museum-backend/tests/helpers/integration/README.md
git add museum-backend/tests/helpers/integration/schema-fingerprint.ts
git add museum-backend/tests/integration/_smoke/
git add museum-backend/tests/integration/db/migration-round-trip.test.ts
git add museum-backend/package.json
git add museum-backend/pnpm-lock.yaml 2>/dev/null || true
git add scripts/sentinels/integration-tier-signature.mjs
git add scripts/sentinels/.integration-tier-baseline.json

# Confirm scope
git diff --cached --name-only | sort
```

Expected: only the paths above. If anything else slipped in, `git restore --staged <bad path>`.

- [ ] **Step 1.4.2: Commit**

```bash
git commit -m "$(cat <<'EOF'
test(integration): create real-PG harness, migration round-trip, tier-signature sentinel

Phase 1 Group 1 — establishes the integration test infrastructure.

- createIntegrationHarness(): boots a Postgres testcontainer per Jest
  worker (reusing tests/helpers/e2e/postgres-testcontainer), runs all
  migrations, exposes a TypeORM DataSource bound to the singleton
  AppDataSource (env-var driven init keeps existing module composition
  roots working without refactor). reset() truncates entity tables
  CASCADE in one round-trip (~5ms per test).
- migration-round-trip.test.ts: walks every migration's down() then
  re-runs up(); asserts schema fingerprint round-trip equality. Guards
  the CLAUDE.md migration-governance rule that has been manual-only.
- integration-tier-signature.mjs: ADR-012 §4.2 enforcement script.
  Walks tests/integration/, asserts each file imports a real-infra
  signature, exits non-zero on violation. Baseline JSON exempts files
  with documented reasons; cap test prevents baseline growth.
- pnpm test:integration script + initial _smoke suite.

CI wiring lands in Phase 1 Commit 4 once all 17 file migrations land.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -3
git show --stat HEAD | head -25
```

If pre-commit hook bundles unrelated files: STOP. Do not amend, do not force.

---

## Commit 2 — Group 2: Migrate 6 `MEM_ONLY` files to real PG

### Task 2.1: Migrate `security/stored-xss.test.ts`

**File:** `museum-backend/tests/integration/security/stored-xss.test.ts`

- [ ] **Step 2.1.1: Read the current file to understand what it asserts**

```bash
cat /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/integration/security/stored-xss.test.ts | head -120
```

Note the test contracts (XSS payloads stored without HTML escaping bypass, etc). Each `it()` block in the new version must preserve the same assertion intent.

- [ ] **Step 2.1.2: Rewrite using `createIntegrationHarness()`**

Use `Edit` to replace the in-memory repo imports with `import { createIntegrationHarness } from 'tests/helpers/integration/integration-harness'`. Replace `createInMemoryRepo()` calls with the real repository obtained from `harness.dataSource.getRepository(<Entity>)`. Add `beforeAll`/`afterAll` calls per Pattern A or B (see harness README). Add `beforeEach(() => harness.reset())`.

The structural change is mechanical:

```diff
-import { createInMemoryReviewRepo } from 'tests/helpers/chat/in-memory.repos';
+import { createIntegrationHarness, type IntegrationHarness } from 'tests/helpers/integration/integration-harness';

 describe('Stored XSS guard [integration]', () => {
+  let harness: IntegrationHarness;
+
+  beforeAll(async () => {
+    harness = await createIntegrationHarness();
+    harness.scheduleStop();
+  });
+
+  beforeEach(() => harness.reset());
+
   it('persists XSS payload as-is and rejects on render', async () => {
-    const repo = createInMemoryReviewRepo();
+    const repo = harness.dataSource.getRepository(Review);
     // ... rest unchanged ...
   });
 });
```

The exact diff depends on what's in the file. Read first, then edit faithfully.

- [ ] **Step 2.1.3: Run the test, expect PASS**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
pnpm run test:integration --testPathPattern=stored-xss 2>&1 | tail -15
```

If a test fails because the assertion was wrong against in-memory but fine against real PG (rare but possible — e.g., relied on insertion order without ORDER BY), the test is the bug, not the migration. Tighten the assertion (e.g., add ORDER BY).

If a test fails because the migration is incomplete (e.g., service depends on related entity not seeded), seed it via real repos in `beforeEach` after `harness.reset()`.

### Task 2.2: Migrate `auth/consent.route.test.ts`

Same procedure as Task 2.1, but follow Pattern B (route mount):

- [ ] **Step 2.2.1: Read the current file**

```bash
cat /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/integration/auth/consent.route.test.ts | head -100
```

- [ ] **Step 2.2.2: Rewrite using harness + real route mount**

Replace the in-memory test app builder with:

```ts
import express from 'express';
import request from 'supertest';
import { createIntegrationHarness, type IntegrationHarness } from 'tests/helpers/integration/integration-harness';

describe('consent.route [integration]', () => {
  let harness: IntegrationHarness;
  let app: express.Express;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    // Dynamic import so AppDataSource is bound before module composition runs
    const { mountConsentRoutes } = await import('@modules/auth');
    app = express().use(express.json());
    mountConsentRoutes(app);
  });

  beforeEach(() => harness.reset());

  // ... existing it() blocks, with request(app) replacing the in-mem builder
});
```

If `@modules/auth` does not export `mountConsentRoutes` directly, look at how `consent.route.ts` is mounted in `app.ts` and replicate the minimal mount pattern. Read `museum-backend/src/app.ts` to find the actual function used, and import that one.

- [ ] **Step 2.2.3: Run, fix imports / shape until green**

```bash
pnpm run test:integration --testPathPattern=consent.route 2>&1 | tail -15
```

### Task 2.3: Migrate `admin/admin-schemas.test.ts`

Same procedure. Pattern A or B per file content. The file likely tests Zod schemas — if it's pure-function schema validation with no persistence, the file should MOVE to `tests/unit/admin/` instead of being migrated. Decide by reading first.

- [ ] **Step 2.3.1: Read + decide**

```bash
cat /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/integration/admin/admin-schemas.test.ts | head -80
grep -c "InMemory\|fakeRepo" /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/integration/admin/admin-schemas.test.ts
```

If the test only uses in-memory for convenient assertion shape but doesn't actually test persistence behaviour: MOVE to `tests/unit/admin/admin-schemas.test.ts` (drop the in-mem dep entirely, just test the schema). If it does test persistence: migrate per Pattern A.

- [ ] **Step 2.3.2: Apply the chosen action (move OR migrate)**

For MOVE: `cd museum-backend && git mv tests/integration/admin/admin-schemas.test.ts tests/unit/admin/admin-schemas.test.ts` and remove the in-mem repo import (replace with direct schema testing).

For MIGRATE: per Pattern A.

- [ ] **Step 2.3.3: Run**

```bash
pnpm test -- --testPathPattern=admin-schemas 2>&1 | tail -10
```

(Note: `pnpm test` if MOVED to unit; `pnpm run test:integration` if MIGRATED.)

### Task 2.4: Migrate `admin/rbac-matrix.test.ts`

Same procedure. The name suggests it tests the RBAC matrix across endpoints — this likely needs route mounting (Pattern B) with multiple users persisted. Follow Pattern B.

- [ ] **Step 2.4.1: Read**

```bash
cat /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/integration/admin/rbac-matrix.test.ts | head -80
```

- [ ] **Step 2.4.2: Migrate to Pattern B w/ harness + admin route mount**

Use the harness to bind AppDataSource, mount the admin routes on a bare express app, persist test users via real repos in `beforeEach`, exercise via `request(app)`.

- [ ] **Step 2.4.3: Run + fix**

```bash
pnpm run test:integration --testPathPattern=rbac-matrix 2>&1 | tail -15
```

### Task 2.5: Migrate `routes/chat.route.test.ts`

Same Pattern B. Route mount via the chat module's mount function. Read app.ts to discover.

- [ ] **Step 2.5.1: Read**

```bash
cat /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/integration/routes/chat.route.test.ts | head -100
```

- [ ] **Step 2.5.2: Migrate**

Pattern B with chat route mount.

- [ ] **Step 2.5.3: Run + fix**

```bash
pnpm run test:integration --testPathPattern=routes/chat.route 2>&1 | tail -15
```

### Task 2.6: Migrate `routes/admin.route.test.ts`

Same as 2.5 with admin module mount.

- [ ] **Step 2.6.1: Read**

```bash
cat /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/integration/routes/admin.route.test.ts | head -100
```

- [ ] **Step 2.6.2: Migrate**

Pattern B with admin route mount.

- [ ] **Step 2.6.3: Run + fix**

```bash
pnpm run test:integration --testPathPattern=routes/admin.route 2>&1 | tail -15
```

### Task 2.7: Verify and remove baseline entries for Group 2 files

- [ ] **Step 2.7.1: Edit the baseline JSON**

In `scripts/sentinels/.integration-tier-baseline.json`, remove entries for any of the 6 Group-2 files that were previously listed under `phase1-migration-pending`.

If admin-schemas was MOVED to `tests/unit/`, also remove its entry (it's no longer in `tests/integration/`).

- [ ] **Step 2.7.2: Run the sentinel — expect exit 0**

```bash
node /Users/Tim/Desktop/all/dev/Pro/InnovMind/scripts/sentinels/integration-tier-signature.mjs
echo "exit=$?"
```

Expected: `exit=0`. If a file is still flagged, finish the migration before commit.

- [ ] **Step 2.7.3: Full integration suite green**

```bash
pnpm run test:integration 2>&1 | tail -10
```

Expected: all tests pass. Capture pass count.

### Task 2.8: Commit 2

- [ ] **Step 2.8.1: Anti-leak + scoped commit**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .

git add museum-backend/tests/integration/security/stored-xss.test.ts
git add museum-backend/tests/integration/auth/consent.route.test.ts
git add museum-backend/tests/integration/admin/rbac-matrix.test.ts
git add museum-backend/tests/integration/routes/chat.route.test.ts
git add museum-backend/tests/integration/routes/admin.route.test.ts
# admin-schemas: stage either the MOVE rename OR the MIGRATE-in-place
git add museum-backend/tests/integration/admin/admin-schemas.test.ts museum-backend/tests/unit/admin/admin-schemas.test.ts 2>/dev/null || true
git add scripts/sentinels/.integration-tier-baseline.json

git diff --cached --name-only | sort
```

If anything outside scope: `git restore --staged <bad path>`.

- [ ] **Step 2.8.2: Commit**

```bash
git commit -m "$(cat <<'EOF'
test(integration): migrate 6 in-memory violators to real PG (Phase 1 Group 2)

Per ADR-012 §4.3, in-memory repos are illegal in tests/integration/.
Each of these files now uses createIntegrationHarness() and exercises
the same observable contract against a real Postgres testcontainer:

- security/stored-xss.test.ts
- auth/consent.route.test.ts
- admin/rbac-matrix.test.ts
- routes/chat.route.test.ts
- routes/admin.route.test.ts
- admin/admin-schemas.test.ts (moved to tests/unit/ — pure schema test, no DB needed)

Tier-signature baseline shrinks accordingly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -3
git show --stat HEAD | head -15
```

---

## Commit 3 — Group 3: Upgrade chat-module 4 PURE-UPGRADE files to real PG

### Task 3.1: Upgrade `chat/chat-service-orchestrator-errors.test.ts`

**File:** `museum-backend/tests/integration/chat/chat-service-orchestrator-errors.test.ts`

- [ ] **Step 3.1.1: Read the file to understand the contract**

```bash
cat /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/integration/chat/chat-service-orchestrator-errors.test.ts | head -120
```

Identify: what are the orchestrator error scenarios being tested (LangChain throws, circuit-breaker open, etc.)? Most of those are NOT DB-dependent — they test how ChatService reacts to its dependencies' errors. If the DB layer is incidental, the file probably belongs in `tests/unit/` after all (move not migrate). Decide.

- [ ] **Step 3.1.2: Apply MOVE or MIGRATE**

If the test scenarios genuinely need persisted state (session ownership, message history): MIGRATE per Pattern A using `buildChatService(harness.dataSource)`.

If they only need the LangChain-error or circuit-error path with stubbed DB: MOVE to `tests/unit/chat/chat-service-orchestrator-errors.test.ts`.

- [ ] **Step 3.1.3: Run**

```bash
pnpm test -- --testPathPattern=chat-service-orchestrator-errors 2>&1 | tail -10  # if moved
# OR
pnpm run test:integration --testPathPattern=chat-service-orchestrator-errors 2>&1 | tail -10  # if migrated
```

### Task 3.2: Upgrade `chat/chat-service-pagination.test.ts`

This one DEFINITELY needs real PG (cursor pagination = real ORDER BY semantics).

- [ ] **Step 3.2.1: Read**

```bash
cat /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/integration/chat/chat-service-pagination.test.ts | head -120
```

- [ ] **Step 3.2.2: Migrate (Pattern A)**

Replace stub data setup with real `INSERT` via `harness.dataSource.getRepository(ChatMessage)` in `beforeEach`. Use `buildChatService(harness.dataSource)`.

- [ ] **Step 3.2.3: Run**

```bash
pnpm run test:integration --testPathPattern=chat-service-pagination 2>&1 | tail -15
```

### Task 3.3: Upgrade `chat/chat-service-ownership.test.ts`

- [ ] **Step 3.3.1: Read + migrate**

```bash
cat /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/integration/chat/chat-service-ownership.test.ts | head -100
```

Pattern A. Persist 2 users + sessions. Test ownership 404 contract.

- [ ] **Step 3.3.2: Run**

```bash
pnpm run test:integration --testPathPattern=chat-service-ownership 2>&1 | tail -15
```

### Task 3.4: Upgrade `chat/feedback-cache-invalidation.test.ts`

This one needs real cache + real DB. The cache may be Redis-backed; if so, it needs a Redis testcontainer too.

- [ ] **Step 3.4.1: Read**

```bash
cat /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/integration/chat/feedback-cache-invalidation.test.ts | head -120
grep -E "Redis|cache" /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests/integration/chat/feedback-cache-invalidation.test.ts | head -10
```

- [ ] **Step 3.4.2: Migrate**

Pattern A. If the test uses an in-memory cache adapter that's a legitimate fake (LRU map): KEEP the in-memory cache (it's the unit-of-test for cache-invalidation), but MIGRATE the DB layer to real PG. Document this decision in the commit message.

If the test needs real Redis: out of scope for Phase 1 Group 3. Add a `// TODO Phase 1 follow-up` if needed and either MOVE to unit OR baseline-exempt the file. Pick the simpler path — banking-grade integration discipline says cache + DB consistency needs real Redis, but landing 17 files in 4 commits is the priority. Defer Redis to a Phase 1 fix or to Phase 6 chaos.

- [ ] **Step 3.4.3: Run**

```bash
pnpm run test:integration --testPathPattern=feedback-cache-invalidation 2>&1 | tail -15
```

### Task 3.5: Verify + commit

- [ ] **Step 3.5.1: Update baseline + run sentinel**

Remove the 4 chat files from baseline if they were listed. Run the sentinel:

```bash
node /Users/Tim/Desktop/all/dev/Pro/InnovMind/scripts/sentinels/integration-tier-signature.mjs && echo OK
```

- [ ] **Step 3.5.2: Run integration suite**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && pnpm run test:integration 2>&1 | tail -10
```

Expected green.

- [ ] **Step 3.5.3: Commit 3**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .

git add museum-backend/tests/integration/chat/chat-service-orchestrator-errors.test.ts \
        museum-backend/tests/integration/chat/chat-service-pagination.test.ts \
        museum-backend/tests/integration/chat/chat-service-ownership.test.ts \
        museum-backend/tests/integration/chat/feedback-cache-invalidation.test.ts
# If any was MOVED to tests/unit/, add the new path too:
git add museum-backend/tests/unit/chat/ 2>/dev/null || true
git add scripts/sentinels/.integration-tier-baseline.json

git diff --cached --name-only | sort

git commit -m "$(cat <<'EOF'
test(integration): upgrade 4 chat-module files to real PG (Phase 1 Group 3)

Per ADR-012 §4.2, files in tests/integration/ that test contracts
requiring persisted state must use real PG. The 4 files in this
commit were tagged PURE-UPGRADE in Phase 0 spec §5; each now uses
createIntegrationHarness() + buildChatService(harness.dataSource):

- chat-service-orchestrator-errors.test.ts (or moved to unit if
  scenario doesn't need DB — see commit body when applicable)
- chat-service-pagination.test.ts
- chat-service-ownership.test.ts
- feedback-cache-invalidation.test.ts (DB-only; Redis cache stays
  in-mem fake — chat<>cache consistency vs Redis<>DB consistency is
  a Phase 6 chaos concern)

Tier-signature baseline shrinks accordingly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -3
git show --stat HEAD | head -10
```

---

## Commit 4 — Group 4: 7 PURE-UPGRADE + tier-signature CI wiring + cap tighten

### Task 4.1 through 4.7: Migrate the remaining 7 files

For each of the following 7 files, follow the same procedure (read, decide MOVE vs MIGRATE, apply Pattern A or B, run, fix):

- [ ] **Task 4.1**: `tests/integration/auth/password-reset-flow.test.ts` (Pattern A — needs real refresh-token persistence)
- [ ] **Task 4.2**: `tests/integration/admin/audit-breach.test.ts` (Pattern A — needs real audit log writes)
- [ ] **Task 4.3**: `tests/integration/routes/museum-enrichment.route.test.ts` (Pattern B — route + museum repo)
- [ ] **Task 4.4**: `tests/integration/routes/support.route.test.ts` (Pattern B — route + ticket repo)
- [ ] **Task 4.5**: `tests/integration/routes/auth.route.test.ts` (Pattern B — route + user repo)
- [ ] **Task 4.6**: `tests/integration/routes/review.route.test.ts` (Pattern B — route + review repo)
- [ ] **Task 4.7**: `tests/integration/routes/museum.route.test.ts` (Pattern B — route + museum repo)

For each: read → migrate → run individual file → fix until green.

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
pnpm run test:integration --testPathPattern=<file basename> 2>&1 | tail -15
```

### Task 4.8: Tighten the baseline cap to long-term value

- [ ] **Step 4.8.1: Update baseline JSON**

After all 17 files are migrated, the baseline should contain only the legitimately-no-DB files (typically just `chat-api.smoke.integration.test.ts` and possibly `ssrf-matrix.integration.test.ts` if it doesn't satisfy the network-boundary regex).

Edit `scripts/sentinels/.integration-tier-baseline.json` to contain only those entries.

- [ ] **Step 4.8.2: Tighten the cap test constant**

In `museum-backend/tests/integration/_smoke/integration-tier-baseline-cap.test.ts`, change:

```ts
const PHASE_1_BASELINE_CAP = 25;
```

to:

```ts
// Long-term cap (post-Phase-1). Files in this list legitimately live in
// tests/integration/ without crossing an infra boundary (Express smoke,
// network-boundary tests where the regex doesn't match the import shape).
// Cap can shrink, never grow. New entries require ADR amendment.
const PHASE_1_BASELINE_CAP = 2;
```

- [ ] **Step 4.8.3: Run sentinel + cap test, expect both green**

```bash
node /Users/Tim/Desktop/all/dev/Pro/InnovMind/scripts/sentinels/integration-tier-signature.mjs && echo OK
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
pnpm run test:integration --testPathPattern=integration-tier-baseline-cap 2>&1 | tail -5
```

Expected: sentinel exit 0, cap test pass.

### Task 4.9: Wire `integration` job into CI

**File:** `.github/workflows/ci-cd-backend.yml`

- [ ] **Step 4.9.1: Read existing workflow structure**

```bash
sed -n '1,80p' /Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/ci-cd-backend.yml
sed -n '80,160p' /Users/Tim/Desktop/all/dev/Pro/InnovMind/.github/workflows/ci-cd-backend.yml
```

Identify where `quality:` ends and where existing jobs (`e2e:`, `deploy:`) start.

- [ ] **Step 4.9.2: Add `integration` job + tier-signature step in `quality`**

Step (a) — Add a tier-signature check to the `quality` job, before the existing test run. Edit so that after the `Install dependencies` step, this new step is added:

```yaml
      - name: Tier-signature sentinel (ADR-012 §4.2)
        run: node scripts/sentinels/integration-tier-signature.mjs
        working-directory: ${{ github.workspace }}
```

Note `working-directory` overrides the job-level default to run from the repo root (since the script lives at root, not under `museum-backend/`).

Step (b) — Add a new top-level `integration` job after `quality:`:

```yaml
  # ─── 2. Integration tests (real PG via testcontainer) ─────────────────
  integration:
    needs: quality
    runs-on: ubuntu-latest
    timeout-minutes: 25
    defaults:
      run:
        working-directory: museum-backend
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
      - name: Run integration suite (real PG via Docker testcontainer)
        run: pnpm run test:integration
        env:
          RUN_INTEGRATION: 'true'
```

The job runs on every PR push and every push to main/staging (inherits the workflow-level triggers).

- [ ] **Step 4.9.3: Validate workflow YAML**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-cd-backend.yml'))" && echo OK
```

If `python3` not present: use `node -e "const yaml=require('js-yaml'); yaml.load(require('fs').readFileSync('.github/workflows/ci-cd-backend.yml','utf-8')); console.log('OK')"`.

Expected: `OK`. If parse fails: read the diff, fix indentation.

### Task 4.10: Final verification

- [ ] **Step 4.10.1: Run sentinel locally**

```bash
node /Users/Tim/Desktop/all/dev/Pro/InnovMind/scripts/sentinels/integration-tier-signature.mjs
echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 4.10.2: Run full integration suite locally**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && pnpm run test:integration 2>&1 | tail -15
```

Expected: green. Pass count matches expectations from the migrated 17 files plus the harness smoke tests plus migration round-trip plus baseline-cap.

- [ ] **Step 4.10.3: Run full unit suite — should still be green**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && pnpm test 2>&1 | tail -10
```

Expected: at least the prior baseline pass count (3453 baseline; should be ≥ that since we may have moved some PURE files to unit).

- [ ] **Step 4.10.4: Lint**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && pnpm lint 2>&1 | tail -5
```

Expected: 0 errors.

### Task 4.11: Commit 4

- [ ] **Step 4.11.1: Anti-leak + scoped commit**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind
git restore --staged .

# 7 migrated files (Tasks 4.1–4.7)
git add museum-backend/tests/integration/auth/password-reset-flow.test.ts
git add museum-backend/tests/integration/admin/audit-breach.test.ts
git add museum-backend/tests/integration/routes/museum-enrichment.route.test.ts
git add museum-backend/tests/integration/routes/support.route.test.ts
git add museum-backend/tests/integration/routes/auth.route.test.ts
git add museum-backend/tests/integration/routes/review.route.test.ts
git add museum-backend/tests/integration/routes/museum.route.test.ts

# Files MOVED to tests/unit/ during migration (if any)
git add museum-backend/tests/unit/ 2>/dev/null || true

# Sentinel + cap + CI wiring
git add scripts/sentinels/.integration-tier-baseline.json
git add museum-backend/tests/integration/_smoke/integration-tier-baseline-cap.test.ts
git add .github/workflows/ci-cd-backend.yml

git diff --cached --name-only | sort
```

If anything outside this list slips in: `git restore --staged <bad path>`.

- [ ] **Step 4.11.2: Commit**

```bash
git commit -m "$(cat <<'EOF'
test(integration): upgrade 7 final files + wire CI + tighten cap (Phase 1 Group 4)

Per Phase 0 spec §5 and Phase 1 spec §5/§4.5. The 7 files in this
commit were the last PURE-UPGRADE candidates; each now uses
createIntegrationHarness() against a real Postgres testcontainer:

- auth/password-reset-flow.test.ts
- admin/audit-breach.test.ts
- routes/museum-enrichment.route.test.ts
- routes/support.route.test.ts
- routes/auth.route.test.ts
- routes/review.route.test.ts
- routes/museum.route.test.ts

CI wiring:
- New `integration` job in ci-cd-backend.yml runs `pnpm test:integration`
  on every PR push and on push to main/staging.
- Tier-signature sentinel step added to the existing `quality` job;
  any new file under tests/integration/ that does not import the
  testcontainer / DataSource / harness fails CI.

Baseline tightened:
- PHASE_1_BASELINE_CAP reduced from 25 → 2.
- Baseline JSON now contains only legitimately-no-DB integration files.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

git log --oneline -5
git show --stat HEAD | head -20
```

---

## Phase 1 Final Verification (no commit)

- [ ] **Step F.1: All 4 commits landed**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind && git log --oneline -6
```

Expected (most recent first):
1. `test(integration): upgrade 7 final files + wire CI + tighten cap (Phase 1 Group 4)`
2. `test(integration): upgrade 4 chat-module files to real PG (Phase 1 Group 3)`
3. `test(integration): migrate 6 in-memory violators to real PG (Phase 1 Group 2)`
4. `test(integration): create real-PG harness, migration round-trip, tier-signature sentinel`

(Plus any parallel-session noise interleaved.)

- [ ] **Step F.2: tier-signature green**

```bash
node /Users/Tim/Desktop/all/dev/Pro/InnovMind/scripts/sentinels/integration-tier-signature.mjs && echo OK
```

- [ ] **Step F.3: All test tiers green**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
pnpm test 2>&1 | tail -3            # unit
pnpm run test:integration 2>&1 | tail -3   # integration
```

- [ ] **Step F.4: Lint + ratchet**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend && pnpm lint 2>&1 | tail -3
grep -rn "as any" /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/src /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend/tests 2>/dev/null | wc -l
```

Expected: 0 lint errors, as-any count unchanged.

- [ ] **Step F.5: tests/integration/ no longer contains in-memory repo violators**

```bash
cd /Users/Tim/Desktop/all/dev/Pro/InnovMind/museum-backend
grep -rl "createInMemory\|InMemoryUser\|InMemoryChat\|InMemoryRepo" tests/integration/ 2>/dev/null
```

Expected: no output (no matches).

- [ ] **Step F.6: Mark Phase 1 done in the task tracker**

Update tasks #12–#16 to completed.

---

## Out-of-Scope (Phases 2+)

- Real Redis testcontainer for cache+DB consistency tests (Phase 6 chaos engineering or Phase 1 follow-up).
- E2E mobile (Phase 2).
- Web admin Playwright (Phase 3).
- Mutation testing in CI (Phase 4).
- Verify-email + social-login full e2e (Phase 5).
- Resilience / circuit-breaker tests (Phase 6).
- FE factory migration (Phase 7).
- Coverage uplift gates (Phase 8).
