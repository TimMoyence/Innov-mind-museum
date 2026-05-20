# pg (node-postgres) — Project-specific lessons

Human-edited gotchas, dated. Append only — never rewrite past entries.
The doc-curator never touches this file; only humans and the dedicated
lessons-author workflow write here.

---

## 2026-05-20

### Audit hash chain advisory-lock caps throughput at ~50–200 inserts/sec

`src/shared/audit/audit.repository.pg.ts:55` uses
`SELECT pg_advisory_xact_lock($1)` with a single global key — the fixed
64-bit constant `AUDIT_CHAIN_LOCK_KEY` defined in source — to serialise INSERTs across
the whole cluster so the per-row hash chain cannot interleave. The cost is
real and measurable: at V1 traffic levels this is fine, but at 100k MAU it
becomes the dominant write-path bottleneck. The planned replacement is a
Merkle batch (ADR-054) — multiple chains, one per shard or per tenant, with
batched root-hash commitments. Do NOT remove the advisory lock until ADR-054
ships; chain integrity is legally-binding (GDPR Art. 30 / SOC2 CC7.2).

Pass the int64 key as `.toString()` (line 55) — JS `bigint` is not in pg's
default coercion table, so handing it `0x…n` raises `"could not determine
data type of parameter $1"`. Stringified keys are server-cast to `bigint`
via the implicit type rule.

### DELETE / UPDATE result shape under TypeORM is `[rows, rowCount]` (2-tuple), NOT plain array

Triggered the 2026-05-08 PgBouncer saturation incident. A prune busy-loop
read `result.length` expecting "rows affected" — but TypeORM 0.3.x normalises
DELETE/UPDATE raw results to `[rows, rowCount]` via PostgresQueryRunner's
`raw.command` switch. `result.length` is always 2 → loop never terminates →
PgBouncer saturation.

Pattern (applied in `prune-stale-art-keywords.ts:52-64`,
`prune-support-tickets.ts:46-58`, `prune-reviews.ts`,
`audit-ip-anonymizer.job.ts:58-71`):

```ts
const result = await dataSource.query<[unknown[], number] | undefined>(sql, params)
const chunkDeleted = Array.isArray(result) && typeof result[1] === 'number' ? result[1] : 0
```

The defensive `typeof === 'number'` guards against adapter normalisation
changes — some TypeORM versions return just the row array for `RETURNING`
queries, others the tuple. Don't trust the static type.

All chunked prune jobs must also throttle between non-empty chunks
(`CHUNK_THROTTLE_MS = 50`) so a runaway loop cannot monopolise PgBouncer
again. The throttle was added in the same 2026-05-08 hardening commit.

### `SAVEPOINT` outside a transaction crashes integration suites

Integration harness (`tests/helpers/integration/integration-harness.ts`) runs
migrations with `runMigrations({ transaction: 'none' })` for speed.
A migration that issues a bare `SAVEPOINT name` (without checking
`queryRunner.isTransactionActive`) errors with `SAVEPOINT can only be used in
transaction blocks` (SQLSTATE 25P01), killing all integration suites for
that branch.

Correct probe pattern (migration `1779051738966-AddMuseumGeofence.ts:32-61`):
wrap the savepoint in `if (queryRunner.isTransactionActive) { … }` or
`try/catch` and `ROLLBACK TO SAVEPOINT` on the catch.

### pg returns NUMERIC, BIGINT, and computed kNN similarity as strings

pg's default type coercion preserves precision by returning `numeric` and
`bigint` as JavaScript strings. The kNN repo
(`artwork-embedding.repository.pg.ts:48-49,128-131,292-295`) defends with
`typeof row.similarity === 'string' ? Number(row.similarity) : row.similarity`
and `COUNT(*)::text AS count` followed by `Number(rows[0].count)`. Do NOT
assume `pg.types.setTypeParser(20, Number)` is registered — it isn't in this
codebase, and registering it would lose precision on truly large counts.

