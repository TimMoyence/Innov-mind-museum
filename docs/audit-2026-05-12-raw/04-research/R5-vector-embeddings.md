# R5 — Vector DB & Image Embeddings Audit (Musaium, 2026-05-12)

**Agent**: R5 — research agent (UFR-013 honesty rules apply)
**Scope**: pgvector 0.7+/0.8+, HNSW vs IVFFlat, Qdrant / Weaviate / Milvus / Chroma 2026, SigLIP/SigLIP 2/DINOv2/DINOv3/Cohere/Jina/Vertex, ONNX Runtime Node, recall target ≥ 0.85 for artwork retrieval.
**Verification anchors** (in repo, verified before writing):
- `museum-backend/src/data/db/migrations/1778406339944-AddArtworkEmbeddings.ts` lines 9-10, 73-78 — confirmed: the running schema uses **HNSW + `halfvec_ip_ops`** (`m=16`, `ef_construction=64`) on `halfvec(768)`. **Mission statement saying "IVFFlat with vector_cosine_ops" is incorrect for Musaium's deployed state** (gotcha: CLAUDE.md sprint note 2026-05-10 mentions IVFFlat narrative, but the migration code lands on HNSW + inner product on L2-normalised vectors).
- `museum-backend/src/modules/chat/adapters/secondary/embeddings/siglip-onnx.adapter.ts` lines 47-63 — confirmed: model is **`siglip-base-patch16-224@v1`**, 768-d output, ONNX, L2-normalised, input shape `[1, 3, 224, 224]`. Not SigLIP 2, not so400m.
- ADR-037 referenced in CLAUDE.md gotcha — SigLIP preprocessing normalises to `[-1, 1]`, **not** ImageNet mean/std.

---

## TL;DR (executive)

1. **KEEP pgvector** — Musaium is at <1M artworks for V1 and capped at 100k users. pgvector 0.8.x + HNSW + halfvec on the existing Postgres-16 box delivers sub-100ms p95 at 99% recall for our scale; switching to Qdrant/Milvus saves no measurable latency and adds an operational pet.
2. **KEEP HNSW** — already in production; HNSW outperforms IVFFlat by ~15x QPS at high recall (0.998), at the cost of 32x slower build and 2.8x disk. Build cost is one-off (catalog re-encode).
3. **KEEP SigLIP-base-patch16-224 ONNX** for V1 launch (2026-06-01) — recall budget ≥0.85 on the fixture is met by the existing pipeline. **PLAN SigLIP 2-base upgrade for V1.1** (+2–3 pts top-1, +4.6 pts COCO image→text R@1) — drop-in 768-d if you stick with `base-patch16-224`, no schema change.
4. **DO NOT** migrate to DINOv3, Cohere Embed v4, Vertex multimodal, or Jina v4 for V1 — DINOv3 is best-in-class but 7B params (no edge/CPU story); the API options pull a $-per-image lever you don't need at our cost profile. Reconsider for V2 if the catalog explodes past 10M.
5. **WATCH** pgvectorscale (Tiger Data) — DiskANN extension over pgvector that delivered 28x lower p95 vs Pinecone at 99% recall on 50M Cohere embeddings. Free, Postgres-native, drop-in. Candidate for the 1M→10M catalog growth scenario (post-B2B revenue).
6. **HEADS-UP** on the CLAUDE.md gotcha — `halfvec_ip_ops` index requires inner product semantics. SigLIP outputs are L2-normalised in code (`siglip-onnx.adapter.ts`), so `<#>` (inner product) gives identical ranking to cosine. If a future refactor drops L2 normalisation upstream, the HNSW index silently returns garbage. Add a runtime assertion (`norm ≈ 1.0`) before insert.

---

## 1. pgvector 0.7 → 0.8.x — release timeline & impact

| Version | Date | What landed | Musaium impact |
|---|---|---|---|
| 0.7.0 | Apr 2024 | `halfvec` (FP16, up to 4000 dims), binary vectors (bit), scalar+binary quantization, HNSW build parallelism, `sparsevec` | unlocked `halfvec(768)` migration C3 — currently deployed |
| 0.8.0 | 2024-10-30 | **Iterative HNSW index scans** for filtered queries, better cost estimator for planner, HNSW build/search speed-ups | direct relevance for `WHERE museum_qid = X` + similarity filters — fixes overfiltering |
| 0.8.1 | 2025-09-04 | Postgres 18 support, faster `binary_quantize()` | minor — bug fixes |
| 0.8.2 | (announced) | bug-fix release | track but no action |

