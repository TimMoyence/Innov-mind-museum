# AI Visual Similarity (C3) — Operational doc

End-to-end runbook for the `/api/chat/compare` pipeline. ADR-037 captures the architectural decisions; this doc is what oncall reads at 03:00.

## Pipeline overview

`POST /api/chat/compare` (multipart) → `museum-backend/src/modules/chat/useCase/visual-similarity/similarity.service.ts#compare()` runs:

1. **Cache lookup** — Redis, key = `visual-similarity:compare:v1:{locale}:{topK}:{sortedMuseumQids},{sha256(buffer)}`. TTL 1 h.
2. **Encode** — SigLIP-2 `siglip2-base-patch16-224@v1` (C9.14 swap, commit `1a3e8d18`), ONNX Runtime CPU. Output L2-normalised float32(768). Note: the Replicate hosted fallback lags one generation (still SigLIP v1, `siglip-base-patch16-224@replicate-v1`) — cross-comparing rows from the two encoders is invalid, see `embeddings.factory.ts`.
3. **kNN search** — `artwork_embeddings` table, pgvector `halfvec(768)`, HNSW index `IDX_artwork_embeddings_hnsw` (`halfvec_ip_ops`, `m=16` / `ef_construction=64`; vectors are L2-normalised at encode time so inner product == cosine). `topN = max(20, 4 * topK)`.
4. **Enrich** — Wikidata SPARQL batch (one HTTP per locale, qids deduplicated). Drop candidates without resolved facts (UFR-013).
5. **Score + fuse** — `finalScore = 0.7 * visualScore + 0.3 * metadataScore`. V1 metadataScore = 0 (no query facts).
6. **Sort + truncate** to `topK`.
7. **Cache write** — best-effort, Redis outage logged + swallowed.

Frontend glue: `museum-frontend/features/chat/application/useCompareImage.ts` (React Query mutation), rendered by `museum-frontend/features/chat/ui/ImageCompareCarousel.tsx` inside `ChatMessageBubble.tsx`.

## Environment variables

| Name | Default | Purpose |
|---|---|---|
| `SIGLIP_ONNX_MODEL_PATH` | `./models/siglip2-base-patch16-224.onnx` | Path to the SigLIP-2 ONNX model file (loaded once at process start). |
| `SIGLIP_ONNX_PROVIDER` | `cpu` | Execution provider. `cuda` requires GPU + driver — V1 ships CPU-only. |
| `WIKIDATA_SPARQL_ENDPOINT` | `https://query.wikidata.org/sparql` | Public Wikidata endpoint. Self-hosted mirror configurable. |
| `VISUAL_COMPARE_CACHE_TTL_SECONDS` | `3600` | Redis result-cache TTL. |
| `RERANK_PROVIDER` | `null` | Cross-encoder reranker (C9.13). `null` = no-op adapter (V1 prod default). `bge-reranker-v2-m3` selects the BAAI/bge-reranker-v2-m3 ONNX scaffold which currently throws (fail-open → baseline order); full impl lands V2. |
| `SMOKE_COMPARE_ENABLED` | `"true"` | Whether `pnpm smoke:api` exercises `/api/chat/compare`. Disable only in legitimate degraded-environment runs. |

## CLI usage

### Catalogue ingestion

```bash
cd museum-backend
pnpm tsx scripts/catalog-ingest.ts \
  --museum-qid Q19675 \
  --concurrency 4 \
  --batch-size 20
```

Pipes Wikidata SPARQL → license filter (PD + CC-0 V1 only) → polite per-hostname downloader (1 req/s) → SigLIP encode → `artwork_embeddings.upsertBatch`.

`--dry-run` skips encode + upsert but still tallies `totalSeen` / `licenseRejected`.

### Smoke test

```bash
SMOKE_API_BASE_URL=https://api.musaium.com \
SMOKE_TEST_EMAIL=... SMOKE_TEST_PASSWORD=... \
pnpm smoke:api
```