Audit any new raw SQL that returns aggregates (`COUNT`, `AVG`, `SUM`,
`COALESCE(AVG(...), 0)`) — the result will be a string by default. Either
cast in JS (`Number.parseInt(r.c, 10)`) or cast in SQL with `::text` /
`::int` / `::float` as appropriate.

### `pool.on('connect', …)` is no longer the recommended setup path on pg 8.20+

The 2026-03-05 docs change (commit #3623) explicitly stopped recommending
`pool.on('connect')` for per-connection setup. The replacement is the
`onConnect` constructor option (added in 8.20.0, locked here). The event
listener fires synchronously and does not await its body, which races slow
`SET` calls against the first checkout. New code should use `onConnect`;
existing code using the event should be migrated when touched.

### PgBouncer txn mode forbids session-scoped prepared statements

Musaium prod uses PgBouncer in transaction-pooling mode (CLAUDE.md
§Pièges connus). PgBouncer reuses any free backend per transaction, which
means:

- `pg_advisory_lock(key)` (session-scoped) is unsafe — the lock outlives the
  transaction but the next transaction may land on a different backend that
  still holds it from the previous session. Always use
  `pg_advisory_xact_lock(key)`.
- `LISTEN`/`NOTIFY` is unsafe — the listening session may be returned to the
  pool and reissued to an unrelated transaction.
- `PREPARE`d named statements are unsafe — the cached plan lives on the
  backend that ran the `PREPARE`. The next call on the named statement may
  land on a different backend → `prepared statement "<name>" does not exist`.

For Musaium: never use the `name` field in pg's `QueryConfig` for queries
that go through PgBouncer. Either drop the name (pg re-PREPAREs inline per
query) or pin the affected service to session-pooling at the PgBouncer
layer.

### pgvector `halfvec` requires extension ≥ 0.7.0, type is FP16 distinct from `vector`

The catalog table `artwork_embeddings` uses `halfvec(768)` (FP16, half the
storage of `vector(768)` and ~2× faster index build). Two pitfalls:

1. PG vendor that ships pgvector 0.6.x silently rolls back migration C3 on
   `migration:run` — the `halfvec` type does not exist. Verify
   `SELECT extversion FROM pg_extension WHERE extname = 'vector'` ≥ `0.7.0`
   before deploying.
2. Index operator class must be `vector_cosine_ops` (or the corresponding
   `halfvec_*_ops` if available in your pgvector build). The default
   `btree_ops` errors with `operator class … does not exist`.

ADR-037 freezes the choice. Re-evaluate only on pgvector major bump.

### Direct `pg` imports allowed only in test harness

`src/**` must import via TypeORM's DataSource / EntityManager / QueryRunner.
The only legitimate `import … from 'pg'` sites are:
- `tests/helpers/e2e/postgres-testcontainer.ts` (`Client` to probe readiness)
- `tests/integration/db/db-resilience.test.ts` (`Client` for raw isolation
  tests)

If application code needs `new Pool()` directly, escalate the design — the
hexagonal port pattern is the canonical answer (`*.repository.interface.ts`
→ `*.repository.pg.ts`). No exceptions in V1.

### 8.21.0 ships prototype-pollution fix for server-supplied column names

PR #3656 (merged 2026-05-11, released in 8.21.0 on 2026-05-18) fixes a
prototype pollution vector where a malicious or compromised PostgreSQL
server can craft column names like `__proto__` to mutate
`Object.prototype` via the row-builder. Musaium runs against its own DB,
so practical risk is low — but the upgrade is no-cost and removes the
attack surface in case a future test fixture or local-dev container is
ever compromised. Upgrade target: pg 8.21.0, single-line `package.json`
bump, no API changes.

No CVE / GHSA registered as of 2026-05-20. Track
https://github.com/brianc/node-postgres/security/advisories before
escalating beyond a routine bump.
