# E — Retention Policies + Scheduled Prune

**Date:** 2026-05-01
**Subsystem:** E of A→H scale-hardening decomposition
**Status:** Approved (autonomous mode)
**Predecessors:** A1+A2, C, D
**Successors:** F infra, G AI cache, H observability

---

## 1. Context

Three tables grow unbounded today:

- `support_tickets` (and cascading `ticket_messages`) — every ticket stays forever.
- `reviews` — pending and rejected reviews accumulate even after moderation.
- `art_keywords` — crowdsourced enrichment table; one row per `(keyword, locale)`. Single-hit stale entries clutter the long tail.

Without retention, after 12-24 months these tables dominate backup size and slow `EXPLAIN ANALYZE` plans even with the A1+A2 indexes. Privacy-by-design also benefits: closed support tickets and rejected reviews stop being attack surface for data-export or adversarial-discovery requests.

## 2. Goals

1. **Documented retention policy per entity** (ADR per entity — `docs/adr/ADR-013-support-tickets-retention.md`, `ADR-014-reviews-retention.md`, `ADR-015-art-keywords-retention.md`).
2. **Daily scheduled prune jobs** running off the existing BullMQ infrastructure (mirror the knowledge-extraction worker pattern: `attempts`, exp backoff, Sentry on final failure, removeOnComplete/Fail retention).
3. **Idempotent prune SQL** — running twice in a row deletes only what's eligible; re-runs are no-ops.
4. **Bounded delete batch size** — never `DELETE FROM x WHERE created < ...` without a `LIMIT` clause to avoid holding a long-running transaction lock.
5. **Audit trail** — every prune run writes one `audit_logs` entry with the count deleted per table and the cut-off date used.
6. **Observability** — metrics for "rows pruned per run per table" (Prometheus/Grafana — but emitting log/event is enough; dashboard wiring deferred to subsystem H).

Non-goals:
- Backfill / one-time historical purge of existing rows. The first scheduled run will catch them; if the volume is too large, an operator runs the prune script manually with chunked offsets.
- Soft-delete (set `deleted_at`) — hard delete is the simpler / safer choice for tables without legal-hold requirements.
- Retention for entities not flagged by the audit (chat_sessions, chat_messages, etc. — those have their own purge policy via `chat_sessions.purged_at`).

---

## 3. Retention rules

### 3.1 support_tickets (ADR-013)

- **`status IN ('closed', 'resolved')` AND `updatedAt < NOW() - 365 days`** → prune.
- All `ticket_messages` cascade-delete via existing FK (verify with `\d ticket_messages` constraint).
- Open tickets are never auto-pruned (no upper bound). Long-open tickets (>365d) surface as a separate alert metric, not a delete.
- Rationale: 365 days matches the "operational support history" window most regulated SaaS settle on (SOC2 Type II audit horizon = 12 months).

### 3.2 reviews (ADR-014)

Two prune rules:
- **`status = 'rejected'` AND `updatedAt < NOW() - 30 days`** → prune. Rejected reviews don't need long-term retention.
- **`status = 'pending'` AND `createdAt < NOW() - 60 days`** → prune. Stale pending reviews are abandoned moderation queue debris.
- **`status = 'approved'`** → never auto-pruned. Approved reviews are public/displayed and stay forever (or until manual moderation).
- Rationale: 30/60 days mirror typical user-content moderation SLAs.

### 3.3 art_keywords (ADR-015)

- **`hitCount <= 1` AND `updatedAt < NOW() - 90 days`** → prune.
- Single-hit stale entries are crowdsourced noise (one user typed something once, never matched again). 90 days gives ample re-occurrence window.
- High-hit entries (`hitCount > 1`) are real enrichment signal — never auto-pruned.
- Rationale: keeps the keyword table lean for the offline-classifier sync (1 row per `(keyword, locale)`; the mobile app downloads this table on launch).

---

## 4. Architecture

### 4.1 Shared scheduled-job runner

`museum-backend/src/shared/queue/scheduled-jobs.ts` (new) — wraps a BullMQ `Queue` + `Worker` for cron-like recurring jobs. Pattern:

```ts
export interface ScheduledJobConfig {
  name: string;
  cronPattern: string; // e.g. '15 3 * * *' = 03:15 UTC daily
  handler: () => Promise<{ rowsAffected: number; details?: Record<string, unknown> }>;
  connection: BullMQConnection;
}

export function registerScheduledJob(cfg: ScheduledJobConfig): {
  start(): void;
  close(): Promise<void>;
};
```

Internally:
- Creates a single `Queue` per cron pattern (or shares one).
- `queue.add(name, payload, { repeat: { pattern: cronPattern } })`.
- Worker invokes `handler()`; on success logs row count + writes audit log; on failure paged via existing `handleJobFailure` (shared queue handler from C audit).

Lives alongside `extraction.worker.ts` so the BullMQ connection config is reusable.

### 4.2 Three prune use cases

`museum-backend/src/modules/{support,review,chat}/useCase/prune-*.ts`:

- `pruneClosedSupportTickets()` — deletes per §3.1 with `LIMIT 1000` chunk loop, returns total deleted.
- `pruneReviews()` — deletes per §3.2 (two queries — rejected + pending), returns counts.
- `pruneStaleArtKeywords()` — deletes per §3.3, returns count.

