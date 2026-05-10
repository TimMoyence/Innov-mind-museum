# ADR-037 — Visual similarity (C3) — SigLIP encoder + pgvector kNN

- **Status**: Accepted (Sprint 2026-05-08 → 2026-05-10, run `2026-05-08-c3-image-comparative`)
- **Date**: 2026-05-10
- **Owner**: backend / chat / visual-similarity module
- **Linked spec/design**: `.claude/skills/team/team-state/2026-05-08-c3-image-comparative/spec.md` + `design.md` + `tasks.md`

## Problem

Visitors photograph an artwork and ask Musaium "what else looks like this?". The chat path needs to return a list of visually similar artworks from a curated catalogue (Louvre, Orsay, Pompidou, MoMA, Met, plus contracted museums) within p95 ≤ 3 s, with verified Wikidata-sourced facts (no hallucinated titles / artists), under V1 launch traffic estimates (~1 k requests/day).

## Decision

The `/api/chat/compare` endpoint runs a five-stage pipeline, captured by `VisualSimilarityService.compare()` in `museum-backend/src/modules/chat/useCase/visual-similarity/similarity.service.ts`:

1. **Cache lookup** — `sha256(buffer) + locale + topK + sorted(museumQids)` keys a 1-hour Redis cache (D9). Identical re-submissions short-circuit the whole pipeline.
2. **Encode** — SigLIP `siglip-base-patch16-224` ONNX FP16 model, served via `onnxruntime-node` (CPU AVX2). L2-normalised 768-dim float32 vector. EncoderUnavailable → 503 + `fallbackReason: 'encoder_unavailable'` (R11).
3. **kNN search** — pgvector `halfvec(768)` cosine, IVFFlat index, `topN = max(20, 4 * topK)` (R3). Optional `museumQids` filter (R4).
4. **Enrich** — Wikidata SPARQL batch lookup of titles / artists / dates (locale FR/EN). Candidates that don't resolve are dropped — UFR-013: never fabricate facts.
5. **Score + fuse** — weighted linear `finalScore = 0.7 * visualScore + 0.3 * metadataScore`. V1 has no query-side facts so `metadataScore` collapses to 0 (wired anyway so V2 query-enrichment plugs in without changing the call site).

## Options considered

### D1 — Encoder choice (SigLIP vs. CLIP vs. DINOv2)

- **CLIP** (OpenAI ViT-B/32): widely deployed, but text-image alignment optimisation isn't ideal for image-image search.
- **DINOv2**: strong on general object similarity but slower (no FP16 ONNX), no out-of-the-box artwork fine-tuning.
- **SigLIP base patch16-224 (chosen)**: 768-dim, FP16 ONNX runs at ~80 ms / image on AVX2 CPU, public weights, sigmoid loss → better for retrieval than CLIP's softmax. Pareto-best for our latency budget.

### D2 — Vector store (pgvector vs. Qdrant vs. Pinecone)

- **Qdrant** / **Pinecone**: managed services, additional infra to operate.
- **pgvector with `halfvec(768)` (chosen)**: in-Postgres, no new datastore, joins with relational tables (license metadata, museum ownership). FP16 storage halves disk vs. `vector(768)`. IVFFlat is good enough for ~50 k catalogue rows V1; HNSW upgrade trivial later.
- **gotcha** captured in CLAUDE.md: pgvector `halfvec` requires the extension installed AND created in prod — verify with `\dx vector` before applying the migration, else revert.

### D3 — Result-cache scope (none / adapter / use-case)

- **None**: every request hits encoder + DB even on identical images.
- **Adapter-level decorator**: collides with ADR-036 (single-source LLM cache) — risks reintroducing the dual-layer pattern.
- **Use-case-level RETAINED top-K cache (chosen)**: keyed by `sha256(buffer)` + request shape. 1-hour TTL. Best-effort writes (Redis outage logged + swallowed). Mirrors ADR-036's "one cache layer" rule.

### D6 — Encoder-down fallback (Replicate hosted-SigLIP vs. queue vs. 503)

- **Replicate fallback**: ~90 USD/month estimate at 1 k/day, adds an external dependency, latency ≥ 500 ms cold start.
- **Queue + retry**: poor UX for an interactive chat.
- **503 + contractual fallback envelope (chosen V1)**: `matches: [], fallbackReason: 'encoder_unavailable'`. FE renders an empty-state with i18n key `chat.compare.error.unavailable`. Replicate is captured as the V1.1 escalation if local encoder downtime exceeds the SLO.

