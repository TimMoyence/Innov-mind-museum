# Phase 1 — Real-PG Integration (Design Spec)

- **Status**: Proposed (2026-05-01)
- **Owner**: QA/SDET
- **Scope**: museum-backend (BE-only)
- **Pre-req for**: Phases 2–8 of the banking-grade test transformation
- **Estimated effort**: 1–2 working weeks
- **Spec lineage**: builds on Phase 0 ADR-012 + `docs/superpowers/specs/2026-04-30-phase0-test-truth-foundations-design.md`

## 1. Problem Statement

Phase 0 fixed the taxonomy. Phase 1 makes `tests/integration/` actually mean what ADR-012 says it means: **every file under `tests/integration/` crosses at least one infrastructure boundary**. Today, after Phase 0, the directory still contains:

| Category | Count | What's wrong |
|---|---|---|
| Real-PG (legitimate integration) | 2 | `idor-matrix.test.ts` + `db-resilience.test.ts` ✓ — already correct |
| **In-memory only (`MEM_ONLY`)** | **6** | Use `createInMemoryRepo` fakes — currently violate ADR-012 §4.3 (in-mem repos legal in `tests/unit/` only) |
| **Pure-function (`PURE-UPGRADE`)** | **11** | Tagged in Phase 0 spec §5 as "needs real persistence to be meaningful" — currently exercise neither real DB nor in-mem repo, but the contract under test (e.g., real ownership / pagination / RBAC over persisted state) requires real DB to be honest |
| Pure-function (legitimately integration without DB) | ~5 | Smoke tests that hit Express harness; no DB path. Stay as-is. |

That gives Phase 1 a concrete migration target: **17 files** to upgrade to real Postgres via testcontainer.

Beyond migrations, Phase 1 also closes two gaps the Phase 0 spec explicitly deferred:

1. **Migration round-trip test** — every TypeORM migration must be `up → down → up` reversible. Currently nothing in CI verifies this. CLAUDE.md §Migration Governance even prescribes a manual ritual but CI doesn't run it.
2. **Tier-signature CI guard** — ADR-012 §4.2 defines a mechanically-checkable rule for when a file belongs in `tests/integration/`. Phase 0 §10 listed it as deferred. Phase 1 lands it as a sentinel script gated by CI.

Finally, Phase 1 wires the real-PG integration suite into PR CI on every push (not just nightly + dispatch), so infrastructure regressions are caught before merge.

## 2. Goals

1. Build a new lightweight **`createIntegrationHarness()`** — Postgres testcontainer + DataSource + migrations, no Express, no LangChain, no rate-limiter wiring. Tests interact with services / use-cases / repositories directly (the proper boundary for an integration test per ADR-012).
2. Migrate the **6 `MEM_ONLY`** files off in-memory fakes onto real PG (one commit per logical cluster, not one giant commit).
3. Upgrade the **11 `PURE-UPGRADE`** files to real PG, exercising the contracts they were originally written to assert.
4. Add `tests/integration/db/migration-round-trip.test.ts` — runs every migration up, down, and up again on a fresh container, asserts schema fingerprint converges.
5. Add a sentinel script `scripts/sentinels/integration-tier-signature.mjs` that walks `tests/integration/`, applies ADR-012 §4.2 rule, and fails CI when a file there does not import the testcontainer / DataSource (the mechanical rule).
6. Add `pnpm test:integration` script + wire it into `ci-cd-backend.yml` quality-gate job on PR push (not just nightly).
7. **Container strategy: shared per Jest worker, TRUNCATE between tests.** One container booted per Jest worker; tests inside that worker share it; TRUNCATE-cascade clears domain tables between every test. Migrations re-run only if a per-worker schema fingerprint mismatch is detected.

## 3. Non-Goals

- **Migrating tests under `tests/e2e/`** — those already use real PG via `createE2EHarness()` and are fine. Phase 1 does not touch them.
- **Replacing `createE2EHarness()`** — the e2e harness keeps its current full-stack semantics. Phase 1 only adds a parallel lighter harness.
- **FE / web test changes** — Phase 1 is BE-only. FE factory migration stays Phase 7.
- **Adding new product test cases** — Phase 1 only migrates existing tests, does not expand coverage.
- **Mutation testing** — Phase 4.
- **Coverage threshold uplift** — Phase 8.

## 4. Architecture

### 4.1 New harness: `createIntegrationHarness()`

**Location**: `museum-backend/tests/helpers/integration/integration-harness.ts`

**Surface (TypeScript signature):**

