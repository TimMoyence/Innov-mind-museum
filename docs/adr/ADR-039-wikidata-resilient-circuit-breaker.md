# ADR-039 — Wikidata resilient (C5) — opossum circuit-breaker + organic local-dump fallback

- **Status**: Accepted-Implemented (C5.3 Phase A files + Phase B wiring merged 2026-05-11 ; status flip pending Tech Lead validation at PR merge SHA)
- **Date**: 2026-05-11
- **Owner**: backend / chat / knowledge-base module
- **Linked plan**: `docs/plans/2026-05-10-c5-launch-prompt.md`
- **Related ADRs**: ADR-035 (KB Wikidata wrap), ADR-036 (LLM cache single layer), ADR-037 (Visual similarity), ADR-031 (kill-switch reservé mobile)

## Problem

The chat path (`KnowledgeBaseService.lookupFacts`) calls live Wikidata SPARQL on every cache miss. Wikidata's public endpoint (`query.wikidata.org/sparql`) has measured monthly downtime windows and rate-limits with `429 Too Many Requests` under bursts. ADR-035 ships the wrapper with a fail-open contract (any error → `null` so the chat continues without knowledge-base enrichment), but two failure modes remain :

1. **Hammering** — on a sustained outage, every cache miss still hits Wikidata. Each call pays a 5 s timeout before the wrapper swallows the error → user-facing latency degrades to multi-second p99 for every cold question, even though we know the upstream is dead.
2. **Cold KB during downtime** — when SPARQL is down for >5 min, even popular artworks Musaium has resolved a hundred times reduce to `null` (Redis TTL eventually expires), and the chat downgrades to non-enriched answers.

C5 (`docs/ROADMAP_PRODUCT.md` lignes 104-111) tracks the gap. The plan originally specified a 150 GB monthly Wikidata RDF dump pipeline (Step 4.x) ; this ADR replaces that with an organic write-through approach validated for V1 launch scale.

## Decision

### D1 — Circuit-breaker pattern via [opossum](https://nodeshift.dev/opossum) 9.x

Wrap `WikidataClient` with `WikidataBreakerClient` (decorator implementing `KnowledgeBaseProvider`). Drop-in at the `chat-module.ts:buildKnowledgeBase` injection seam.

Configuration (env, defaults set for V1 launch traffic ~1k req/day) :

| Env var | Default | Role |
|---|---|---|
| `WIKIDATA_CB_TIMEOUT_MS` | `5000` | Per-call timeout before opossum rejects |
| `WIKIDATA_CB_ERROR_THRESHOLD_PCT` | `50` | % failures in rolling window to OPEN |
| `WIKIDATA_CB_RESET_TIMEOUT_MS` | `30000` | Cooldown OPEN → HALF_OPEN |
| `WIKIDATA_CB_VOLUME_THRESHOLD` | `5` | Min calls before % is evaluated |
| `WIKIDATA_CB_CAPACITY` | `5` | Bulkhead — max concurrent SPARQL |
| `WIKIDATA_USER_AGENT` | `Musaium/1.0 (...)` | WMF UA policy compliance |

States observed via `getState()` snapshot `{ name: 'CLOSED' | 'OPEN' | 'HALF_OPEN', openSince?: number }`. Consumed by `KnowledgeBaseService` for the cascade gate (D3).

### D2 — Transient vs. legitimate error semantics

`WikidataClient.lookup()` swallows everything → opossum can't distinguish "no match found" from "Wikidata is dead", so the breaker would never count failures. We split the API surface :

- **`WikidataClient.lookupOrThrow()`** propagates `WikidataTransientError` on network reject / `408` / `429` / `5xx` ; legitimate `null` (no entity matching, invalid QID rejected by `assertEntityId`, non-art descriptions) still resolves cleanly.
- **`WikidataClient.lookup()`** keeps the historical fail-open contract for direct callers (and the existing 12 unit tests in `wikidata-client.test.ts`) by catching + returning `null`.
- The breaker wraps `lookupOrThrow` so it sees real failures and trips on them ; 4xx-non-retryable and "no match" don't count toward `errorThresholdPercentage`.

