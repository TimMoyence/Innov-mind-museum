/**
 * Domain port for the visual-embedding step of the compare pipeline.
 *
 * Implementations turn a raw image buffer into an L2-normalised vector
 * suitable for the pgvector HNSW index (`halfvec_ip_ops`). The default
 * adapter is SigLIP-base-patch16-224 served from ONNX Runtime on CPU
 * (`siglip-onnx`); a Replicate-hosted adapter exists as a fallback (see
 * design §9 D3 / D6).
 */

/** Image MIME types accepted by the embeddings pipeline. */
export type EmbeddingImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

/** Input to {@link EmbeddingsPort.encode}. */
export interface EncodeInput {
  /** Raw image bytes — already EXIF-stripped + magic-byte validated upstream. */
  buffer: Buffer;
  /** Validated MIME type. The adapter must reject anything else. */
  mimeType: EmbeddingImageMimeType;
}

/** Output of {@link EmbeddingsPort.encode}. */
export interface EncodeOutput {
  /**
   * L2-normalised embedding vector. Length is fixed by the model
   * (`EMBEDDINGS_DIM`, currently 768 for SigLIP-base).
   *
   * `Float32Array` (not `number[]`) so we keep zero-copy semantics with
   * ONNX Runtime tensors and avoid a JSON round-trip on the hot path.
   */
  vector: Float32Array;
  /**
   * Identifier of the model + version that produced the vector
   * (e.g. `"siglip-base-patch16-224@v1"`). Persisted next to the embedding
   * so future model upgrades can detect stale rows.
   */
  modelVersion: string;
}

/**
 * Port wrapping the visual encoder. Implementations MUST be deterministic
 * for a given (buffer, model version) pair and MUST L2-normalise the output
 * vector — repository search assumes inner-product == cosine.
 */
export interface EmbeddingsPort {
  /**
   * Encodes an image into a normalised SigLIP embedding.
   *
   * @param input - Image buffer and MIME type.
   * @throws {EncoderUnavailableError} when the underlying model cannot serve
   *         the request (cold start failure, timeout, AVX2 missing, hosted
   *         provider 5xx, etc.). Callers map this to a `503 COMPARE_ENCODER_UNAVAILABLE`.
   */
  encode(input: EncodeInput): Promise<EncodeOutput>;
}

/**
 * Thrown by {@link EmbeddingsPort.encode} when the encoder is unavailable.
 *
 * The prototype chain is restored explicitly so `instanceof` keeps working
 * after the TS `extends Error` down-level transpile (TS handbook,
 * "Built-in classes that extend Error / Array / Map may no longer work").
 *
 * @see https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html#extending-built-ins-like-error-array-and-map-may-no-longer-work
 */
export class EncoderUnavailableError extends Error {
  /**
   * Constructs an EncoderUnavailableError with a logged-only reason and an
   * optional underlying cause for diagnostics.
   *
   * @param message - Human-readable reason (logged, never returned to the user verbatim).
   * @param cause   - Optional underlying error for traceability.
   */
  public constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'EncoderUnavailableError';
    this.cause = cause;
    // Restore prototype chain — required for cross-realm `instanceof` after transpile.
    Object.setPrototypeOf(this, EncoderUnavailableError.prototype);
  }
}
