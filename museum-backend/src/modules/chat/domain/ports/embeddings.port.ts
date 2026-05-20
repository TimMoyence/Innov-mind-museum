/**
 * Visual-embedding step of the compare pipeline. Implementations turn a raw
 * image buffer into an L2-normalised vector suitable for the pgvector HNSW
 * index (`halfvec_ip_ops`). Default adapter: SigLIP-base-patch16-224 via ONNX
 * Runtime on CPU (`siglip-onnx`); Replicate-hosted adapter exists as fallback
 * (design §9 D3/D6).
 */

export type EmbeddingImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface EncodeInput {
  /** Already EXIF-stripped + magic-byte validated upstream. */
  buffer: Buffer;
  /** Adapter must reject anything else. */
  mimeType: EmbeddingImageMimeType;
}

export interface EncodeOutput {
  /**
   * L2-normalised. Length fixed by model (`EMBEDDINGS_DIM`, 768 for SigLIP-base).
   * `Float32Array` (not `number[]`) to keep zero-copy with ONNX tensors and
   * avoid JSON round-trip on hot path.
   */
  vector: Float32Array;
  /** e.g. `"siglip2-base-patch16-224@v1"`. Detects stale rows on upgrade. */
  modelVersion: string;
}

/**
 * Implementations MUST be deterministic for (buffer, model version) and MUST
 * L2-normalise output — repository search assumes inner-product == cosine.
 */
export interface EmbeddingsPort {
  /**
   * @throws {EncoderUnavailableError} when the model cannot serve (cold start
   *         failure, timeout, AVX2 missing, hosted provider 5xx). Callers map
   *         to `503 COMPARE_ENCODER_UNAVAILABLE`.
   */
  encode(input: EncodeInput): Promise<EncodeOutput>;

  /**
   * TD-ONNX-02 — optional graceful teardown. `siglip-onnx` releases the native
   * NAPI session ; HTTP-only adapters (`replicate`) have nothing to release
   * and may omit. SIGTERM path calls this via the factory's
   * `shutdownEmbeddingsAdapter()` hook. MUST be idempotent + fail-open.
   */
  shutdown?(): Promise<void>;
}

/**
 * Prototype chain restored explicitly so `instanceof` keeps working after the
 * TS `extends Error` down-level transpile.
 *
 * @see https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html#extending-built-ins-like-error-array-and-map-may-no-longer-work
 */
export class EncoderUnavailableError extends Error {
  public constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'EncoderUnavailableError';
    this.cause = cause;
    // Required for cross-realm `instanceof` after transpile.
    Object.setPrototypeOf(this, EncoderUnavailableError.prototype);
  }
}