```ts
export interface IntegrationHarness {
  /** TypeORM DataSource — wired to the per-worker testcontainer. */
  dataSource: DataSource;

  /**
   * TRUNCATE every table touched by domain entities (CASCADE) — fast reset
   * between tests. Schema is preserved; only row data is wiped.
   */
  reset: () => Promise<void>;

  /**
   * Stop the container at suite end. Idempotent.
   * Called automatically via `afterAll` if `scheduleStop()` was invoked.
   */
  stop: () => Promise<void>;

  /** Schedule stop() in afterAll for the calling Jest suite. */
  scheduleStop: () => void;
}

/**
 * Create (or reuse) a Postgres testcontainer for the current Jest worker,
 * run migrations once, and return a harness with reset / stop / DataSource.
 *
 * Reuses the per-worker container if `JEST_WORKER_ID` matches a previously
 * created harness's worker; otherwise boots fresh.
 */
export const createIntegrationHarness: () => Promise<IntegrationHarness>;
```

**Behaviour:**

- First call per Jest worker: boots a Postgres container via `startPostgresTestContainer()` (the existing helper), sets relevant env vars (NODE_ENV=test, DB_*), initialises a TypeORM `DataSource`, runs all migrations.
- Subsequent calls within the same worker: returns a cached harness sharing the same `DataSource`. The container has been migrated; `reset()` is the per-test cleanup primitive.
- `reset()`: executes a single SQL statement that truncates every TypeORM-tracked table with `RESTART IDENTITY CASCADE`. Implemented by reading the entity metadata from `DataSource.entityMetadatas` and emitting `TRUNCATE TABLE "t1", "t2", ... RESTART IDENTITY CASCADE`. Single round-trip, fast (~5ms).
- `stop()`: stops the container. Idempotent.
- `scheduleStop()`: wires `afterAll(() => stop())` for the test suite.

**No Express boot.** No middleware chain. No rate-limiter init. Tests call services directly:

```ts
import { createIntegrationHarness } from 'tests/helpers/integration/integration-harness';
import { ChatService } from '@modules/chat/useCase/chat.service';

describe('chat-service-pagination [integration, real PG]', () => {
  let harness: IntegrationHarness;
  let service: ChatService;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    service = buildChatService(harness.dataSource); // existing module composition
  });

  beforeEach(() => harness.reset());

  it('paginates messages correctly across cursor boundaries', async () => {
    // arrange: persist N messages via real repository
    // act: call service.getMessages(...)
    // assert: cursor + content shape
  });
});
```

### 4.2 Container strategy detail (Q2: option ii)

**One container per Jest worker, shared across tests in that worker.**

Jest's default `maxWorkers = 50%` means ~4 workers on a typical CI runner. Each worker boots one container at the first `createIntegrationHarness()` call (~5–8s amortised once); subsequent suites in the same worker reuse it.

Per-test reset is **TRUNCATE … CASCADE** on every entity table:

```ts
async reset() {
  const tables = this.dataSource.entityMetadatas
    .filter((m) => m.tableType === 'regular')
    .map((m) => `"${m.tableName}"`);
  if (tables.length === 0) return;
  await this.dataSource.query(
    `TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`,
  );
}
```

Single statement, ~5ms latency. Identity columns reset (so first inserted row in a fresh test always gets id=1, deterministic).

**Why not transaction-rollback per test?** Service layer uses TypeORM transactions internally (e.g., `chat.service.ts` wraps multi-step writes). Wrapping the test itself in a transaction would mean nested transactions which break TypeORM savepoint semantics. TRUNCATE is simpler, correct, and only ~5ms slower per test.

**Why not per-file containers?** Container boot is the dominant cost (~5s). At 17 files × 5s = 85s of pure container-boot overhead per CI run. Per-worker shares the cost across all suites in the worker, dropping it to ~20s total.

### 4.3 Migration round-trip test

**Location**: `museum-backend/tests/integration/db/migration-round-trip.test.ts`

```ts
describe('migration round-trip [integration, real PG]', () => {
  jest.setTimeout(180_000);

  it('every migration applies up → down → up cleanly with stable schema', async () => {
    const harness = await createIntegrationHarness();
    harness.scheduleStop();

    // 1. Capture schema after `up` (migrations already ran in createIntegrationHarness).
    const schemaA = await dumpSchemaFingerprint(harness.dataSource);

    // 2. Roll every migration back, one at a time, asserting each `down()` succeeds.
    const ds = harness.dataSource;
    const migrations = ds.migrations.slice().reverse();
    for (const _migration of migrations) {
      await ds.undoLastMigration({ transaction: 'each' });
    }

    // 3. Schema after full rollback should equal initial empty state.
    const schemaEmpty = await dumpSchemaFingerprint(ds);
    expect(schemaEmpty).toEqual(EMPTY_SCHEMA_FINGERPRINT);

    // 4. Re-run all migrations.
    await ds.runMigrations({ transaction: 'each' });
    const schemaB = await dumpSchemaFingerprint(ds);

    // 5. Round-trip equality.
    expect(schemaB).toEqual(schemaA);
  });
});
```

