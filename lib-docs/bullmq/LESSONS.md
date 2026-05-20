# Lessons — bullmq (v5.74.1)

Project-specific gotchas. Audit enterprise-grade 2026-05-18 (sampled 11 files).

## 2026-05-18 — F7 LOW : `worker.on('error')` MISSING on 4 of 6 workers
- **Symptôme** : exceptions Worker non-routed via 'failed' (rare crashes redis/transport) deviennent unhandled.
- **Sites manquant** : `museum-enrichment.worker.ts`, `chat-purge-cron.registrar.ts`, `audit-cron.registrar.ts`, `bullmq-enrichment-scheduler.adapter.ts:94`.
- **Sites conformes** : `extraction.worker.ts:105`, `scheduled-jobs.ts:115-117`.
- **Fix** : voir TD-BMQ-01. Add `worker.on('error', err => captureExceptionWithContext(err, {queue: ...}))` aux 4 sites (one-liner pattern from extraction.worker.ts:105-107).

## 2026-05-18 — F10 MEDIUM : SIGTERM teardown peut ne PAS await ExtractionWorker.close() + MuseumEnrichmentWorker.close()
- **Symptôme** : risque de SIGKILL post-30s SHUTDOWN_TIMEOUT sur in-flight jobs sans drain lockDuration.
- **Cause** : `index.ts:298-326` SIGTERM handler register handle.close() pour audit-cron/chat-purge/retention/enrichment-scheduler MAIS pas sûr que les 2 workers extraction + enrichment soient awaited.
- **Fix** : voir TD-BMQ-02. Audit index.ts shutdown contre liste complète workers + ensure all workers `.close()` awaited.

## 2026-05-18 — Pattern canonical v5 : `queue.upsertJobScheduler(stableId, {pattern}, template)`
- **Status** : ✅ TOUS les recurring jobs utilisent ce pattern (enrichment-scheduler.adapter.ts:58, audit-cron.registrar.ts:68, chat-purge-cron.registrar.ts:63, scheduled-jobs.ts:48).
- **Anti-pattern à éviter** : `queue.add(..., {repeat: {...}})` deprecated v5. Stable scheduler IDs guarantee one job per tick across replicas (scheduled-jobs.ts:127-128).

## 2026-05-18 — Connection sharing : `createRedisConnectionOptions` factory
- **Pattern** : `museum-backend/src/index.ts:65-72` set `maxRetriesPerRequest:null` + `enableOfflineQueue:false`. Passé à chaque Queue/Worker.
- **Note** : chaque adapter spawn son own ioredis client (BullMQ requirement) — ~10 connexions sous load. Voir TD-BMQ-03 (LOW) si on veut hoister un shared instance.

## 2026-05-18 — Validations positives (strong)
- ✅ Worker concurrency explicit (jamais unlimited)
- ✅ attempts + backoff strategy (exponential 30s pour extraction/enrichment)
- ✅ DLQ centralisé via `@shared/queue/job-failure.handler`
- ✅ removeOnComplete + removeOnFail bornés (50-100/100-500)
- ✅ Pas de `keyPrefix` (briserait Lua scripts atomic)
- ✅ Error objects only (pas de throw 'string')

## 2026-05-18 — INFO : no QueueEvents (acceptable in monolith)
- Producer+consumer co-located même process → worker.on('completed'|'failed') suffit. QueueEvents (dedicated ioredis blocking connection) requis SEULEMENT si split workers en pods séparés post-V1.

## 2026-05-20

### TD-BMQ-01 CLOSED — `worker.on('error')` now present on ALL 6 workers
- **Verification (curator refresh)** : grep `worker.on\('error'` across `museum-backend/src/` returns 6 hits, matching the 6 workers (`audit-cron.registrar.ts:106`, `chat-purge-cron.registrar.ts:109`, `scheduled-jobs.ts:115`, `extraction.worker.ts:105`, `museum-enrichment.worker.ts:239`, `bullmq-enrichment-scheduler.adapter.ts:105`).
- **Pattern** : `worker.on('error', err => captureExceptionWithContext(err, { queue, kind: 'worker_error' }))`. One-liner, no logger noise (Sentry has its own breadcrumb).
- **Guard** : add eslint or sentinel that flags `new Worker(` without a matching `.on('error'` in the same file. Not done; tracked as monitoring-only.