### D3 — Cascade fallback to local dump with soak window

`KnowledgeBaseService.shouldFallbackToDump()` consults the dump repo only when **`breakerState.name === 'OPEN'`** AND **`Date.now() - openSince >= LOCAL_DUMP_FALLBACK_AFTER_MS`** (default `60_000`).

Rationale for the soak :

- A brief SPARQL hiccup (1-2 s glitch) trips the breaker but the dump is necessarily staler than the live source — we'd rather absorb the few-second outage than start serving slightly-stale facts immediately.
- `HALF_OPEN` does NOT trigger the fallback : the breaker is actively probing recovery, dropping to the dump would mask the probe outcome and delay return to `CLOSED`.
- `openSince` is preserved across `HALF_OPEN` → `OPEN` re-transitions so the soak window doesn't reset when a probe fails.

### D4 — Organic write-through ingest (replaces 150 GB monthly RDF dump)

**This is the substantive change vs. the original plan §H.** The launch prompt (`docs/plans/2026-05-10-c5-launch-prompt.md` §H.4.3) specified `scripts/ingest-wikidata-dump.ts` downloading the monthly Wikidata RDF (~150 GB compressed) and filtering for art entities. We replace that with a write-through pattern :

- Every successful `WikidataClient.lookupOrThrow` resolves an `ArtworkFacts` row. On success, the cascade UPSERTs the row into `wikidata_kb_dump` (`ON CONFLICT (qid) DO UPDATE` to keep `synced_at` fresh).
- The table grows organically, populated with **exactly** what visitors of the contracted museums actually ask about. Cold-start = empty table = legitimate `null` fail-open (ADR-035 contract preserved).
- Optional one-shot seed `scripts/seed-kb-canon.ts` pre-fills ~1k canonical entities (top museums × top movements via small WDQS SPARQL queries, ~5 MB, runs once before launch). Not required for correctness ; gives a non-empty fallback on day 1.

Trade-offs explicitly accepted :

| Dimension | 150 GB monthly dump (rejected) | Write-through + canon seed (chosen) |
|---|---|---|
| Storage prod | 5-20 GB after filter | 1-50 MB scaling with traffic |
| Ingest infra | Cron + 150 GB d/l + `wikibase-dump-filter` + batch UPSERT job | None — already in the hot path |
| Freshness | Weekly snapshot, up to 7d stale | Live the moment Musaium has seen the entity |
| Coverage | Full Wikidata art-entity universe | Only what's been queried (long-tail = `null` fallback) |
| Cold-start | Day-1 covered | Empty unless seeded ; canon seed gives 80/20 |
| Effort | 4 steps, ~600 LOC, ops setup | 1 hook, ~30 LOC, optional ~50 LOC seed |

The long-tail-coverage loss is real but acceptable for V1 — the LLM falls back to non-enriched answers (still safe, just unspecific), and we measure the miss-rate via Phase 6 telemetry (`wikidata_local_dump_misses_total`) to validate the assumption in production. Doctrine inverts post-B2B revenue : when a paying museum reports a coverage gap on a known artwork, we add it to the seed list, not switch to monthly dumps.

### D5 — Telemetry via Langfuse `chat.knowledge.lookup` span (Step 6.1)

One span per `lookupFacts` call, metadata = `{ searchTermHash: sha256(key).slice(0,16), language, breakerState }`, output = `{ source: 'cache' | 'live' | 'dump' | 'none', found: boolean, latencyMs }`. PII-safe (hash only, no raw search term). Wired through `safeTrace()` so Langfuse outage never breaks the chat path.

Prometheus counters (Phase 6.2-4, separate session) extend this with cardinality-friendly aggregates : `wikidata_sparql_circuit_state{state}`, `wikidata_sparql_requests_total{outcome}`, `wikidata_local_dump_hits_total`, `wikidata_local_dump_misses_total`.

