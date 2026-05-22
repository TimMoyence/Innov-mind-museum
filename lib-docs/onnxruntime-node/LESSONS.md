# Lessons — onnxruntime-node (v1.26.x)

Initial audit 2026-05-18 : **CHANGES_RECOMMENDED**.
Mid-cycle implementation (2026-05-18 → 2026-05-20) : TD-ONNX-01 / TD-ONNX-02 / TD-ONNX-03 **closed**.
Refresh audit 2026-05-20 : **TD-ONNX-04 still open** ; no new gaps.

## ✅ CLOSED 2026-05-19 — TD-ONNX-01 HIGH : SessionOptions on `InferenceSession.create()`

- Original gap : `siglip-onnx.adapter.ts:125` called `create(modelPath)` with no SessionOptions. No `executionProviders`, no `graphOptimizationLevel`, no `freeDimensionOverrides` → on Linux x64 prod, if CUDA EP ever shipped, it would silently pick CUDA without intent.
- **Fix shipped** : `siglip-onnx.adapter.ts:50-67 + 151` — `SIGLIP_SESSION_OPTIONS = { executionProviders: ['cpu'], graphOptimizationLevel: 'all', freeDimensionOverrides: { batch: 1 } }` passed on every `create()`.

## ✅ CLOSED 2026-05-19 — TD-ONNX-02 MEDIUM : `session.release()` teardown

- Original gap : native session held until process exit. Tests + graceful shutdown leaked native memory ; Stryker open-handle hangs (mutants timeout instead of being killed properly).
- **Fix shipped** : `siglip-onnx.adapter.ts:192-205` `shutdown()` method. Idempotent + fail-open. Wired into SIGTERM teardown at the composition-root level.

## ✅ CLOSED 2026-05-19 — TD-ONNX-03 MEDIUM : input/output name validation post-create

- Original gap : model drift caught only at first `encode()` (opaque native error `'output missing'`).
- **Fix shipped** : `siglip-onnx.adapter.ts:156-165` — assert `session.inputNames.includes('pixel_values')` AND `session.outputNames.includes('image_embeds')` immediately after create(). Fail-fast → `EncoderUnavailableError` with the actual model I/O names in the message.

## ⚠️ TD-ONNX-04 LOW : No concurrency limiter (`p-limit`)

- Single `InferenceSession` is NAPI-thread-safe, but parallel CPU inference saturates `intraOpNumThreads`. Burst of N parallel `encode()` calls competes with Express / Postgres / BullMQ on CPU.
- **Fix** : wrap `encode()` in `p-limit(N)` where N = max parallel encoders (suggested N=2 on the production VPS, profile before pinning).
- **Status (2026-05-20)** : still open.

## 🆕 2026-05-20 refresh — no new gaps

- Upstream release stream since the audit : `1.24.1` → `1.24.4` → `1.25.0` → `1.25.1` → `1.26.0` (2026-05-08). The JS API surface that Musaium consumes has NOT changed. `1.25.0` raised the CUDA floor to 12.0 and dropped ArmNN — irrelevant to Musaium (CPU-only).
- Security fixes in `1.24.2` (`ArrayFeatureExtractor` OOB read) and `1.24.3` (`GatherCopyData` integer truncation, `RoiAlign` OOB, Lora Adapters heap OOB, Resize OOB) are all covered by the `^1.26.0` pin.
- **Heads-up for 1.27.0** (no release date yet) : CUDA 12 support **ends** ; CUDA 13 only. Not directly relevant to Musaium since we pin `['cpu']`, but flag this if any GPU bring-up is planned.
- Apple Silicon dev (M-series) : `cpu` EP only out of the box. Listing `'coreml'` first does NOT enable Neural Engine without a custom build — design pattern unchanged.

## ✅ Positives (audit 2026-05-18, still holds 2026-05-20)

- `sessionPromise` cached per-instance, factory called once at boot.
- **SigLIP normalize CORRECT** : `((x/255) - 0.5) / 0.5` ≈ `[-1, +1]` ; NOT ImageNet (per CLAUDE.md gotcha).
- Tensor shape `[1, 3, 224, 224]` NCHW, Float32Array, allocated once per encode.
- Output dim 768 enforced (`EXPECTED_VECTOR_LEN`) → matches pgvector `halfvec(768)` (ADR-037).
- L2-normalize for inner-product == cosine (pgvector `<#>` op).
- AbortController + timeout pattern (limitation `ORT.run` is not cancellable — documented in `runWithTimeout()` source comment).
- Model path env-sourced (no hardcoded fs paths).
- `require('onnxruntime-node')` lazy load → `jest.mock(...)` + native-binding lazy semantics both work.
- Defensive `extractEmbedding` narrowing (`unknown` → `Float32Array` | `Array.from(...)` | throw) — covers the JS typing portability (`data: unknown`).
- `release()` correctly drops the cached promise → next encode retries (transient FS error doesn't permanently kill the adapter).
