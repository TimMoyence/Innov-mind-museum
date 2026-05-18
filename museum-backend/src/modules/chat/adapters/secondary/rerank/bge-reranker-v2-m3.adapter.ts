/**
 * BAAI/bge-reranker-v2-m3 ONNX cross-encoder reranker (C9.13). Multilingual
 * XLM-RoBERTa-base classifier outputting a single relevance logit per
 * `(query, doc)` pair; sigmoid → score in [0, 1]. Supports FR/EN/IT/ES/AR/JP
 * with a shared SentencePiece BPE vocab (~250k tokens, byte-fallback).
 *
 * V1 scope (this run): scaffold only. Constructor stores `{ modelPath,
 * timeoutMs }`; `rerank()` throws {@link RerankerUnavailableError} with a
 * forward-pointer to C9.13.1. The lazy `sessionPromise` slot mirroring
 * `SiglipOnnxAdapter` lands with V2 (no point storing an unused field in
 * V1 — drives a lint warning and adds no contract value).
 *
 * Honest V1 deferral (UFR-013, spec §2): bge-reranker-v2-m3 uses XLM-RoBERTa
 * SentencePiece tokenization. The project's allowed dep set excludes
 * `@huggingface/transformers` (explicit user constraint), and only
 * `onnxruntime-node` is available for inference. Implementing the
 * SentencePiece BPE encoder in pure JS is a ≥1-day project on its own and
 * carries a silent-corruption risk on any tokenizer bug (model still returns
 * valid-shaped logits, just with garbage relevance). V1 ships the contract +
 * fail-open plumbing + benchmark scaffold; V2 (C9.13.1) lands the tokenizer
 * + the real `session.run({input_ids, attention_mask})` loop. The production
 * default `env.rerank.provider='null'` selects {@link NullRerankerAdapter},
 * so V1 ships zero behavior change.
 *
 * Tests mock `onnxruntime-node` via `jest.mock(...)` — `require()` (not
 * static import) keeps mock hoisting + native-binding-lazy semantics. The
 * scaffold does NOT call `require()` yet because V1 short-circuits before
 * any session work; V2 will mirror the SigLIP loader.
 */

import {
  RerankerUnavailableError,
  type RerankResult,
  type RerankerPort,
} from '@modules/chat/domain/ports/reranker.port';

export interface BgeRerankerV2M3AdapterOptions {
  /** Path to the bge-reranker-v2-m3 ONNX bundle. Resolved at session-create time (V2). */
  modelPath: string;
  /** Hard deadline in ms for inference; abort → {@link RerankerUnavailableError} (V2). */
  timeoutMs: number;
}

export class BgeRerankerV2M3Adapter implements RerankerPort {
  private readonly modelPath: string;
  private readonly timeoutMs: number;

  public constructor(opts: BgeRerankerV2M3AdapterOptions) {
    this.modelPath = opts.modelPath;
    this.timeoutMs = opts.timeoutMs;
  }

  /**
   * @throws {RerankerUnavailableError} always in V1 — SentencePiece BPE
   *         tokenizer not yet implemented (see file-level docblock).
   *         V2 (C9.13.1) replaces this with the real inference loop.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- contract requires Promise return; V1 short-circuits before any async work
  public async rerank(_query: string, _docs: string[], _topN: number): Promise<RerankResult[]> {
    // V1 marker — see file docblock + spec §2 "Honest scope statement".
    // V2 (C9.13.1) will replace this throw with:
    //   1. lazy session.create(this.modelPath)
    //   2. SentencePiece BPE tokenize(query + doc) per candidate
    //   3. session.run({ input_ids, attention_mask }) with AbortSignal.timeout(this.timeoutMs)
    //   4. sigmoid(logit) → score, sort desc, slice topN
    throw new RerankerUnavailableError(
      `bge-reranker-v2-m3 tokenizer not implemented (V2: C9.13.1) [modelPath=${this.modelPath}, timeoutMs=${this.timeoutMs}]`,
    );
  }
}