### F11 LOW (NEW) — `jobId` contains colons (`mus:${museumId}:${locale}`)
- **Site** : `museum-backend/src/modules/museum/adapters/secondary/enrichment/bullmq-museum-enrichment-queue.adapter.ts:15`.
- **Docs** (snapshot-2026-05-20 §D, `https://docs.bullmq.io/guide/jobs/job-ids`) : "No colon separators. Use alternatives like hyphens or underscores instead, as colons conflict with Redis naming conventions."
- **Why it has worked anyway** : BullMQ wraps user-provided jobId inside its own `bull:<queue>:` prefix → Lua scripts use full key, not raw jobId. Empirically tolerant.
- **Risk** : low-but-non-zero. A future BullMQ minor could enforce the documented rule. Also breaks `KEYS bull:queue:mus:*` glob-matching in ops debugging (matches more than intended).
- **Fix (defer)** : switch to `mus-${museumId}-${locale}` in a follow-up. Migration requires draining existing `mus:*` keys first OR keeping legacy parser. Not urgent.

### F12 LOW (NEW) — `backoff: { type: 'exponential', delay: 30_000 }` without `jitter`
- **Sites** : `bullmq-museum-enrichment-queue.adapter.ts:32`, `extraction.worker.ts:53`.
- **Docs** (snapshot-2026-05-20 §B + snapshot-2026-05-18 §Retrying) : `jitter` (0-1) is supported on exponential since BullMQ 5.75. Without it, all in-flight retries hammer the upstream (Wikidata/Wikipedia/Overpass) on the same beat → thundering herd.
- **Impact for Musaium** : enrichment + extraction both call rate-limited public APIs. Synchronized retries amplify 429 storms.
- **Fix (safe, no migration)** : add `jitter: 0.25` once dependency bumped to ≥5.75. Current pin is 5.74.1 — gate on a routine BullMQ patch bump first (latest 5.76.10).

### F13 LOW (NEW) — `ExtractionWorker.limiter` is GLOBAL, not per-worker
- **Site** : `extraction.worker.ts:70-73` `{ limiter: { max: this.config.rateLimitMax, duration: 60_000 } }`.
- **Docs** (snapshot-2026-05-18 §Rate Limiting) : "the rate limiter is global, so if you have for example 10 workers for one queue with the above settings, still only 10 jobs will be processed per second."
- **Risk** : if Musaium ever scales the backend to >1 replica with extraction enabled, capacity does NOT multiply. Capacity-planning trap.
- **Fix** : document the limiter as global in `EXTRACTION_RATE_LIMIT_MAX` env description (env.types.ts) + in `docs/RUNBOOKS`. No code change — behaviour is correct, just under-documented for operators.

### Opportunity (V1.1+, NOT a finding) — `deduplication` option supersedes jobId-collision dedup
- `BullmqMuseumEnrichmentQueueAdapter.enqueue()` currently relies on BullMQ rejecting a duplicate `jobId` while the first is active.
- BullMQ 5.75+ exposes `deduplication: { id, keepLastIfActive: true }` with explicit semantics + `queue.getDeduplicationJobId(dedupId)` lookup.
- Cleaner separation of "dedup key" from "storage key". Not urgent — current code is correct.

### Version pin status
- Repo pinned `bullmq@5.74.1`. Latest published `5.76.10` (2026-05-17). No security advisories (`github.com/taskforcesh/bullmq/security/advisories` returns 0 published as of fetch).
- Recommended patch bump (~36 releases behind, no breaking changes signalled) — schedule via Renovate when next batch lands.
- After bump : `jitter` + `deduplication` + OTel job-state gauges become available.

### Coverage / fetch warnings — see snapshot-2026-05-20.md §I
- `/guide/queueevents`, `/guide/jobs/job-options`, `/guide/jobs/removing-jobs`, `/patterns/dlq` → 404 (these paths simply do not exist in BullMQ docs).
- `github.com/taskforcesh/bullmq/blob/master/CHANGELOG.md` → 403 via WebFetch (GitHub anti-bot). Used `docs.bullmq.io/changelog` (same source, gitbook-rendered).
- `npmjs.com/package/bullmq` → 403 via WebFetch. Used npm registry JSON API instead (`registry.npmjs.org/bullmq`).