`dumpSchemaFingerprint(ds)` is a small helper (≤30 lines) that queries `information_schema.tables`, `columns`, `table_constraints`, and `indexes` and returns a normalised JSON object suitable for deep equality.

This single test guards the most consequential CLAUDE.md migration governance rule: "every migration must be reversible". Currently 44 migrations exist; the test runs all 44 down + up. Expected runtime: ~30s on first run (dominated by SQL round-trips, not container boot since worker is shared).

### 4.4 Tier-signature CI guard

**Location**: `scripts/sentinels/integration-tier-signature.mjs`

Walks `museum-backend/tests/integration/`, reads each `*.test.ts`, applies the ADR-012 §4.2 mechanical rule:

> A file lives in `tests/integration/` **iff** it satisfies at least one of: (a) imports a TypeORM `DataSource` / `getRepository(...)` against a real testcontainer, (b) imports `tests/helpers/e2e/postgres-testcontainer.ts` / sibling helpers, (c) issues a real outbound network request (`fetch` / `axios` / `got` / `node:http(s)`) against a non-stub URL.

Implementation: regex-based (text scan, not AST). Matches:

```js
const REAL_INTEGRATION_PATTERNS = [
  /from ['"]tests\/helpers\/(e2e|integration)\/(postgres-testcontainer|integration-harness)['"]/,
  /from ['"]tests\/helpers\/e2e\/e2e-app-harness['"]/,
  /\bDataSource\b.*from ['"]typeorm['"]/,
  /\bgetRepository\s*\(/,
  /\bfetch\s*\(\s*['"`]https?:/,    // outbound real fetch
];

function fileMatchesTierSignature(content) {
  return REAL_INTEGRATION_PATTERNS.some((re) => re.test(content));
}
```

Run: `node scripts/sentinels/integration-tier-signature.mjs`. Exits non-zero with a list of offending files. Wired into `ci-cd-backend.yml` quality-gate as a step.

**Grandfathering**: a `scripts/sentinels/.integration-tier-baseline.json` lists files explicitly exempted (e.g., the ~5 legitimately-no-DB integration smoke tests like `chat-api.smoke.integration.test.ts`). Phase 1 commit lists these explicitly with a one-line justification per entry. Like the ESLint plugin baseline, length can only shrink (cap test enforces).

### 4.5 PR CI wiring (Q3: option a)

In `.github/workflows/ci-cd-backend.yml`, add a new job after `quality`:

```yaml
integration:
  needs: quality
  runs-on: ubuntu-latest
  timeout-minutes: 20
  defaults:
    run:
      working-directory: museum-backend
  services:
    docker:
      image: docker:dind
  steps:
    - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
    - uses: pnpm/action-setup@fc06bc1257f339d1d5d8b3a19a8cae5388b55320
      with:
        version: 10
    - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
      with:
        node-version: '22'
        cache: 'pnpm'
        cache-dependency-path: museum-backend/pnpm-lock.yaml
    - run: pnpm install --frozen-lockfile
    - run: pnpm run test:integration
```

`pnpm test:integration` script (added to `museum-backend/package.json`):

```json
"test:integration": "RUN_INTEGRATION=true jest --watchman=false --testPathPattern=tests/integration/ --forceExit"
```

The `RUN_INTEGRATION=true` gate exists for the same reason as `RUN_E2E=true`: local dev runs `pnpm test` (= unit tests only) by default for fast feedback. Integration suite runs explicitly.

**Why a separate job, not a step in `quality`?** Quality job parallelises 4 short steps; adding ~60s integration runtime there blocks the rest. Separate job runs concurrently with `e2e` (already a separate job), keeping total PR time bounded by the longer of the two.

### 4.6 What the migrated tests look like

Two patterns the 17 files fall into:

**Pattern A — Service-level integration** (chat-service-*, password-reset-flow, audit-breach):

```ts
import { createIntegrationHarness } from 'tests/helpers/integration/integration-harness';
import { buildChatService } from '@modules/chat';

