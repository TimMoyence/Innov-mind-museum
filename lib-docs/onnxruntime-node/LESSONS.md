# Lessons — onnxruntime-node (v1.26.0)

Audit 2026-05-18 : **CHANGES_RECOMMENDED**.

## 🚨 F2 HIGH : `InferenceSession.create(modelPath)` omits SessionOptions
- `siglip-onnx.adapter.ts:125` — no executionProviders, no graphOptimizationLevel, no freeDimensionOverrides.
- macOS arm64 dev : OK (only CPU EP shipped per PATTERNS §5). Linux x64 prod : si CUDA EP later ships, silently picks CUDA without intent.
- **Fix TD-ONNX-01** : `{ executionProviders: ['cpu'], graphOptimizationLevel: 'all', freeDimensionOverrides: { batch: 1 } }`.

## ⚠️ F3 MEDIUM : No `session.release()` teardown
- Native handle held until process exit. Tests + graceful shutdown leak native memory. Stryker open-handle risk.
- **Fix TD-ONNX-02** : add `async shutdown() { await (await this.sessionPromise)?.release(); this.sessionPromise = null; }`.

## ⚠️ F4 MEDIUM : No `inputNames/outputNames` validation post-create
- Model drift caught only at first encode (throws 'output missing'). Should fail-fast at create() if `pixel_values` ou `image_embeds` absent.
- **Fix TD-ONNX-03** : assert `session.inputNames.includes(SIGLIP_INPUT_NAME)` après create().

## ⚠️ F10 LOW : No concurrency limiter (p-limit)
- Single InferenceSession thread-safe en ORT NAPI mais parallel CPU inference saturate intraOpNumThreads.
- **Fix TD-ONNX-04** : wrap encode() in p-limit(N), N = max parallel.

## ✅ Positives
- `sessionPromise` cached per-instance, factory called once at boot ✅
- **SigLIP normalize CORRECT** : `(x/127.5)-1` ≈ `[-1,+1]`, NOT ImageNet (CLAUDE.md gotcha) ✅
- Tensor shape `[1,3,224,224]` NCHW Float32Array ✅
- Output dim 768 enforced (halfvec(768) match) ✅
- L2 normalize pour inner-product == cosine ✅
- AbortController + timeout pattern (limitation ORT.run pas cancellable documented)
- Model path env-sourced
