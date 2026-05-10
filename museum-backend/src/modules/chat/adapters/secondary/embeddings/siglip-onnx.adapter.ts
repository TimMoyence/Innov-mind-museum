/**
 * SigLIP ONNX embeddings adapter (default `EmbeddingsPort` impl).
 *
 * Runs the SigLIP-base-patch16-224 image encoder locally on top of
 * `onnxruntime-node` (CPU, NAPI binding). This is the primary path documented
 * in design §3 / §9 D3 — the Replicate adapter (`replicate.adapter.ts`) is
 * the hosted fallback (R8) when the local runtime is unavailable.
 *
 * Wire flow per `encode()`:
 *   1. Lazily `InferenceSession.create(modelPath)` once per process — the
 *      session is cached at module level so a hot path with thousands of
 *      images amortises the ~hundreds-of-MB model load to a single hit.
 *   2. Run the T4.1 preprocess (`preprocessForSiglip`) to get the 150528-long
 *      NCHW float32 tensor data ([1,3,224,224], range ~[-1,1]).
 *   3. Wrap the data in `new Tensor('float32', data, [1, 3, 224, 224])` and
 *      `await session.run({ pixel_values: tensor })` under an
 *      `AbortSignal`-backed deadline derived from `timeoutMs`.
 *   4. Extract `image_embeds` (the SigLIP image-projection output, 768-d),
 *      L2-normalise (repository search assumes inner-product == cosine), and
 *      return alongside the pinned `siglip-base-patch16-224@v1` modelVersion.
 *
 * Error mapping → {@link EncoderUnavailableError}:
 *   - `InferenceSession.create` throws (model file missing, AVX2 missing,
 *     binding load failure, …).
 *   - `session.run` throws (shape mismatch, runtime crash).
 *   - Timeout deadline fires (AbortSignal aborts).
 *   - `image_embeds` output missing or malformed.
 *
 * Tests mock `onnxruntime-node` via `jest.mock(...)` — the dynamic
 * `require('onnxruntime-node')` below stays in sync with how the existing
 * `replicate.adapter.test.ts` mocks `global.fetch`, and avoids a top-level
 * native binding load when this module is imported by other unit tests
 * (e.g. `embeddings.factory.test.ts`).
 */

import {
  EncoderUnavailableError,
  type EmbeddingsPort,
  type EncodeInput,
  type EncodeOutput,
} from '@modules/chat/domain/ports/embeddings.port';
import { logger } from '@shared/logger/logger';

import { preprocessForSiglip } from './image-preprocess';

/**
 * Pinned SigLIP model identifier — surfaced as
 * {@link EncodeOutput.modelVersion} on every successful encode. Persisted
 * alongside the embedding so future model upgrades can detect stale rows.
 */
const SIGLIP_MODEL_VERSION = 'siglip-base-patch16-224@v1';

/** ONNX input feed name expected by the SigLIP-base-patch16-224 graph. */
const SIGLIP_INPUT_NAME = 'pixel_values';

/** ONNX output name carrying the 768-d image embedding. */
const SIGLIP_OUTPUT_NAME = 'image_embeds';

/** Output dimensionality of SigLIP-base. */
const EXPECTED_VECTOR_LEN = 768;

/** Tensor shape consumed by the SigLIP encoder: NCHW, batch 1, RGB, 224×224. */
const SIGLIP_TENSOR_SHAPE: readonly number[] = [1, 3, 224, 224];

// Session cache is held per-adapter-instance (see `SiglipOnnxAdapter#sessionPromise`).
// Composition-root wiring builds the adapter once per process, so a single
// adapter instance for the lifetime of the API server keeps the loaded
// SigLIP model resident across every encode() call. Per-instance scoping
// (rather than a module-level Map keyed on modelPath) keeps the cache cleanly
// tied to the adapter's lifecycle — destroying the adapter releases the
// session for GC, and unit tests that rebuild the adapter between specs see
// fresh `InferenceSession.create` calls (a module-scoped cache would retain
// a stale promise resolved against a now-reset jest mock).

/** Constructor options for {@link SiglipOnnxAdapter}. */
export interface SiglipOnnxAdapterOptions {
  /**
   * Filesystem path (relative or absolute) to the SigLIP `.onnx` model. Loaded
   * lazily on the first `encode()` call and cached at module level.
   */
  modelPath: string;
  /**
   * Hard deadline for `encode()` (`session.run`). Exceeding it aborts the run
   * and throws {@link EncoderUnavailableError}.
   */
  timeoutMs: number;
}

/**
 * Minimal structural shape we need from the dynamically-required
 * `onnxruntime-node` module. Declared locally instead of importing the real
 * types because the runtime is loaded via `require()` to keep tests
 * `jest.mock()`-friendly and to avoid pulling the native binding into
 * unrelated unit-test processes.
 */
interface OnnxRuntimeModule {
  InferenceSession: {
    create: (modelPath: string) => Promise<OnnxInferenceSession>;
  };
  Tensor: new (type: 'float32', data: Float32Array, dims: readonly number[]) => OnnxTensor;
}

/** Minimal Tensor surface — opaque value container the runtime understands. */
interface OnnxTensor {
  type: string;
  data: unknown;
  dims: readonly number[];
}