Posts a synthetic 1×1 PNG to `/api/chat/compare` and asserts contractual response (`200` + `matches[]` + `modelVersion`, OR `503` + `error.code = COMPARE_ENCODER_UNAVAILABLE`).

### Maestro nightly

```
museum-frontend/.maestro/chat-compare.yaml
```

Validates the visitor-facing flow on a real device. Fixture image: `museum-frontend/.maestro/fixtures/test-artwork.jpg` (uploaded by the CI nightly job).

## Runbook — failure modes

### `compare_encoder_unavailable_total > 5/5min` (Sentry alert)

1. Check oncall Grafana panel "Encoder unavailability rate" (`infra/grafana/dashboards/visual-compare.json`).
2. SSH to the BE host. `docker logs musaium-backend | grep -i "encoder"` — usual suspects:
   - ONNX Runtime crashed → restart container.
   - Model file missing / corrupted → re-run the model deploy step.
   - CPU saturation (AVX2 throttled) → scale up.
3. While debugging, the `/api/chat/compare` endpoint returns `503` with the contractual fallback envelope. The FE shows `chat.compare.error.unavailable`. **No outage on the rest of chat** — only compare degrades.
4. Long-term fallback (V1.1): wire Replicate hosted-SigLIP. Estimated cost ~90 USD/month at 1 k/day.

### `compare p95 > 3s sur 10min` (Sentry alert)

1. Open the Langfuse `chat.compare.total` traces — sort by latency desc.
2. Check the per-stage spans (`chat.compare.{encode,search,enrich,fusion}`):
   - **encode** dominant → CPU saturation or model not warm. Restart, then check AVX2 baseline.
   - **search** dominant → HNSW recall/latency tradeoff drifting as the catalogue grows. First try raising `hnsw.ef_search` at the session level (`SET hnsw.ef_search = 100;`) to trade latency for recall without a rebuild. If the index itself is degraded, `REINDEX INDEX CONCURRENTLY "IDX_artwork_embeddings_hnsw";` to rebuild it; persistent growth may warrant a higher `m` / `ef_construction` (recreate the index — these are build-time params and cannot be `ALTER`ed).
   - **enrich** dominant → Wikidata SPARQL slowdown. Check `query.wikidata.org` status, fall back to a self-hosted mirror.
   - **fusion** dominant → unlikely (pure CPU sort), check for unexpected GC pauses.

### `recall@5 < 0.85` on fixture set

1. Run the recall regression test locally (T7.4 — currently `skipped`, opt-in via `RECALL_REGRESSION=true pnpm test`).
2. If the HNSW index is suspected stale/degraded, rebuild it: `REINDEX INDEX CONCURRENTLY "IDX_artwork_embeddings_hnsw";`. For a recall (not latency) shortfall, raise `hnsw.ef_search` first; only bump build-time `m` / `ef_construction` (recreate the index) if higher `ef_search` is insufficient.
3. If a new model version was deployed, re-encode the catalogue: drop + re-run `scripts/catalog-ingest.ts --reset`.

### `artwork_embeddings_count < 9000` (Sentry alert — T9.5)

The catalogue is missing rows. Check:
1. `scripts/catalog-ingest.ts` last run logs in CI — was there a SPARQL outage?
2. `SELECT count(*) FROM artwork_embeddings WHERE model_version = '<current>'` — confirm a model-version mismatch hasn't shadow-rejected a chunk.
3. Re-run ingestion with `--museum-qid <missing>` to top up.

## Monitoring