### D6 — No kill-switch (`*_ENABLED`) flags

Pre-launch V1 doctrine — `feedback_no_feature_flags_prelaunch`. The breaker IS the rollback mechanism (it self-heals via `HALF_OPEN`). If a regression ships, `git revert <sha>` + redeploy in <5 min ; we have no production users yet to protect from a bad rollout, so toggle infrastructure is pure overhead (env.ts bloat + double test path + deploy choreography that's never exercised). Every exposed env var is a **tuning value**, never a switch.

Doctrine inverts after the first paying B2B museum (`feedback_no_feature_flags_prelaunch` records the trigger condition explicitly). At that point we re-evaluate adding `WIKIDATA_CB_ENABLED` / `LOCAL_DUMP_FALLBACK_ENABLED` for traffic-safe rollouts.

## Consequences

### Positive

- **Resilience-by-default** : sustained Wikidata outage stops hammering after 5 failures ; subsequent calls return `null` in <1 ms instead of paying 5 s timeouts.
- **Self-healing** : `HALF_OPEN` probes recover automatically when Wikidata comes back.
- **Coverage organique** : the dump table grows with actual demand → after 1 month of traffic, the long-tail of "interesting to Musaium visitors" is covered without a single 150 GB download.
- **Cost** : ~$0 incremental infra (no dump storage, no cron, no batch job).
- **Drop-in** : `KnowledgeBaseProvider` interface preserved → no signature churn at the chat-service call sites.

### Negative / risks

- **Cold-start coverage gap** — empty `wikidata_kb_dump` on first deploy. Mitigated by the optional canon seed (`scripts/seed-kb-canon.ts`, future Phase 4-light). Long-tail entities never seen by Musaium remain uncovered ; quantified in production via the `dump_misses_total` counter.
- **opossum 9 requires Node ≥20** — Musaium runs Node 22 (CLAUDE.md baseline) so this is satisfied ; pinned `engines` in `package.json`.
- **Breaker false-positives** — a brief 5-fail burst trips the breaker for 30 s even if Wikidata recovered. Acceptable : the cascade falls back gracefully. Tune `errorThresholdPercentage` / `volumeThreshold` if false-positives are observed in production telemetry.
- **No dump until Phase 4-light ships** — the cascade wires a `NoopWikidataKbDumpRepository` today. Effect : when breaker is OPEN, the cascade is a no-op (`null` returned, fail-open preserved). Equivalent to ADR-035 baseline → zero regression risk for shipping the breaker alone.

### Neutral

- ADR-035 fail-open contract unchanged at the public API boundary. `KnowledgeBaseService.lookupFacts` still returns `null` on any failure ; the cascade only adds a chance of returning facts (from dump) on a path that otherwise returned `null`.

## Implementation references

| Component | Path |
|---|---|
| Circuit breaker | `museum-backend/src/modules/chat/adapters/secondary/search/wikidata-breaker.ts` |
| Refactored client | `museum-backend/src/modules/chat/adapters/secondary/search/wikidata.client.ts` (`lookupOrThrow` + `WikidataTransientError`) |
| Dump port + noop | `museum-backend/src/modules/chat/domain/ports/wikidata-kb-dump.port.ts` (Phase A: `upsert` added to contract) |
| TypeORM dump entity + repo (C5.3 Phase A) | `museum-backend/src/modules/chat/domain/knowledge/wikidata-kb-dump.entity.ts` + `adapters/secondary/persistence/wikidata-kb-dump.repository.typeorm.ts` (UPSERT on natural key `(search_term, language)`) |
| Migration (C5.3 Phase A) | `museum-backend/src/data/db/migrations/1778504875210-AddWikidataKbDump.ts` (table + UNIQUE constraint + qid index) |
| Write-through decorator (C5.3 Phase A) | `museum-backend/src/modules/chat/adapters/secondary/search/wikidata-write-through.provider.ts` (fire-and-forget UPSERT post-success, fail-open) |
| Canon seed (C5.3 Phase A) | `museum-backend/src/modules/chat/useCase/knowledge/seed-kb-canon.ts` + `museum-backend/scripts/seed-kb-canon.ts` (CLI: `pnpm seed:kb-canon[:host]` ; ~50 œuvres × en+fr) |
| Cascade logic | `museum-backend/src/modules/chat/useCase/knowledge/knowledge-base.service.ts` (`shouldFallbackToDump`, `startTrace`, `applyCascade`) |
| Wiring (Phase B) | `museum-backend/src/modules/chat/chat-module.ts:build` — `kbProvider = WikidataWriteThroughProvider(WikidataBreakerClient(WikidataClient), WikidataKbDumpRepositoryTypeOrm)` shared between `KnowledgeBaseService` AND `KnowledgeRouterService` (C4) so every Wikidata call contributes to `wikidata_sparql_requests_total` and populates the dump |
| Env contract | `museum-backend/src/config/env.ts:knowledgeBase.breaker` + `.env.example` C5 section |
| Prometheus surface (Phase 6.2) | `museum-backend/src/shared/observability/prometheus-metrics.ts` (`wikidataSparqlCircuitState`, `wikidataSparqlRequestsTotal`, `wikidataSparqlRequestDurationSeconds`, `wikidataCacheHitsTotal`/`MissesTotal`, `wikidataLocalDumpHitsTotal`/`MissesTotal`) |
| Grafana dashboard (Phase 6.3) | `infra/grafana/dashboards/wikidata-resilience.json` — 5 panels (circuit state, outcome rate, latency p50/p95/p99, cache hit rate, dump fallback rate) |
| Alert rules (Phase 6.4) | `infra/grafana/alerting/wikidata-resilience.yml` — 4 alerts (`WikidataBreakerOpenSustained` warn 5m, `WikidataSparqlErrorRateHigh` critical 10m, `WikidataSparqlLatencyP95High` warn 15m, `WikidataLocalDumpHotPath` info 10m) |
| Unit tests | `tests/unit/chat/wikidata-breaker.test.ts` (13 — 7 transitions + 6 metric emission) + `knowledge-base-cascade.test.ts` (12 — 6 cascade + 6 metric emission) + `wikidata-kb-dump-noop.test.ts` (2 — null lookup + swallowed upsert) + `wikidata-write-through.test.ts` (6 — delegate + fire-and-forget + error semantics) + `seed-kb-canon.test.ts` (6 — cartesian + dry-run + error resilience) + `tests/unit/observability/prometheus-metrics.test.ts` (+5 Wikidata-specific assertions) |
| Integration E2E | `tests/integration/chat/wikidata-resilience.integration.test.ts` (4 — live + 5xx storm + Step 7.1 DoD + HALF_OPEN recovery) + `wikidata-kb-dump-repository.test.ts` (11 — round-trip + idempotent UPSERT + multi-language + qid denorm) |

## Deferred (separate sessions)

- **Phase 7.3** — Chaos game-day on staging once the staging env is available (`docs/CHAOS_RUNBOOKS.md` extension).
- **150 GB RDF dump pipeline** — NOT scheduled. Re-open the discussion only if production telemetry (post-launch) shows the write-through coverage is insufficient on a measurable scale, AND a B2B contract requires the long-tail guarantee. The write-through + canon seed (C5.3 Phase A) is the V1 ship and intentionally avoids the cron / 150 GB ingest burden.

## Related links

- [opossum docs](https://nodeshift.dev/opossum)
- [Wikidata Query Service rate-limits](https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service/query_limits)
- [WMF User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy)
- ADR-035 — knowledge-base Wikidata wrap (`docs/adr/ADR-035-knowledge-base-wikidata.md`)
- ADR-036 — LLM cache single layer (`docs/adr/ADR-036-llm-cache-strategy.md`)
- Doctrine no-flag — `feedback_no_feature_flags_prelaunch` (.claude memory)