/** Minimal InferenceSession surface — only `run()` is exercised. */
interface OnnxInferenceSession {
  run(feeds: Record<string, OnnxTensor>): Promise<Record<string, OnnxNamedTensor | undefined>>;
}

/**
 * Output tensor as exposed by `onnxruntime-node`. The underlying buffer is a
 * `Float32Array` for `float32` outputs but the type definition exposes the
 * loosest contract so we narrow defensively when extracting `image_embeds`.
 */
interface OnnxNamedTensor {
  /**
   * Loose-typed because `onnxruntime-common` exposes `OnnxValue.data` as
   * `unknown` — we narrow defensively at the call site (see `extractEmbedding`).
   */
  data: unknown;
  dims?: readonly number[];
}

/**
 * Adapter implementing {@link EmbeddingsPort} on top of `onnxruntime-node`.
 */
export class SiglipOnnxAdapter implements EmbeddingsPort {
  private readonly modelPath: string;
  private readonly timeoutMs: number;

  /**
   * Lazily-resolved InferenceSession. Built on the first `encode()` call and
   * reused for every subsequent one — the SigLIP model is hundreds of MB so
   * this caching is what makes the encoder hot-path cheap.
   *
   * Marked nullable + assignable so we can re-attempt session creation after
   * a transient failure (the rejected promise is dropped from the field so
   * the next `encode()` retries instead of being permanently broken).
   */
  private sessionPromise: Promise<OnnxInferenceSession> | null = null;

  /**
   * Builds the adapter. The InferenceSession is NOT loaded here — first
   * `encode()` triggers `InferenceSession.create`.
   *
   * @param opts - Model file path + per-call timeout budget.
   */
  public constructor(opts: SiglipOnnxAdapterOptions) {
    this.modelPath = opts.modelPath;
    this.timeoutMs = opts.timeoutMs;
  }

  /**
   * Encodes an image into a 768-dim L2-normalised SigLIP vector.
   *
   * @param input - Buffer + validated MIME type (already EXIF-stripped upstream).
   * @returns L2-normalised Float32Array + pinned `siglip-base-patch16-224@v1` modelVersion.
   * @throws {EncoderUnavailableError} On session-load failure, run failure,
   *         malformed output, or timeout.
   */
  public async encode(input: EncodeInput): Promise<EncodeOutput> {
    const runtime = loadOnnxRuntime();
    const session = await this.acquireSession(runtime);

    const tensorData = await preprocessForSiglip(input.buffer);
    const inputTensor = new runtime.Tensor('float32', tensorData, SIGLIP_TENSOR_SHAPE);

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
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

  /**
   * Returns the cached session, creating it on first use. The InferenceSession
   * is built once per adapter instance — the test asserts exactly one
   * `create()` across two encodes on the same adapter.
   */
  private async acquireSession(runtime: OnnxRuntimeModule): Promise<OnnxInferenceSession> {
    this.sessionPromise ??= runtime.InferenceSession.create(this.modelPath).catch(
      (err: unknown) => {
        // Drop the rejected promise so a future call can retry (e.g. transient
        // FS error) instead of being permanently broken.
        this.sessionPromise = null;
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
      },
    );
    return await this.sessionPromise;
  }
}

/**
 * Dynamically loads `onnxruntime-node`. `require()` (rather than a static
 * `import`) so that:
 *   - `jest.mock('onnxruntime-node', ...)` resolves correctly without ESM
 *     hoisting surprises,
 *   - importing this module from contexts that don't actually call `encode()`
 *     (e.g. composition-root wiring, unrelated unit tests) doesn't trigger
 *     the native binding load.
 */
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
 * Races a session.run promise against an AbortSignal-backed deadline. The
 * runtime exposes no native abort hook on `session.run`, so the timeout is
 * implemented as an external race — the in-flight run is left to settle on
 * its own (it cannot be cancelled), but `encode()` returns control to the
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
      reject(
        new EncoderUnavailableError(
          `SigLIP ONNX run timed out after ${timeoutMs}ms`,
        ),
      );
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

/**
 * Extracts the 768-d image embedding from an ONNX run output. Defensive about
 * shape/dtype because the runtime types are loose (`OnnxValue.data: unknown`)
 * and a future model swap could change the output name.
 */
function extractEmbedding(
  outputs: Record<string, OnnxNamedTensor | undefined>,
): Float32Array {
  const tensor = outputs[SIGLIP_OUTPUT_NAME];
  if (tensor === undefined) {
    throw new EncoderUnavailableError(
      `SigLIP ONNX output missing expected key "${SIGLIP_OUTPUT_NAME}" (got: ${Object.keys(
        outputs,
      ).join(',') || '<empty>'})`,
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
      `SigLIP ONNX output "${SIGLIP_OUTPUT_NAME}" has unsupported data type (${
        typeof data
      })`,
    );
  }

  if (flat.length !== EXPECTED_VECTOR_LEN) {
    throw new EncoderUnavailableError(
      `SigLIP ONNX output "${SIGLIP_OUTPUT_NAME}" has unexpected length (expected ${EXPECTED_VECTOR_LEN}, got ${flat.length})`,
    );
  }

  return flat;
}

/** L2-normalises a Float32Array vector (zero-vector → zero) into a fresh Float32Array. */
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