Each function:
1. Computes the cutoff date.
2. Runs `DELETE … WHERE … LIMIT 1000 RETURNING id` in a loop until `RETURNING` returns 0 rows.
3. Returns total deleted + per-rule breakdown.
4. Uses the entity's repository (TypeORM `dataSource.query`) — no inline raw SQL outside the use case.

### 4.3 Wire in app startup

`src/app.ts` (or wherever workers are started) — register the three scheduled jobs at boot. Configurable: `RETENTION_PRUNE_ENABLED=true` env flag (default `true` in prod, `false` in test/dev). Cron pattern in env (`RETENTION_CRON_PATTERN=15 3 * * *`).

### 4.4 Operator escape hatch — manual prune script

`museum-backend/scripts/prune-retention.ts` — runs the three prune functions imperatively with stdout progress. Useful for one-shot historical purge. Does NOT bypass the scheduled job — it's just the same code without the cron wrapper.

---

## 5. Files

```
museum-backend/
├── src/
│   ├── shared/queue/
│   │   ├── scheduled-jobs.ts                                NEW — BullMQ cron wrapper
│   │   └── job-failure.handler.ts                            (existing, shared)
│   ├── modules/
│   │   ├── support/useCase/
│   │   │   └── prune-support-tickets.ts                     NEW
│   │   ├── review/useCase/
│   │   │   └── prune-reviews.ts                             NEW
│   │   └── chat/useCase/
│   │       └── prune-stale-art-keywords.ts                  NEW
│   ├── config/env.ts                                        MODIFY — add RETENTION_* keys
│   └── app.ts                                               MODIFY — register scheduled jobs
├── scripts/
│   └── prune-retention.ts                                   NEW — manual one-shot
└── tests/unit/
    ├── shared/queue/scheduled-jobs.test.ts                  NEW
    ├── support/prune-support-tickets.test.ts                NEW
    ├── review/prune-reviews.test.ts                         NEW
    └── chat/prune-stale-art-keywords.test.ts                NEW
docs/adr/
├── ADR-013-support-tickets-retention.md                     NEW
├── ADR-014-reviews-retention.md                             NEW
└── ADR-015-art-keywords-retention.md                        NEW
```

---

## 6. Environment variables

| Var | Default | Notes |
|---|---|---|
| `RETENTION_PRUNE_ENABLED` | `'true'` (prod), `'false'` (test/dev) | Master kill-switch |
| `RETENTION_CRON_PATTERN` | `'15 3 * * *'` (03:15 UTC daily) | Single cron for all three jobs |
| `RETENTION_BATCH_LIMIT` | `'1000'` | DELETE chunk size |
| `RETENTION_SUPPORT_TICKETS_DAYS` | `'365'` | Override per ADR-013 |
| `RETENTION_REVIEWS_REJECTED_DAYS` | `'30'` | Override per ADR-014 |
| `RETENTION_REVIEWS_PENDING_DAYS` | `'60'` | Override per ADR-014 |
| `RETENTION_ART_KEYWORDS_DAYS` | `'90'` | Override per ADR-015 |
| `RETENTION_ART_KEYWORDS_HIT_THRESHOLD` | `'1'` | Override per ADR-015 |

All loaded via the existing `src/config/env.ts` Zod schema with defaults so missing env vars do not crash boot.

---

## 7. Tests

- **Unit per prune function**: mock dataSource.query, assert correct WHERE clause + LIMIT + chunk loop terminates on empty RETURNING.
- **Unit on scheduled-jobs wrapper**: assert it adds the repeat opts, handler is invoked, audit log is written on success, `handleJobFailure` is called on error.
- **Integration (skipped, manual)**: a real test DB seeded with mixed-age rows, run prune, verify counts.

---

## 8. Acceptance criteria

- 3 ADRs landed.
- 3 prune use cases implemented + tested.
- Scheduled-jobs wrapper implemented + tested.
- `app.ts` registers the 3 jobs behind env flag.
- `pnpm exec tsc --noEmit` clean.
- `pnpm test --silent` reports 0 new failures.
- Drift check post-E: no schema diff (no DB changes).
- Lint clean on touched files.

## 9. Risks + mitigations

| Risk | Mitigation |
|---|---|
| First prune run could delete tens of thousands of historical rows in one DELETE → long-running tx, lock contention. | Chunked DELETE with `LIMIT 1000` per query inside a tight loop. Each chunk is its own tx. |
| Cron job fires while another instance is also running it (multi-replica deploy). | BullMQ ensures a single worker picks up each repeated job — uses Redis as the lock arbiter. |
| Audit log write fails after prune succeeds → partial trail. | Audit log write is part of the same prune handler; on audit failure we log + Sentry but don't undo the delete. Acceptable: prune itself is the source of truth. |
| Configurable thresholds set too aggressively delete real data. | Default values are conservative (365/30/60/90 days). Override via env requires a deliberate ops change. |

## 10. Out of scope

- Soft-delete / `deleted_at` column on any entity.
- Backfill of historical rows (first scheduled run handles them).
- Retention for chat_sessions / chat_messages (existing `purged_at` policy out of scope).
- Pagination / batched audit-log emission (one audit row per scheduled run is enough granularity).
