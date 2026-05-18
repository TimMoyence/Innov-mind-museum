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
