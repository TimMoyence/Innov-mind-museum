/**
 * SigLIP ONNX embeddings adapter — default `EmbeddingsPort` impl (ADR-037).
 * SigLIP-2 base patch16-224 via `onnxruntime-node` (CPU, NAPI). Primary path;
 * Replicate adapter is hosted fallback (R8) — Replicate lags one model
 * generation (still SigLIP v1), see `embeddings.factory.ts` for the rationale.
 *
 * Preprocessing normalize is `(pixel / 127.5) - 1.0` → range [-1, 1], NOT
 * ImageNet mean/std (different from CLIP/ResNet/DINOv2). Wrong normalize
 * silently produces valid vectors with catastrophic recall (see CLAUDE.md
 * gotcha). Output: 768-d L2-normalised (repo search assumes IP==cosine).
 *
 * All failures (session load, run, timeout, malformed output) →
 * {@link EncoderUnavailableError}. Session is cached per adapter instance.
 *
 * Tests mock `onnxruntime-node` via `jest.mock(...)` — `require()` (not
 * static import) keeps mock hoisting + native-binding-lazy semantics.
 */

import {
  EncoderUnavailableError,
  type EmbeddingsPort,
  type EncodeInput,
  type EncodeOutput,
} from '@modules/chat/domain/ports/embeddings.port';
import { logger } from '@shared/logger/logger';

import { preprocessForSiglip } from './image-preprocess';

/** Persisted alongside the embedding so model upgrades can detect stale rows. */
const SIGLIP_MODEL_VERSION = 'siglip2-base-patch16-224@v1';

const SIGLIP_INPUT_NAME = 'pixel_values';
// The vision-only ONNX export of google/siglip2-base-patch16-224 exposes the
// pooled image embedding (the exact tensor `SiglipModel.get_image_features`
// returns) under its native transformers name `pooler_output` (768-dim), not
// the higher-level `image_embeds` alias. Read it by its real export name.
const SIGLIP_OUTPUT_NAME = 'pooler_output';
const EXPECTED_VECTOR_LEN = 768;

/** NCHW, batch 1, RGB, 224×224. */
const SIGLIP_TENSOR_SHAPE: readonly number[] = [1, 3, 224, 224];

// Session cache is per-adapter-instance (composition-root builds it once
// per process). Per-instance scoping avoids module-Map staleness across
// jest specs that rebuild the adapter.

export interface SiglipOnnxAdapterOptions {
  modelPath: string;
  /** Hard deadline in ms for `session.run`; abort → EncoderUnavailableError. */
  timeoutMs: number;
}

/**
 * TD-ONNX-01 — explicit SessionOptions. `executionProviders: ['cpu']` pins the
 * CPU EP so a future CUDA/CoreML EP install can't silently change numerics ;
 * `graphOptimizationLevel: 'all'` enables full graph fusion ;
 * `freeDimensionOverrides: { batch: 1 }` locks the symbolic batch dim (we always
 * encode one image) so the runtime can allocate fixed buffers.
 * lib-docs/onnxruntime-node/PATTERNS.md §SessionOptions.
 */
interface OnnxSessionOptions {
  executionProviders?: readonly string[];
  graphOptimizationLevel?: 'disabled' | 'basic' | 'extended' | 'all';
  freeDimensionOverrides?: Record<string, number>;
}

const SIGLIP_SESSION_OPTIONS: OnnxSessionOptions = {
  executionProviders: ['cpu'],
  graphOptimizationLevel: 'all',
  freeDimensionOverrides: { batch: 1 },
};

/** Local structural shape — runtime loaded via `require()` for jest.mock + lazy native binding. */
interface OnnxRuntimeModule {
  InferenceSession: {
    create: (modelPath: string, options?: OnnxSessionOptions) => Promise<OnnxInferenceSession>;
  };
  Tensor: new (type: 'float32', data: Float32Array, dims: readonly number[]) => OnnxTensor;
}

interface OnnxTensor {
  type: string;
  data: unknown;
  dims: readonly number[];
}

interface OnnxInferenceSession {
  run(feeds: Record<string, OnnxTensor>): Promise<Record<string, OnnxNamedTensor | undefined>>;
  /** TD-ONNX-02 — frees the native session (long-lived process teardown). */
  release(): Promise<void>;
  /** TD-ONNX-03 — model I/O contract, validated post-create. */
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
}

interface OnnxNamedTensor {
  /** `unknown` because onnxruntime-common types it so — narrowed in extractEmbedding. */
  data: unknown;
  dims?: readonly number[];
}

export class SiglipOnnxAdapter implements EmbeddingsPort {
  private readonly modelPath: string;
  private readonly timeoutMs: number;

  /**
   * Nullable so a rejected promise is dropped (next encode retries). Without
   * this, a transient FS error would permanently break the adapter.
   */
  private sessionPromise: Promise<OnnxInferenceSession> | null = null;

  public constructor(opts: SiglipOnnxAdapterOptions) {
    this.modelPath = opts.modelPath;
    this.timeoutMs = opts.timeoutMs;
  }

