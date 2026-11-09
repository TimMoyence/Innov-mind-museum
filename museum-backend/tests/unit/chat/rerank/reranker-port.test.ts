import type { RerankResult, RerankerPort } from '@modules/chat/domain/ports/reranker.port';

describe('RerankerPort (contract — C9.13)', () => {
  it('typecheck: a class implementing RerankerPort compiles', async () => {
    class MockRerankerAdapter implements RerankerPort {
      async rerank(_query: string, docs: string[], topN: number): Promise<RerankResult[]> {
        return docs
          .slice(0, topN)
          .map((_doc, i) => ({ docIndex: i, score: 1 - i / Math.max(docs.length, 1) }));
      }
    }

    const adapter: RerankerPort = new MockRerankerAdapter();
    const results = await adapter.rerank('q', ['a', 'b', 'c'], 2);

    expect(results).toHaveLength(2);
    expect(results[0]?.docIndex).toBe(0);
    expect(results[0]?.score).toBeGreaterThanOrEqual(0);
    expect(results[0]?.score).toBeLessThanOrEqual(1);
    expect(results[1]?.docIndex).toBe(1);
  });

  it('output items must reference valid input indices', async () => {
    class MockRerankerAdapter implements RerankerPort {
      async rerank(_query: string, docs: string[], topN: number): Promise<RerankResult[]> {
        return [{ docIndex: docs.length - 1, score: 0.95 }].slice(0, topN);
      }
    }

    const adapter = new MockRerankerAdapter();
    const docs = ['a', 'b', 'c'];
    const results = await adapter.rerank('q', docs, 1);

    expect(results[0]?.docIndex).toBeGreaterThanOrEqual(0);
    expect(results[0]?.docIndex).toBeLessThan(docs.length);
  });
});
