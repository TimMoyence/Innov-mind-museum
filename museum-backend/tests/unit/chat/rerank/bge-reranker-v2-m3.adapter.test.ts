/**
 * RED — C9.13 — `BgeRerankerV2M3Adapter` scaffold (V1).
 *
 * V1 contract: constructor stores `{ modelPath, timeoutMs }` opts without
 * throwing; `rerank()` throws `RerankerUnavailableError` with a message
 * pointing to V2 (C9.13.1) since SentencePiece tokenization is not yet
 * implemented in the project's allowed dep set (`onnxruntime-node` only,
 * no `@huggingface/transformers`).
 *
 * V2 follow-up will replace the throw with real ONNX inference; this RED
 * test will then need updating (covered in C9.13.1 spec).
 *
 * SUT does not yet exist.
 */

import { RerankerUnavailableError } from '@modules/chat/domain/ports/reranker.port';
import { BgeRerankerV2M3Adapter } from '@modules/chat/adapters/secondary/rerank/bge-reranker-v2-m3.adapter';

describe('BgeRerankerV2M3Adapter (V1 scaffold — C9.13)', () => {
  it('constructor accepts modelPath + timeoutMs without throwing', () => {
    expect(
      () =>
        new BgeRerankerV2M3Adapter({
          modelPath: './models/bge-reranker-v2-m3.onnx',
          timeoutMs: 2000,
        }),
    ).not.toThrow();
  });

  it('rerank() throws RerankerUnavailableError (V1 — inference deferred to C9.13.1)', async () => {
    const adapter = new BgeRerankerV2M3Adapter({
      modelPath: './models/bge-reranker-v2-m3.onnx',
      timeoutMs: 2000,
    });

    await expect(adapter.rerank('q', ['a', 'b'], 2)).rejects.toBeInstanceOf(
      RerankerUnavailableError,
    );
  });

  it('rerank() error message forward-points to V2 (C9.13.1)', async () => {
    const adapter = new BgeRerankerV2M3Adapter({
      modelPath: './models/bge-reranker-v2-m3.onnx',
      timeoutMs: 2000,
    });

    await expect(adapter.rerank('q', ['a'], 1)).rejects.toThrow(/V2|C9\.13\.1/);
  });
});