  /**
   * @throws {EncoderUnavailableError} session-load / run / timeout / malformed output
   */
  public async encode(input: EncodeInput): Promise<EncodeOutput> {
    // PR-14: does NOT use `fetchWithTimeout` — signal feeds `runWithTimeout`
    // wrapping `session.run` (onnxruntime API), not a `fetch` call. The helper
    // is fetch-specific (Response return type); onnxruntime exposes no fetch
    // surface, so the inline pattern stays here.
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      // Acquire runtime + session + preprocess INSIDE the try so a native
      // onnxruntime-node load failure, a missing/corrupt model, or an image
      // preprocessing error all surface as EncoderUnavailableError (→ 503
      // graceful fallback) instead of escaping as an uncaught 500. These three
      // calls previously sat OUTSIDE the try; a native-module load failure was
      // the path that produced the raw 500 on /api/chat/compare.
      const runtime = loadOnnxRuntime();
      const session = await this.acquireSession(runtime);
      const tensorData = await preprocessForSiglip(input.buffer);
      const inputTensor = new runtime.Tensor('float32', tensorData, SIGLIP_TENSOR_SHAPE);

      const outputs = await runWithTimeout(
        session.run({ [SIGLIP_INPUT_NAME]: inputTensor }),
        controller.signal,
        this.timeoutMs,
      );

      const rawVector = extractEmbedding(outputs);
      const normalised = l2Normalise(rawVector);

      return { vector: normalised, modelVersion: SIGLIP_MODEL_VERSION };
    } catch (err) {
      if (err instanceof EncoderUnavailableError) throw err;
      throw new EncoderUnavailableError(
        `SigLIP ONNX encode failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private async acquireSession(runtime: OnnxRuntimeModule): Promise<OnnxInferenceSession> {
    this.sessionPromise ??= runtime.InferenceSession.create(this.modelPath, SIGLIP_SESSION_OPTIONS)
      .then((session) => {
        // TD-ONNX-03 — fail-fast if the loaded model's I/O contract drifts from
        // what `encode()` feeds/reads. Without this, a mismatched model surfaces
        // only at the first `session.run` with an opaque native error.
        if (!session.inputNames.includes(SIGLIP_INPUT_NAME)) {
          throw new EncoderUnavailableError(
            `SigLIP ONNX model at ${this.modelPath} missing input '${SIGLIP_INPUT_NAME}' (got: ${session.inputNames.join(', ')})`,
          );
        }
        if (!session.outputNames.includes(SIGLIP_OUTPUT_NAME)) {
          throw new EncoderUnavailableError(
            `SigLIP ONNX model at ${this.modelPath} missing output '${SIGLIP_OUTPUT_NAME}' (got: ${session.outputNames.join(', ')})`,
          );
        }
        return session;
      })
      .catch((err: unknown) => {
        // Drop rejected promise so next call retries (transient FS error).
        this.sessionPromise = null;
        if (err instanceof EncoderUnavailableError) throw err;
        logger.warn('siglip_onnx_session_create_failed', {
          modelPath: this.modelPath,
          error: err instanceof Error ? err.message : String(err),
        });
        throw new EncoderUnavailableError(
          `SigLIP ONNX session create failed for ${this.modelPath}: ${
            err instanceof Error ? err.message : String(err)
          }`,
          err,
        );
      });
    return await this.sessionPromise;
  }

  /**
   * TD-ONNX-02 — release the native session + drop the cached promise so the
   * next `encode()` re-creates it. Wire into the app SIGTERM teardown so the
   * NAPI session does not leak across process restarts (also un-blocks Stryker
   * open-handle detection — see CLAUDE.md gotchas). Idempotent + fail-open.
   */
  public async shutdown(): Promise<void> {
    const pending = this.sessionPromise;
    this.sessionPromise = null;
    if (!pending) return;
    try {
      const session = await pending;
      await session.release();
    } catch (err) {
      logger.warn('siglip_onnx_session_release_failed', {
        modelPath: this.modelPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

function loadOnnxRuntime(): OnnxRuntimeModule {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic load keeps jest.mock + native-binding lazy semantics; see file-level docblock
    const mod = require('onnxruntime-node') as OnnxRuntimeModule;
    return mod;
  } catch (err) {
    throw new EncoderUnavailableError(
      `onnxruntime-node module failed to load: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}

/**
 * External race — `session.run` exposes no abort hook, so the in-flight run
 * cannot be cancelled (left to settle). `encode()` returns control to the
 * caller as soon as the deadline fires.
 */
function runWithTimeout<T>(
  runPromise: Promise<T>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      reject(new EncoderUnavailableError(`SigLIP ONNX run timed out after ${timeoutMs}ms`));
    };

    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });

    runPromise.then(
      (value) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

/** Defensive shape/dtype narrowing — onnxruntime types `data: unknown`. */
function extractEmbedding(outputs: Record<string, OnnxNamedTensor | undefined>): Float32Array {
  const tensor = outputs[SIGLIP_OUTPUT_NAME];
  if (tensor === undefined) {
    throw new EncoderUnavailableError(
      `SigLIP ONNX output missing expected key "${SIGLIP_OUTPUT_NAME}" (got: ${
        Object.keys(outputs).join(',') || '<empty>'
      })`,
    );
  }

  const data = tensor.data;
  let flat: Float32Array;
  if (data instanceof Float32Array) {
    flat = data;
  } else if (Array.isArray(data)) {
    flat = Float32Array.from(data as ArrayLike<number>);
  } else {
    throw new EncoderUnavailableError(
      `SigLIP ONNX output "${SIGLIP_OUTPUT_NAME}" has unsupported data type (${typeof data})`,
    );
  }

  if (flat.length !== EXPECTED_VECTOR_LEN) {
    throw new EncoderUnavailableError(
      `SigLIP ONNX output "${SIGLIP_OUTPUT_NAME}" has unexpected length (expected ${EXPECTED_VECTOR_LEN}, got ${flat.length})`,
    );
  }

  return flat;
}

function l2Normalise(vec: Float32Array): Float32Array {
  let sumSq = 0;
  for (const v of vec) {
    sumSq += v * v;
  }
  const norm = Math.sqrt(sumSq);
  const out = new Float32Array(vec.length);
  if (norm === 0) return out;
  for (let i = 0; i < vec.length; i += 1) {
    out[i] = (vec[i] ?? 0) / norm;
  }
  return out;
}