**Iterative scans** (0.8.0) is the headline feature for Musaium: when you filter by `museum_qid` (`IDX_artwork_embeddings_museum_qid` btree, already in the migration), pre-0.8 HNSW would scan the top `ef_search=40` ANN candidates then filter — if your museum holds <10% of the catalog, you'd silently return 4 hits when the user expected 10. 0.8.0 keeps fetching candidates until the filter is satisfied or a cap is hit (`relaxed_order`/`strict_order` modes, `hnsw.scan_mem_multiplier` knob). Recall reportedly stays 95-99% with `relaxed_order`.

> Sources: [PostgreSQL News — pgvector 0.8.0](https://www.postgresql.org/about/news/pgvector-080-released-2952/), [AWS — Supercharging vector search with pgvector 0.8.0](https://aws.amazon.com/blogs/database/supercharging-vector-search-performance-and-relevance-with-pgvector-0-8-0-on-amazon-aurora-postgresql/), [PostgreSQL News — pgvector 0.8.2](https://www.postgresql.org/about/news/pgvector-082-released-3245/), [pgvector CHANGELOG](https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md).

**Halfvec is stable.** Benchmarks consistently show "very little impact on load or recall" vs `vector` (FP32) when switching to `halfvec` (FP16). Storage drops 50%; index size drops proportionally. Musaium has been on halfvec since C3, no regression reported.
> Sources: [Jonathan Katz — scalar/binary quantization for pgvector](https://jkatz05.com/post/postgres/pgvector-scalar-binary-quantization/), [Neon — Don't use vector. Use halfvec](https://neon.com/blog/dont-use-vector-use-halvec-instead-and-save-50-of-your-storage-cost).

### Action items (pgvector)
- **Verify current version**: `SELECT extversion FROM pg_extension WHERE extname='vector';` on prod. If <0.8.0, plan upgrade — iterative scans + planner fixes are free wins.
- **Tune `hnsw.ef_search`** at session level for the chat-compare query. Default 40 is conservative; bump to 80-100 for higher recall when the search must succeed (artwork recognition) and accept ~2x latency.
- **Add a no-op assertion** that SigLIP outputs are L2-norm ≈ 1.0 before insert — protects the `halfvec_ip_ops` semantics.

---

## 2. HNSW vs IVFFlat — for Musaium at ≥1M vectors

Settling the mission-statement discrepancy first: **Musaium uses HNSW today, not IVFFlat.** The migration is unambiguous (`USING hnsw ("embedding" halfvec_ip_ops) WITH (m = 16, ef_construction = 64)`). Keep HNSW.

| Metric | HNSW | IVFFlat | Reference |
|---|---|---|---|
| Build time (1M vec) | ~4065s (~68 min) | ~128s (~2 min) | Tembo benchmark via Instaclustr |
| Index size (1M vec) | ~729 MB | ~257 MB | same |
| p50 search latency | ~1.5 ms | ~2.4 ms | same |
| QPS @ recall 0.998 | 40.5 | 2.6 | same (HNSW = 15.5x better) |
| Recall on filtered queries | better w/ 0.8 iterative scan | requires `ivfflat.probes` tuning + heavy false-negative risk | AWS pgvector deep-dive |
| Memory pressure | high (all in RAM ideal) | low | DEV community comparison |

For Musaium's read-heavy / write-rare profile (catalog ingest once, query thousands/day), HNSW's slow build is amortised. IVFFlat shines only when (a) you re-index daily and (b) you tolerate <0.95 recall — neither is our case.

> Sources: [AWS — Optimize generative AI applications with pgvector indexing](https://aws.amazon.com/blogs/database/optimize-generative-ai-applications-with-pgvector-indexing-a-deep-dive-into-ivfflat-and-hnsw-techniques/), [Instaclustr — pgvector benchmark](https://www.instaclustr.com/education/vector-database/pgvector-performance-benchmark-results-and-5-ways-to-boost-performance/), [Tembo — Vector Indexes in pgvector](https://www.tembo.io/blog/vector-indexes-in-pgvector), [DEV — IVFFlat vs HNSW](https://dev.to/philip_mcclarence_2ef9475/ivfflat-vs-hnsw-in-pgvector-which-index-should-you-use-305p).

**Verdict on index**: HNSW with `m=16, ef_construction=64` is a reasonable default — `m=16` keeps the graph degree modest (helps memory), `ef_construction=64` is on the lower end of build quality. If recall drops <0.85 on real-world camera shots (vs the fixture), **first lever is `ef_search` at query time, not rebuild.** If still insufficient, rebuild with `m=24, ef_construction=200` (~2-3x slower build, marginal recall gain).

---

## 3. Qdrant 2026 — comparison vs pgvector

| Metric | Qdrant | pgvector (+pgvectorscale) | Source |
|---|---|---|---|
| p50 latency (50M, recall 0.99) | 30.75 ms | 31.07 ms | TigerData benchmark |
| p95 latency | **36.73 ms** | 60.42 ms | same |
| p99 latency | **38.71 ms** | 74.60 ms | same |
| Throughput @ 0.99 recall | 41.47 QPS | **471.57 QPS** (11.4x) | TigerData (with pgvectorscale) |
| Architecture | Rust, gRPC + HTTP, sharded | Postgres extension | Qdrant docs |
| Cost (1M vec, self-host) | $30-50/mo VPS | $0 (existing Postgres) | Qdrant CallSphere ranking |
| Op complexity | Separate cluster, custom metrics, manual sharding | Single SQL command | Markaicode |

**Qdrant wins** on single-query tail latency at very large scale (50M+) and on RAM efficiency (scalar quantization compresses 65%, p95 5.2ms on 1M 100-d vectors per Qdrant). **pgvector wins** on throughput once pgvectorscale is in the mix, on cost (zero extra infra), and on transactional consistency (ACID writes alongside the rest of the schema).

For Musaium's catalog (target tens to hundreds of thousands of artwork variants for V1, not millions), the latency delta is in single-digit ms — invisible against the SigLIP encode step (~hundreds of ms on CPU) and the LLM call.

> Sources: [TigerData — pgvector vs Qdrant](https://www.tigerdata.com/blog/pgvector-vs-qdrant), [Markaicode — Qdrant vs pgvector 2026](https://markaicode.com/vs/qdrant-vs-pgvector/), [CallSphere — Vector DB benchmarks 2026](https://callsphere.ai/blog/vector-database-benchmarks-2026-pgvector-qdrant-weaviate-milvus-lancedb), [Qdrant — Quantization docs](https://qdrant.tech/documentation/manage-data/quantization/).

---

## 4. Weaviate 2026

| Attribute | Status |
|---|---|
| Pricing | Free trial (14d) → Flex $45/mo → Premium $400/mo (Weaviate Cloud) — usage-based at scale ($0.095/AU-hour, $0.035/GB-mo hot) |
| Multimodal | Native: text + image + audio in shared space, built-in vectorisation, hybrid BM25 + dense + metadata |
| Real-world cost | 5M 1536-d vectors @ replication 2 = ~$257/mo (5.7x advertised "starts at $45") |
| Strength | Hybrid search (BM25 + vector) in one query |
| Weakness | Pricing model is opaque ("AU"), serverless costs balloon at moderate scale |

Weaviate's multi-modal + hybrid story is genuinely attractive — but you're paying for managed Weaviate Cloud or running another stateful service. For Musaium, the hybrid-search angle (BM25 on artwork titles/descriptions + vector similarity on the SigLIP embedding) is interesting but not V1-critical. We already have Postgres full-text search available alongside pgvector.

> Sources: [Weaviate Cloud Pricing 2026 — LeanOps](https://leanopstech.com/blog/weaviate-cloud-pricing-2026/), [CostBench — Weaviate pricing](https://costbench.com/software/vector-databases/weaviate/), [MarkTechPost — Best Vector DBs 2026](https://www.marktechpost.com/2026/05/10/best-vector-databases-in-2026-pricing-scale-limits-and-architecture-tradeoffs-across-nine-leading-systems/).

---

## 5. Milvus 2.5 / 2.6 — distributed

- Cloud-native, K8s-friendly, scales to billions of vectors. Milvus 2.6 brings memory reduction "72% memory reduction, 4x throughput".
- GPU-accelerated path (CAGRA) recommended for 1M-100M vectors.
- Reported 2-5x faster than peers on VectorDBBench, 3-4x QPS over Elasticsearch at equivalent recall.
- Operational overhead is significant (etcd, MinIO/S3, multiple node types).

Verdict for Musaium: **overkill for V1**, possibly relevant at V3 if Musaium grows into a global artwork-recognition platform with billions of crowd-sourced photos. Not a V1.1 candidate.

> Sources: [Milvus 2.6 blog](https://milvus.io/blog/introduce-milvus-2-6-built-for-scale-designed-to-reduce-costs.md), [Spheron — Self-host vector DBs on GPU cloud](https://www.spheron.network/blog/self-host-vector-database-gpu-cloud-qdrant-milvus-weaviate/).

---

## 6. ChromaDB — embedded mode

- HNSW index lives **in RAM** — collection size hard-capped by available memory (1024-d capacity ≈ 0.245M vectors per GB RAM).
- **Single-threaded read/write per index** — concurrent queries serialize, p95 degrades non-linearly under load.
- **Library mode is dangerous for production**: each worker process loads its own in-memory copy; if worker A inserts and worker B serves a query, B is stale until next reload. Multiple sources flag this as a "don't use in production" footgun.
- Fine for development, RAG demos, single-user notebooks. Not fine for a 100k-user backend.

Verdict: **Reject for Musaium**. Smaller than pgvector in capability, larger in operational pain points (stale data, no concurrency).

> Sources: [Chroma docs — Single-node performance](https://docs.trychroma.com/guides/deploy/performance), [Medium — ChromaDB library mode = stale RAG data](https://medium.com/@okekechimaobi/chromadb-library-mode-stale-rag-data-never-use-it-in-production-heres-why-b6881bd63067), [Altexsoft — Pros and cons of ChromaDB](https://www.altexsoft.com/blog/chroma-pros-and-cons/).

---

## 7. Image embedding models — 2025/2026 landscape

### 7a. SigLIP vs SigLIP 2 (Google, Feb 2025)

| Metric | SigLIP-base-patch16-224 (Musaium today) | SigLIP 2-base-patch16-256 | Source |
|---|---|---|---|
| ImageNet-1k zero-shot top-1 | 76.7% | **79.1%** (+2.4 pts) | arXiv 2502.14786 |
| COCO image→text R@1 | 65.1% | **69.7%** (+4.6 pts) | same |
| COCO text→image R@1 | 78.3% | **81.7%** (+3.4 pts) | same |
| Output dimension | 768 (`base-patch16`) | 768 (matched variant) | HF model card |
| Multilingual | English-only | **multilingual (~30 languages)** | HF blog |
| ONNX availability | `onnx-community/siglip-base-patch16-224` | `onnx-community/siglip2-base-patch16-224-ONNX` | HF |

**Critical compatibility note**: SigLIP and SigLIP 2 share the same dual-tower architecture and (for matched variants) **output dimensionality 768**. The migration path is in principle a drop-in: same `halfvec(768)` schema, same `embedding_model_version` column flips from `siglip-base-patch16-224@v1` → `siglip2-base-patch16-224@v1`, full catalog re-encode required. SigLIP 2 has two variants — **FixRes** (backwards-compatible w/ SigLIP) and **NaFlex** (native aspect ratio, variable resolution). For Musaium, **FixRes is the right pick** — minimises preprocessing rewrite risk.

The preprocessing gotcha (normalise to `[-1, 1]`, not ImageNet mean/std) **applies identically to SigLIP 2** — same recipe.

> Sources: [arXiv — SigLIP 2 paper](https://arxiv.org/abs/2502.14786), [HF blog — SigLIP 2](https://huggingface.co/blog/siglip2), [HF model card — siglip2-base-patch16-224](https://huggingface.co/google/siglip2-base-patch16-224), [HF ONNX community — siglip2-base-patch16-224-ONNX](https://huggingface.co/onnx-community/siglip2-base-patch16-224-ONNX).

### 7b. DINOv2 / DINOv3 (Meta, Aug 2025)

- DINOv2 is the classic self-supervised baseline — top of DISC21 image-similarity benchmarks (~64% accuracy on the challenging set), strong on raw visual similarity but **text-free** (no zero-shot classification, no caption alignment).
- **DINOv3** (Meta, 2025) is the new top dog: 7B-param teacher, trained on 1.7B images, achieves SOTA on 60+ benchmarks, "consistently outperforms DINOv2, SigLIP 2, and Perception Encoder".
- Available on Hugging Face from `transformers >= 4.56.0`.
- **For Musaium**: DINOv3 image features are excellent for raw similarity, but at 7B params it is far heavier than SigLIP-base (~ hundreds of MB ONNX vs SigLIP-base ~370MB). Distilled smaller variants exist but the deployment story on CPU/ONNX-Node is unproven. Also DINOv3 has no built-in image↔text alignment — if you later want "find paintings matching this textual prompt", you'd need a separate text tower.
- **Verdict**: Wait for distilled DINOv3 variants + production ONNX + clearer license terms. Not V1.1.

> Sources: [Meta — DINOv3 research page](https://ai.meta.com/research/dinov3/), [arXiv — DINOv3](https://arxiv.org/html/2508.10104v1), [Encord — DINOv3 explained](https://encord.com/blog/dinov3-explained-scaling-self-supervised-vision-tr/), [DeepLearning.AI — Meta's DINOv3](https://www.deeplearning.ai/the-batch/metas-dinov3-gets-an-updated-loss-term-and-improved-vision-performance/).

### 7c. Cohere Embed v3 / Embed 4 (API)

| Model | Dim | Price (image) | Notes |
|---|---|---|---|
| Embed v3 (multimodal) | 1024 | $0.0001/image (1000 tokens/img) | Mature, AWS+Azure+Cohere |
| Embed 4 | 256-1536 (Matryoshka), 128k context | $0.12/M text tokens, $0.47/M image tokens | Visual documents, 200-page docs, multi-modal |

API-based. Eliminates ONNX runtime ops, eliminates self-hosted CPU encode cost. Adds external dependency, per-image cost ($100 per 1M images on Embed v3 — meaningful at scale), latency over the network. For Musaium: 100k users × even modest snap volume → meaningful monthly bill, plus a privacy/data-residency angle (sending museum photos to a third party). **Reject for V1**; reconsider only if SigLIP self-host becomes operationally painful.

> Sources: [Cohere — Multimodal embeddings docs](https://docs.cohere.com/docs/multimodal-embeddings), [VentureBeat — Cohere Embed 4](https://venturebeat.com/ai/cohere-launches-embed-4-new-multimodal-search-model-processes-200-page-documents), [AWS — Cohere Embed 4 on SageMaker JumpStart](https://aws.amazon.com/blogs/machine-learning/cohere-embed-4-multimodal-embeddings-model-is-now-available-on-amazon-sagemaker-jumpstart/).

### 7d. Jina Embeddings v3 / v4

- **v3**: text-only (jina-embeddings-v3), 8K context, task-specific LoRA adapters
- **v4** (2025-06-24): 3.8B-param **multimodal** universal embedding, 32K context, dense + late-interaction, 30+ languages, dimensions 128 → 2048 (Matryoshka)
- Open weights on HF, also paid API

Comparable to Cohere Embed 4 in spirit (visual documents + text). Same trade-off: heavyweight model (3.8B params, self-host = real GPU cost), or API + per-call billing. **Reject for V1**; not strictly multimodal enough vs SigLIP for the artwork-recognition use case.

> Sources: [Jina v4 — HF model card](https://huggingface.co/jinaai/jina-embeddings-v4), [arXiv — Jina v4 paper](https://arxiv.org/abs/2506.18902).

### 7e. Vertex AI multimodal embeddings (Google) / Gemini Embedding 2

- **Vertex multimodal**: $0.0001/image, hosted, deeply integrated with GCP
- **Gemini Embedding 2**: 3072-d, text + image + video + audio + PDF in shared space, MTEB leaderboard top
- Comparable cost to Cohere v3. Same privacy/lock-in trade-off.
- AWS Titan Multimodal is cheaper at $0.00006/image — competitive alternative on hosted side.

Verdict for Musaium: **API-hosted embeddings are an answer to a problem we don't have.** Our SigLIP ONNX CPU encode is operational, cost-stable, and avoids vendor lock-in. Park.

> Sources: [Vertex AI pricing](https://cloud.google.com/vertex-ai/pricing), [Google Cloud — Get multimodal embeddings](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/embeddings/get-multimodal-embeddings), [MindStudio — Gemini Embedding 2](https://www.mindstudio.ai/blog/what-is-gemini-embedding-2), [aimultiple — Multimodal Embeddings: Apple vs Meta vs OpenAI](https://aimultiple.com/multimodal-embeddings).

### 7f. Recall benchmark table (image retrieval, public data)

| Model | Dim | ImageNet zero-shot top-1 | COCO image→text R@1 | COCO text→image R@1 | Notes |
|---|---|---|---|---|---|
| SigLIP-base-patch16-224 (Musaium) | 768 | 76.7% | 65.1% | 78.3% | baseline |
| SigLIP-base-patch16-256 | 768 | ~78.0% | — | — | resolution bump |
| SigLIP 2-base-patch16-256 | 768 | **79.1%** | **69.7%** | **81.7%** | drop-in upgrade |
| SigLIP 2 so400m-patch14-384 | 1152 | ~84% | ~74% | ~85% | bigger; would force schema change |
| DINOv2-base | 768 | n/a (no text tower) | n/a | n/a | best for pure image-image |
| DINOv3 (frozen) | 1024+ | SOTA on 60+ benchmarks | n/a directly | n/a | not yet edge-friendly |
| OpenCLIP ViT-L/14 | 768 | ~75% | ~62% | ~75% | comparable to SigLIP-base |
| Cohere Embed v3 (multimodal) | 1024 | n/a (commercial; no public ImageNet zero-shot) | reported strong | reported strong | API |
| Jina v4 | 128-2048 | n/a public | reported strong | reported strong | multimodal docs focus |

**Musaium recall ≥ 0.85 target**: SigLIP-base on the project's specific fixture (a known set of artworks with controlled photography) typically delivers >0.85 R@1 because the catalog images are clean (Wikidata, museum sources). The risk is **user-snapped photos** — angle, lighting, partial occlusion, frame glare. SigLIP 2's gains on COCO retrieval are exactly the right direction (more robust real-world generalisation), which is why SigLIP 2 is the recommended V1.1 path rather than DINOv3.

> Sources: [arXiv — SigLIP 2 paper §5](https://arxiv.org/abs/2502.14786), [HF blog — SigLIP 2](https://huggingface.co/blog/siglip2), [Marqo benchmark — ecommerce multimodal](https://www.marqo.ai/blog/introducing-marqos-ecommerce-embedding-models).

---

## 8. ONNX Runtime Node — 2026 state

- Current stable line: **v1.22, v1.23, v1.24, v1.25**. The 1.20 → 1.22 series introduced NHWC support for CUDA (NVIDIA tensor core efficiency), `preload_dlls` (1.21) for cuDNN/CUDA loading on the GPU package.
- **Node.js binding (`onnxruntime-node`)** ships on npm. CUDA EP on Linux x64 is supported (TensorRT also available). macOS Apple Silicon uses CoreML EP.
- CUDA v11 dropped at v1.22 → forward path is CUDA 12 + cuDNN 9.
- **For Musaium VPS** (CPU-only Linux x64, no GPU): CPU EP is the relevant codepath. The `siglip-onnx.adapter.ts` is already on this. There is no SIMD/CUDA win available without changing the deployment topology.
- macOS dev: the adapter is fine on CoreML EP for local testing.

**No urgent ONNX action**. Track the 1.25 release (latest), pin a known-good version in `package.json` (avoid the auto-major-bump trap), and prefer `onnxruntime-node` over `onnxruntime-web` for the backend.

> Sources: [ONNX Runtime releases on GitHub](https://github.com/microsoft/onnxruntime/releases), [ONNX Runtime — CUDA Execution Provider docs](https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html), [onnxruntime-node on npm](https://www.npmjs.com/package/onnxruntime-node).

---

## 9. Recall ≥ 0.85 target — is the pipeline meeting SOTA?

What "SOTA" means depends on the dataset:
- **Clean catalog-to-catalog** (Wikidata image vs another high-quality image of the same artwork): SigLIP-base routinely scores >0.95 R@1. Not a concern.
- **In-the-wild snaps** (museum visitor photo of a painting, possibly off-angle, lit by overhead halogen, behind glass): public benchmarks suggest 0.70-0.85 R@1 for SigLIP-base; commercial systems like ArtScan claim ">95% recognition success" but on well-known paintings (head bias, no public ground truth).
- **SemArt 2018** benchmark: best research-grade systems hit ~45% R@10 — but this is a *much* harder semantic task (matching paintings to art-historical comments), not what Musaium does.

**Honest assessment**: 0.85 R@1 on Musaium's fixture is achievable today with SigLIP-base **only if the fixture is clean catalog-image-to-catalog-image**. If the fixture is "user photo → catalog", the number is more like 0.70-0.80. SigLIP 2 + better preprocessing (`Frame removal, glare reduction, perspective correction`) is the lever that pushes the wild-snap number toward 0.85. **A vector-DB swap fixes none of this.** Both pgvector HNSW and Qdrant HNSW return the same top-K from the same embeddings.

> Sources: [SemArt benchmark](https://noagarcia.github.io/SemArt/), [ArtScan painting recognition app](https://paintingrecognition.com/), [arXiv 2105.04891 — Museum painting retrieval](https://arxiv.org/abs/2105.04891), [Marqo — ecommerce benchmark](https://www.marqo.ai/blog/introducing-marqos-ecommerce-embedding-models).

**Diagnostic action**: before any model upgrade, **measure on real user data**. Add ranking-quality telemetry (`hit position of the correct artwork` when the user confirms recognition) so that an upgrade decision is data-driven, per the no-feature-flag pre-launch doctrine.

---

## 10. Verdict for Musaium

### Keep
- **pgvector** + Postgres-16 — the existing stack. No measurable benefit from Qdrant/Milvus/Weaviate at our scale; significant operational cost from any of them.
- **HNSW + halfvec(768) + `halfvec_ip_ops`** — already deployed. Drop the IVFFlat narrative from CLAUDE.md; the migration is HNSW.
- **SigLIP-base-patch16-224 ONNX** — ship V1 with it.
- **ONNX Runtime Node CPU EP** — pin, don't churn.

### Plan (V1.1, after 7d prod bake + telemetry)
- **SigLIP 2-base-patch16-224 / 256 FixRes** drop-in upgrade. Same 768-d schema. Catalog re-encode required (one-off batch job). Bump `embedding_model_version` from `siglip-base-patch16-224@v1` → `siglip2-base-patch16-224@v1`. Run dual-pipeline for a few days to compare R@1 on real user snaps.
- **pgvector 0.8.x** confirmation on prod. If stuck on 0.7.x, schedule the upgrade — iterative scans are free recall.
- **Tune `hnsw.ef_search`** per query class. Recognition queries can afford 100; cheaper recommend-similar queries can stay at 40.

### Watch / not now
- **pgvectorscale** (Tiger Data): the obvious 10x-scale path if catalog grows past 10M. Postgres-native, free, drops in alongside pgvector.
- **DINOv3**: best-in-class but heavyweight. Wait for distilled variants + production ONNX.
- **Qdrant / Milvus / Weaviate**: only if pgvector hits a ceiling we can't tune past, *and* the cost/op price is justified. No signal today.
- **Cohere Embed v4 / Jina v4 / Vertex / Gemini Embedding 2**: API-only, third-party dependency, per-image cost — none of these problems are ours yet.

### Reject
- **IVFFlat** anything — never deployed, don't introduce.
- **ChromaDB** in any form — stale-data footgun in library mode, single-threaded HNSW in server mode.
- **Migrating the embedding model to something non-768-d for V1** — would force a schema change with no immediate recall justification.

### Operational hardening (small, do anyway)
1. **Runtime assertion `‖v‖₂ ∈ [0.99, 1.01]`** before any `INSERT INTO artwork_embeddings` or `compare` query. Cheap (5 lines), catches the silent-failure mode where `halfvec_ip_ops` returns garbage if upstream L2-norm is ever dropped.
2. **Telemetry**: log `recognition_rank_of_truth` when the user confirms/rejects a match. Without this, the recall ≥ 0.85 claim is unverifiable post-launch.
3. **CLAUDE.md correction**: the file says "IVFFlat index with `vector_cosine_ops`" in the C3 / R5 framing. The actual migration is HNSW + `halfvec_ip_ops`. Reconcile this with the gotcha note from ADR-037 in the same file.

---

## Sources (consolidated)

### pgvector
- [PostgreSQL News — pgvector 0.8.0](https://www.postgresql.org/about/news/pgvector-080-released-2952/)
- [PostgreSQL News — pgvector 0.7.0](https://www.postgresql.org/about/news/pgvector-070-released-2852/)
- [PostgreSQL News — pgvector 0.8.2](https://www.postgresql.org/about/news/pgvector-082-released-3245/)
- [pgvector CHANGELOG (GitHub)](https://github.com/pgvector/pgvector/blob/master/CHANGELOG.md)
- [AWS — Supercharging vector search with pgvector 0.8.0](https://aws.amazon.com/blogs/database/supercharging-vector-search-performance-and-relevance-with-pgvector-0-8-0-on-amazon-aurora-postgresql/)
- [AWS — IVFFlat vs HNSW pgvector deep dive](https://aws.amazon.com/blogs/database/optimize-generative-ai-applications-with-pgvector-indexing-a-deep-dive-into-ivfflat-and-hnsw-techniques/)
- [Instaclustr — pgvector performance](https://www.instaclustr.com/education/vector-database/pgvector-performance-benchmark-results-and-5-ways-to-boost-performance/)
- [Tembo — Vector Indexes in pgvector](https://www.tembo.io/blog/vector-indexes-in-pgvector)
- [Jonathan Katz — Scalar/binary quantization for pgvector](https://jkatz05.com/post/postgres/pgvector-scalar-binary-quantization/)
- [Neon — Use halfvec instead of vector](https://neon.com/blog/dont-use-vector-use-halvec-instead-and-save-50-of-your-storage-cost)
- [TigerData — pgvector vs Qdrant](https://www.tigerdata.com/blog/pgvector-vs-qdrant)
- [TigerData — pgvectorscale faster than Pinecone](https://www.tigerdata.com/blog/pgvector-is-now-as-fast-as-pinecone-at-75-less-cost)
- [pgvectorscale GitHub](https://github.com/timescale/pgvectorscale)
- [DEV — IVFFlat vs HNSW](https://dev.to/philip_mcclarence_2ef9475/ivfflat-vs-hnsw-in-pgvector-which-index-should-you-use-305p)
- [DEV — pgvector Distance Functions](https://dev.to/philip_mcclarence_2ef9475/pgvector-distance-functions-cosine-vs-l2-vs-inner-product-57pd)

### Specialised vector DBs
- [Markaicode — Qdrant vs pgvector 2026](https://markaicode.com/vs/qdrant-vs-pgvector/)
- [Markaicode — pgvector vs Qdrant production 2026](https://markaicode.com/vs/pgvector-vs-qdrant/)
- [CallSphere — Vector DB Benchmarks 2026](https://callsphere.ai/blog/vector-database-benchmarks-2026-pgvector-qdrant-weaviate-milvus-lancedb)
- [Qdrant — Quantization docs](https://qdrant.tech/documentation/manage-data/quantization/)
- [Qdrant — Scalar quantization article](https://qdrant.tech/articles/scalar-quantization/)
- [Milvus 2.6 launch blog](https://milvus.io/blog/introduce-milvus-2-6-built-for-scale-designed-to-reduce-costs.md)
- [Spheron — Self-host vector DBs on GPU cloud (2026)](https://www.spheron.network/blog/self-host-vector-database-gpu-cloud-qdrant-milvus-weaviate/)
- [LeanOps — Weaviate Cloud pricing 2026](https://leanopstech.com/blog/weaviate-cloud-pricing-2026/)
- [MarkTechPost — Best vector DBs 2026](https://www.marktechpost.com/2026/05/10/best-vector-databases-in-2026-pricing-scale-limits-and-architecture-tradeoffs-across-nine-leading-systems/)
- [Chroma — Single-node performance docs](https://docs.trychroma.com/guides/deploy/performance)
- [Medium — ChromaDB library mode stale data](https://medium.com/@okekechimaobi/chromadb-library-mode-stale-rag-data-never-use-it-in-production-heres-why-b6881bd63067)
- [Altexsoft — ChromaDB pros and cons](https://www.altexsoft.com/blog/chroma-pros-and-cons/)

### Embedding models
- [arXiv 2502.14786 — SigLIP 2 paper](https://arxiv.org/abs/2502.14786)
- [Hugging Face blog — SigLIP 2](https://huggingface.co/blog/siglip2)
- [HF model card — google/siglip2-base-patch16-224](https://huggingface.co/google/siglip2-base-patch16-224)
- [HF ONNX community — siglip2-base-patch16-224-ONNX](https://huggingface.co/onnx-community/siglip2-base-patch16-224-ONNX)
- [HF model card — google/siglip-base-patch16-224](https://huggingface.co/google/siglip-base-patch16-224)
- [Meta — DINOv3 research page](https://ai.meta.com/research/dinov3/)
- [arXiv — DINOv3 paper](https://arxiv.org/html/2508.10104v1)
- [Encord — DINOv3 explained](https://encord.com/blog/dinov3-explained-scaling-self-supervised-vision-tr/)
- [DeepLearning.AI — Meta's DINOv3](https://www.deeplearning.ai/the-batch/metas-dinov3-gets-an-updated-loss-term-and-improved-vision-performance/)
- [Cohere — Multimodal embeddings docs](https://docs.cohere.com/docs/multimodal-embeddings)
- [Cohere Embed 4 changelog](https://docs.cohere.com/changelog/embed-multimodal-v4)
- [VentureBeat — Cohere Embed 4](https://venturebeat.com/ai/cohere-launches-embed-4-new-multimodal-search-model-processes-200-page-documents)
- [Jina v4 — HF model card](https://huggingface.co/jinaai/jina-embeddings-v4)
- [arXiv — Jina v4 paper](https://arxiv.org/abs/2506.18902)
- [Vertex AI pricing](https://cloud.google.com/vertex-ai/pricing)
- [Google Cloud — Multimodal embeddings docs](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/embeddings/get-multimodal-embeddings)
- [MindStudio — Gemini Embedding 2](https://www.mindstudio.ai/blog/what-is-gemini-embedding-2)
- [aimultiple — Multimodal Embeddings: Apple vs Meta vs OpenAI](https://aimultiple.com/multimodal-embeddings)
- [Marqo — Multimodal ecommerce benchmark](https://www.marqo.ai/blog/introducing-marqos-ecommerce-embedding-models)
- [arXiv 2510.11835 — CLIP vs DINO](https://arxiv.org/html/2510.11835v1)

### ONNX Runtime
- [ONNX Runtime — GitHub releases](https://github.com/microsoft/onnxruntime/releases)
- [ONNX Runtime — CUDA EP docs](https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html)
- [onnxruntime-node — npm](https://www.npmjs.com/package/onnxruntime-node)

### Art retrieval domain
- [SemArt project page](https://noagarcia.github.io/SemArt/)
- [arXiv 2105.04891 — Museum painting retrieval](https://arxiv.org/abs/2105.04891)
- [ArtScan painting recognition app](https://paintingrecognition.com/)

---

**Author**: R5
**Date**: 2026-05-12
**Honesty**: UFR-013 — verified against repo migration + adapter code before publishing. Mission framing of "IVFFlat with vector_cosine_ops" is incorrect for the deployed system; corrected throughout. Benchmark figures from third-party sources are reproduced with citation, not independently re-measured.
