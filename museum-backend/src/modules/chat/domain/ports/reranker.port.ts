/**
 * Cross-encoder rerank step for the chat retrieval pipelines (C9.13). The port
 * is consumed by both {@link KnowledgeRouterService.runWebSearchLeg} (re-orders
 * WebSearch results before slicing to `MAX_WEB_FACTS`) and
 * {@link VisualSimilarityService.compare} (re-orders top-K candidates when an
 * optional `queryText` is provided).
 *
 * The contract is fail-CLOSED on adapter side, fail-OPEN on caller side: any
 * infra issue (cold start, native module missing, timeout, malformed output,
 * not-yet-implemented tokenizer) maps to {@link RerankerUnavailableError}. The
 * two call sites catch this and fall back to the pre-rerank baseline ordering
 * (same pattern as {@link EncoderUnavailableError} in `embeddings.port.ts`).
 *
 * V1 (this run) ships:
 *  - the port,
 *  - a {@link NullRerankerAdapter} (production default, always throws
 *    "disabled by configuration"),
 *  - a `BgeRerankerV2M3Adapter` scaffold (constructor + sessionPromise slot;
 *    `rerank()` throws pointing at C9.13.1 because SentencePiece BPE
 *    tokenization is not yet implemented in the project's allowed dep set —
 *    only `onnxruntime-node` is available, `@huggingface/transformers` is
 *    explicitly excluded).
 *
 * V2 (C9.13.1) replaces the scaffold throw with real ONNX inference.
 */

/**
 * Single reranked entry. `docIndex` points back into the caller's input
 * `docs[]` array so the caller can recover its original mapping (e.g. join
 * back onto a `SearchResult` or `CompareMatch`).
 */
export interface RerankResult {
  /** Index into the caller-provided `docs[]` array. */
  docIndex: number;
  /** Sigmoid-of-logit relevance score in [0, 1]; higher = more relevant. */
  score: number;
}

/**
 * Raised when the reranker cannot serve (model not loaded, ONNX session
 * failure, timeout, tokenizer not yet implemented). Callers MUST catch and
 * fall back to the baseline ordering — propagating this error to the user
 * would break the chat pipeline, which is unacceptable per spec NFR
 * "fail-open mandatory".
 *
 * Prototype chain restored explicitly so `instanceof` survives the TS
 * `extends Error` down-level transpile (mirror `EncoderUnavailableError`).
 */
export class RerankerUnavailableError extends Error {
  public readonly cause?: unknown;

  public constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'RerankerUnavailableError';
    this.cause = cause;
    Object.setPrototypeOf(this, RerankerUnavailableError.prototype);
  }
}

/**
 * Re-orders `docs` against `query` via a cross-encoder model. Returns the
 * top-`topN` entries by descending score.
 *
 * Implementations MUST:
 *  - never return more than `topN` items;
 *  - never return a `docIndex` outside `[0, docs.length)`;
 *  - throw {@link RerankerUnavailableError} on any infra failure (do NOT
 *    return a partial / empty result silently — callers rely on the throw
 *    to trigger the fail-open path).
 */
export interface RerankerPort {
  rerank(query: string, docs: string[], topN: number): Promise<RerankResult[]>;
}