describe('chat-service-ownership [integration]', () => {
  let harness: IntegrationHarness;
  let chatService: ChatService;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    chatService = buildChatService({ dataSource: harness.dataSource });
  });

  beforeEach(() => harness.reset());

  it('user A cannot delete user B session', async () => {
    // arrange: persist users + sessions via real repos
    // act: chatService.deleteSession(sessionId, userA.id)
    // assert: throws AppError with 404 (not 403, per session-access.ts)
  });
});
```

**Pattern B — Route-level integration** (auth.route, museum.route, support.route, review.route, admin.route, chat.route, museum-enrichment.route, consent.route):

These previously used in-memory Express harnesses. Migrate to a thin wrapper that mounts the real Express router on top of the integration harness's DataSource:

```ts
import { createIntegrationHarness } from 'tests/helpers/integration/integration-harness';
import { mountAuthRoutes } from '@modules/auth';
import express from 'express';
import request from 'supertest';

describe('auth.route [integration]', () => {
  let harness: IntegrationHarness;
  let app: express.Express;

  beforeAll(async () => {
    harness = await createIntegrationHarness();
    harness.scheduleStop();
    app = express().use(express.json());
    mountAuthRoutes(app, { dataSource: harness.dataSource });
  });

  beforeEach(() => harness.reset());

  it('POST /api/auth/register persists user and returns 201', async () => {
    const res = await request(app).post('/api/auth/register').send({ ... });
    expect(res.status).toBe(201);
    // verify persistence by querying the real repo
  });
});
```

**This is NOT the e2e harness.** It's a bare Express app with only the route(s) under test, wired to the real DataSource. No Sentry, no rate-limiter, no Swagger. Tests target HTTP-then-DB contracts; the e2e harness target HTTP-then-DB-then-cache-then-LangChain contracts.

## 5. Per-File Migration Plan

The 17 files cluster into 4 commit groups (sequenced to land independently):

### Group 1 — Harness + migration round-trip (1 commit)
- New: `museum-backend/tests/helpers/integration/integration-harness.ts`
- New: `museum-backend/tests/integration/db/migration-round-trip.test.ts`
- New: `museum-backend/package.json` `test:integration` script
- New: `scripts/sentinels/integration-tier-signature.mjs` + `.integration-tier-baseline.json`
- New: cap test for the tier-signature baseline

### Group 2 — `MEM_ONLY → real PG` (1 commit)
The 6 in-memory violators:
1. `tests/integration/security/stored-xss.test.ts`
2. `tests/integration/auth/consent.route.test.ts`
3. `tests/integration/admin/admin-schemas.test.ts`
4. `tests/integration/admin/rbac-matrix.test.ts`
5. `tests/integration/routes/chat.route.test.ts`
6. `tests/integration/routes/admin.route.test.ts`

Pattern A or B per file. Migrate, delete the in-memory repo imports, verify each test still asserts the same contract.

### Group 3 — `PURE-UPGRADE` chat module (1 commit)
1. `tests/integration/chat/chat-service-orchestrator-errors.test.ts`
2. `tests/integration/chat/chat-service-pagination.test.ts`
3. `tests/integration/chat/chat-service-ownership.test.ts`
4. `tests/integration/chat/feedback-cache-invalidation.test.ts`

### Group 4 — `PURE-UPGRADE` other modules + sentinel + CI wiring (1 commit)
1. `tests/integration/auth/password-reset-flow.test.ts`
2. `tests/integration/admin/audit-breach.test.ts`
3. `tests/integration/routes/museum-enrichment.route.test.ts`
4. `tests/integration/routes/support.route.test.ts`
5. `tests/integration/routes/auth.route.test.ts`
6. `tests/integration/routes/review.route.test.ts`
7. `tests/integration/routes/museum.route.test.ts`

Plus: turn on the tier-signature sentinel in CI, add the `integration` job to `ci-cd-backend.yml`.

### Total: **4 commits** for Phase 1.

## 6. Tier-signature baseline strategy

Files NOT crossing an infra boundary but legitimately living in `tests/integration/` (already-PURE-but-integration-by-spirit):

- `tests/integration/chat/chat-api.smoke.integration.test.ts` — Express-harness smoke, no DB. Justification: smoke test cluster. Approved-by: phase1-spec-§4.4.
- `tests/integration/security/ssrf-matrix.integration.test.ts` — outbound network boundary (matches pattern (c) in §4.4 because `fetch` regex matches ssrf test code). Should NOT need baseline entry — verify by running the sentinel; if it does need an entry, document why.

The baseline file format mirrors Phase 0's eslint baseline:

```json
{
  "exempt": [
    {
      "path": "museum-backend/tests/integration/chat/chat-api.smoke.integration.test.ts",
      "reason": "smoke test against Express harness; no DB path required",
      "approved_by": "phase1-spec-§6"
    }
  ]
}
```

A cap test (`scripts/sentinels/integration-tier-baseline-cap.mjs` + companion Jest test) hardcodes `PHASE_1_INTEGRATION_BASELINE_CAP = 2`. Baseline can shrink, never grow.

## 7. Risks & Mitigations

### Risk: Tests become flaky due to shared-container TRUNCATE timing

If a test forgets `await harness.reset()` in `beforeEach`, residual rows from the previous test pollute. **Mitigation**: `createIntegrationHarness()` returns the harness with `beforeEach` registered automatically when `scheduleStop()` is called, OR enforce via lint rule. Decision: enforce via convention + a single-line guard in `createIntegrationHarness()`'s docstring; if flakiness emerges, escalate to a Jest setup hook.

### Risk: Migration round-trip test breaks every time someone writes a non-reversible migration

That's the point — but it should fail loudly with a useful diff, not silently. **Mitigation**: `dumpSchemaFingerprint()` returns a deeply-comparable structure; on mismatch, the diff names the differing table / column / constraint specifically.

### Risk: Container boot adds CI time

Estimated +30–60s per PR build. **Mitigation accepted**: banking-grade demands real-DB integration in PR CI; the cost is acceptable. If it grows beyond 90s, optimise by sharing one container across all jobs via Docker layer cache or a `services:` block in the workflow file.

### Risk: Some PURE-UPGRADE files don't actually need real PG once read carefully

Phase 0 spec §5 tagged them in good faith but a fresh read might reveal some are actually pure logic on stub data. **Mitigation**: in Group 3 + 4, the implementer reads each file before migrating; if a file genuinely doesn't need PG (e.g., it tests pure prompt-builder logic that happened to be in `tests/integration/` by historical accident), it gets MOVED to `tests/unit/` instead and notes that in the commit body.

### Risk: TypeORM `undoLastMigration({ transaction: 'each' })` may hit a migration that throws on `down()`

Some migrations may have implicit forward-only assumptions. **Mitigation**: the migration round-trip test fails loud → developer fixes the broken `down()` migration before merge. This is the correct outcome — that migration was always broken, the test just makes it visible.

### Risk: Parallel-session collision (still ongoing as of 2026-04-30)

Same anti-leak protocol as Phase 0. Each implementer subagent dispatched with the explicit `git restore --staged .` + scoped `git add` ritual.

## 8. Acceptance Criteria

Phase 1 is **done** when ALL of the following hold:

- [ ] `museum-backend/tests/helpers/integration/integration-harness.ts` exists, exports `createIntegrationHarness()`, `IntegrationHarness` interface, and is documented in a 1-page README under `tests/helpers/integration/README.md`.
- [ ] `museum-backend/tests/integration/db/migration-round-trip.test.ts` exists and passes against the current 44 migrations on a clean container.
- [ ] All 6 `MEM_ONLY` files migrated; their `createInMemoryRepo` imports removed; tests assert the same observable contracts.
- [ ] All 11 `PURE-UPGRADE` files migrated to real PG OR moved to `tests/unit/` if the file genuinely doesn't need persistence (commit message names the choice per file).
- [ ] `scripts/sentinels/integration-tier-signature.mjs` exists and exits 0 against the current state.
- [ ] `scripts/sentinels/.integration-tier-baseline.json` documents the baseline exemptions; cap test (Jest) enforces `length <= PHASE_1_INTEGRATION_BASELINE_CAP`.
- [ ] `museum-backend/package.json` has `test:integration` script.
- [ ] `.github/workflows/ci-cd-backend.yml` has an `integration` job that runs `pnpm test:integration` on every PR push and on push to main/staging.
- [ ] Full BE test suite green: `pnpm test` (unit) + `pnpm test:integration` (real PG) + `pnpm test:e2e` still works as before.
- [ ] `pnpm lint` (BE) exit 0, `as-any` ratchet unchanged at 0.
- [ ] Phase 1 lands as 4 commits on `main` (Group 1 / 2 / 3 / 4 from §5).

## 9. Open Questions for User Review

(None at the time of writing. All major decisions resolved by the Q1=B / Q2=ii / Q3=a answer:
- Harness architecture: lighter dedicated `createIntegrationHarness` (Q1=B).
- Container strategy: shared per worker, TRUNCATE between tests (Q2=ii).
- CI gating: PR push (Q3=a).)

If anything looks wrong on review, raise before plan generation.