- **Grafana dashboard**: `infra/grafana/dashboards/visual-compare.json` (UID `visual-compare`). Panels: end-to-end p50/p95/p99, throughput by status, encoder unavailability rate, error rate split 5xx/4xx, catalogue size (stat + growth timeseries, T9.2).
- **Langfuse traces**: `chat.compare.total` parent + 4 child stage spans. Drill in via the Langfuse UI for per-request forensics.
- **Per-stage Prometheus histogram**: `compare_duration_seconds_bucket{stage=...}` with `stage ∈ {total, encode, search, enrich, fusion}` (T9.1).
- **Catalogue gauge**: `artwork_embeddings_count` updated synchronously on every `/metrics` scrape via the gauge `collect()` callback (T9.2 — `museum-backend/src/shared/observability/prometheus-metrics.ts`). No CRON, no scheduler — Prometheus scrape interval (~15-30s) is the effective sampling cadence.

## Sentry alerts to provision (T9.5)

The three alerts below MUST be created in Sentry before this service is considered fully observable. Each spec is copy-paste-ready: `Query` is the literal PromQL the Sentry UI expects, `Threshold` and `Window` go straight into the alert builder.

### 1. Encoder unavailability spike — HIGH severity

| Field | Value |
|---|---|
| Name | `compare-encoder-unavailable-rate` |
| Metric source | Prometheus (`musaium-prometheus`) |
| Query | `sum(rate(compare_fallback_total{reason="encoder_unavailable"}[5m])) * 300` |
| Condition | `> 5` |
| Window | 5 minutes |
| Severity | HIGH (degraded service — `/api/chat/compare` returns the contractual 503 envelope) |
| Runbook | `Runbook — failure modes` → `compare_encoder_unavailable_total > 5/5min` (this doc, above) |

The `* 300` rescales the per-second rate over the 5-minute window into "occurrences per window" so the threshold reads naturally as "more than 5 fallback responses inside 5 min".

### 2. End-to-end p95 latency breach — HIGH severity

| Field | Value |
|---|---|
| Name | `compare-p95-latency-breach` |
| Metric source | Prometheus (`musaium-prometheus`) |
| Query | `histogram_quantile(0.95, sum(rate(compare_duration_seconds_bucket{stage="total"}[10m])) by (le))` |
| Condition | `> 3` |
| Window | 10 minutes |
| Severity | HIGH (NFR violation — `spec.md §10` budget is p95 ≤ 3s) |
| Runbook | `Runbook — failure modes` → `compare p95 > 3s sur 10min` (this doc, above) |

10-minute window (vs 5-min for the encoder alert) smooths over single bursty deploys; the encoder alert fires faster because the failure mode is binary.

### 3. Catalogue drift — MEDIUM severity

| Field | Value |
|---|---|
| Name | `compare-catalogue-drift` |
| Metric source | Prometheus (`musaium-prometheus`) |
| Query | `max(artwork_embeddings_count)` |
| Condition | `< 9000` |
| Window | 5 minutes |
| Severity | MEDIUM (data freshness; users still get matches, just from a smaller pool) |
| Runbook | `Runbook — failure modes` → `artwork_embeddings_count < 9000` (this doc, above) |

The `max(...)` aggregator is defensive — multiple BE replicas all report the same gauge value (DB row count is global), so `max` and `avg` would agree, but `max` survives a transient scrape miss on one replica without firing the alert. The 5-minute window gives the ingest job time to catch up after a re-run.

## Known limitations (V1)

- **Maestro fixture.** The nightly flow expects `museum-frontend/.maestro/fixtures/test-artwork.jpg`; CI uploads it via `adb push` (Android) or `xcrun simctl addmedia` (iOS) before invoking maestro.
- **Empty `metadataScore` in V1.** No query-side enrichment yet — `finalScore` collapses to `wVisual * visualScore`. V2 introduces query-facts resolution.
- **Single encoder.** No Replicate fallback in V1. Encoder downtime → `503` contractual envelope.
- **No cross-encoder reranking in V1.** The `bge-reranker-v2-m3` integration (C9.13, `RERANK_PROVIDER`) ships only as a scaffold — the default `null` provider is a no-op, and selecting `bge-reranker-v2-m3` currently throws (fail-open → results keep their baseline HNSW order). Final ranking in V1 is purely `finalScore` fusion. Full reranking lands in V2.