## Consequences

### Positive

- Single Postgres datastore — no new infra to deploy / monitor / back up.
- Encoder is local CPU-bound, no per-request egress cost.
- Wikidata enrichment is the only external dependency in the hot path; failures degrade gracefully (drop candidates).
- Langfuse spans (`chat.compare.{total,encode,search,enrich,fusion}`, T9.1) provide per-stage latency forensics out of the box.
- Result cache + encoder fallback honour UFR fail-open everywhere.

### Negative / risks

- IVFFlat recall drops at index-build-time clustering; need to monitor `recall@5 ≥ 0.85` on the fixture set (NFR). Re-tune `lists` parameter as the catalogue grows past 50 k rows.
- `halfvec` precision loss vs. fp32 vector — measured impact on recall is < 1 percentage point on our fixture. If a future encoder is more sensitive (e.g. learned embeddings with tighter cosine clusters), revisit.
- CPU AVX2 requirement on the VPS — verified Q3 (tasks.md) before T1.4 build.
- No per-stage Prom histograms yet — Grafana dashboard `infra/grafana/dashboards/visual-compare.json` only has end-to-end latency. Per-stage observability lives in Langfuse only. Adding `compare_stage_duration_seconds_bucket{stage="..."}` is a follow-up.

### V1 decision — `museumQids` is NOT tenant-scoped

The `/api/chat/compare` Zod schema accepts an optional `museumQids: string[]` filter that the caller forwards to the pgvector kNN. The schema validates each entry against the Wikidata QID format and caps the array length, but the V1 server does NOT cross-check the requested QIDs against the authenticated user's licensed museum (i.e. `req.user.museumId` for B2B users).

This is a deliberate V1 decision, not an oversight. Justification:

- The V1 ingested catalogue is restricted to **PD + CC-0** licenses (cf. Q2 resolved 2026-05-08, `tasks.md` §Open questions). Every artwork in the corpus is publicly licensable; querying any museum's PD subset is functionally equivalent to querying Wikidata directly. There is no licensing leak.
- B2B contracted museum content is NOT in the V1 ingest pipeline. When that lands (V1.1+), the contract terms will dictate scoping: either via a separate licensed-only catalogue table the kNN reads from, or via an enforced `museumQids ∩ req.user.licensedMuseums` intersection at the route boundary.
- The compare route DOES enforce session-ownership (post-2026-05-10 fix, see ADR security amendment below) — a user cannot append assistant messages to another user's session. The `museumQids` filter is a search-scope hint, not an authorization boundary.

Documented for the security review trail (2026-05-10 audit flagged this as HIGH; we reviewed and accepted with the rationale above). The decision is reversible if a B2B contract changes the calculus.

### Security amendment — 2026-05-10

After the run-2026-05-08-c3 security review, two BLOCKERs were fixed before merge:

1. **Session-ownership check** — the compare router now requires a `verifySessionAccess` dep that calls `ensureSessionAccess()` (the same invariant `chat-session.service.ts:170,291` uses on every other write path). Cross-tenant write surface closed.
2. **Rate limit** — `/chat/compare` now mounts `dailyChatLimit + userLimiter + sessionLimiter` mirroring `/chat/sessions/:id/messages`. Compare is encoder + DB + Wikidata-bound; without these, an authenticated attacker could thrash cache + saturate the encoder at line speed.

Test coverage: `compare.route.test.ts` adds two new SEC cases asserting (a) the verifier is invoked with `(sessionId, ownerId)` on the happy path, (b) a 404 propagates when the verifier throws and the use-case is NOT called.

### Alternatives backlog

- **V2 query-side enrichment** — reverse-resolve the user's photo to a candidate QID (e.g. via OCR of museum labels + classifier). Then `metadataScore` becomes meaningful and `sharedAttributes` populates the rationale templater with non-empty terms.
- **HNSW index** when catalogue > 100 k rows.
- **Replicate hosted-SigLIP fallback** if local encoder downtime exceeds SLO.
- **GPU encoder** if p95 encode time becomes the bottleneck (measure first).

## See also

- Operational runbook: `docs/AI_VISUAL_SIMILARITY.md`.
- Spec / design / tasks (run-state, kept for traceability post-merge): `.claude/skills/team/team-state/2026-05-08-c3-image-comparative/`.
- Related ADRs: ADR-021 (PgBouncer transaction-mode constraints — no LISTEN/NOTIFY in compare path), ADR-035 (Wikidata enrichment, reused by the compare enricher).
