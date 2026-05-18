/**
 * RED — C9.13 — `KnowledgeRouterService` rerank phase is fail-open.
 *
 * Contract:
 *  - When reranker returns a valid permutation of webResults, KR's facts
 *    SHALL reflect the rerank order.
 *  - When reranker throws (`RerankerUnavailableError`) or times out, KR
 *    SHALL preserve the baseline order (webResults.slice(0, MAX_WEB_FACTS)).
 *  - In the throw case, `musaium_rerank_fallback_total{caller='knowledge-router'}`
 *    SHALL increment.
 *
 * SUT depends on the new `RerankerPort` dep + `rerank` integration in
 * `runWebSearchLeg`. RED until Phase 4.1 lands.
 */

import { KnowledgeRouterService } from '@modules/chat/useCase/knowledge/knowledge-router.service';
import {
  RerankerUnavailableError,
  type RerankResult,
  type RerankerPort,
} from '@modules/chat/domain/ports/reranker.port';

import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
} from '@modules/chat/domain/ports/knowledge-base.port';
import type { LlmJudgePort } from '@modules/chat/useCase/llm/llm-judge-guardrail';
import type { SearchResult, WebSearchProvider } from '@modules/chat/domain/ports/web-search.port';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const makeSearchResult = (i: number): SearchResult => ({
  url: `https://example.org/r${i}`,
  title: `Result ${i}`,
  snippet: `Snippet body ${i}`,
});

interface Deps {
  kb: jest.Mocked<KnowledgeBaseProvider>;
  ws: jest.Mocked<WebSearchProvider>;
  judge: jest.Mocked<LlmJudgePort>;
  reranker: jest.Mocked<RerankerPort>;
  service: KnowledgeRouterService;
}

const defaultConfig = {
  threshold: 0.7,
  kbTimeoutMs: 200,
  judgeTimeoutMs: 500,
  wsTimeoutMs: 1500,
  rerankTimeoutMs: 800,
};

const makeService = (): Deps => {
  const kb = {
    lookup: jest.fn().mockResolvedValue(null as ArtworkFacts | null),
  } as unknown as jest.Mocked<KnowledgeBaseProvider>;
  const ws = { search: jest.fn() } as unknown as jest.Mocked<WebSearchProvider>;
  const judge = {
    evaluate: jest.fn().mockResolvedValue({ confidence: 0, decision: 'review' as const }),
  } as unknown as jest.Mocked<LlmJudgePort>;
  const reranker = { rerank: jest.fn() } as unknown as jest.Mocked<RerankerPort>;

  const service = new KnowledgeRouterService({
    kb,
    ws,
    judge,
    reranker,
    config: defaultConfig,
  });
  return { kb, ws, judge, reranker, service };
};

describe('KnowledgeRouterService — rerank fail-open (C9.13)', () => {
  it('reorders webResults when reranker returns a valid permutation', async () => {
    const { ws, reranker, service } = makeService();
    const results = [0, 1, 2, 3, 4].map((i) => makeSearchResult(i));
    ws.search.mockResolvedValueOnce(results);
    // Reranker reverses the order: pick index 4 then 3 then 2 then 1 then 0.
    const rerankReturn: RerankResult[] = [
      { docIndex: 4, score: 0.95 },
      { docIndex: 3, score: 0.9 },
      { docIndex: 2, score: 0.7 },
      { docIndex: 1, score: 0.5 },
      { docIndex: 0, score: 0.2 },
    ];
    reranker.rerank.mockResolvedValueOnce(rerankReturn);

    const out = await service.resolve('mona lisa');

    expect(out.source).toBe('web');
    expect(out.facts[0]).toContain('Result 4');
    expect(out.facts[1]).toContain('Result 3');
    expect(reranker.rerank).toHaveBeenCalledTimes(1);
  });

  it('falls back to baseline order when reranker throws RerankerUnavailableError', async () => {
    const { ws, reranker, service } = makeService();
    const results = [0, 1, 2, 3, 4].map((i) => makeSearchResult(i));
    ws.search.mockResolvedValueOnce(results);
    reranker.rerank.mockRejectedValueOnce(
      new RerankerUnavailableError('disabled by configuration'),
    );

    const out = await service.resolve('mona lisa');

    expect(out.source).toBe('web');
    expect(out.facts[0]).toContain('Result 0'); // baseline preserved
    expect(out.facts[1]).toContain('Result 1');
  });

  it('does not call reranker when webResults.length <= 1', async () => {
    const { ws, reranker, service } = makeService();
    ws.search.mockResolvedValueOnce([makeSearchResult(0)]);

    await service.resolve('mona lisa');

    expect(reranker.rerank).not.toHaveBeenCalled();
  });
});
