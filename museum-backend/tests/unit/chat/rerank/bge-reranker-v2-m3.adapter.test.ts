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
