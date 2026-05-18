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
import { getLangfuse } from '@shared/observability/langfuse.client';
import { rerankFallbackTotal } from '@shared/observability/prometheus-metrics';

import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
} from '@modules/chat/domain/ports/knowledge-base.port';
import type { LlmJudgePort } from '@modules/chat/useCase/llm/llm-judge-guardrail';
import type { SearchResult, WebSearchProvider } from '@modules/chat/domain/ports/web-search.port';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@shared/observability/langfuse.client', () => ({
  getLangfuse: jest.fn(() => null),
}));

const getLangfuseMock = getLangfuse as jest.MockedFunction<typeof getLangfuse>;

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

/**
 * Reads the current value of `musaium_rerank_fallback_total` filtered by the
 * given label match. Mirrors the prom-client pattern used in
 * `guardrail-budget-redis.test.ts` — assertions stay against the real
 * registry, not a hand-rolled mock.
 */
async function fallbackCounterValue(match: { caller: string; reason: string }): Promise<number> {
  const snapshot = await rerankFallbackTotal.get();
  const matched = snapshot.values.find(
    (v) => v.labels.caller === match.caller && v.labels.reason === match.reason,
  );
  return matched?.value ?? 0;
}

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
  beforeEach(() => {
    rerankFallbackTotal.reset();
    getLangfuseMock.mockReset();
    getLangfuseMock.mockReturnValue(null);
  });

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

  // R5 — telemetry side-effect must be observable: counter increments AND
  // Langfuse `chat.rerank` span is emitted with the design §10 metadata
  // contract. Mocks the real prom-client registry (no hand-rolled mock) and
  // swaps `getLangfuse()` to return a spy client.
  it('increments musaium_rerank_fallback_total{caller=knowledge-router} and emits chat.rerank span on fail-open', async () => {
    const clientTrace = jest.fn();
    const fakeClient = { trace: clientTrace };
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);

    const { ws, reranker, service } = makeService();
    const results = [0, 1, 2, 3, 4].map((i) => makeSearchResult(i));
    ws.search.mockResolvedValueOnce(results);
    reranker.rerank.mockRejectedValueOnce(
      new RerankerUnavailableError('disabled by configuration'),
    );

    const before = await fallbackCounterValue({
      caller: 'knowledge-router',
      reason: 'unavailable',
    });
    await service.resolve('mona lisa');
    const after = await fallbackCounterValue({
      caller: 'knowledge-router',
      reason: 'unavailable',
    });

    // R5/R7 acceptance — counter incremented by exactly one fail-open hit.
    expect(after - before).toBe(1);

    // R8 acceptance — `chat.rerank` span emitted with the metadata contract.
    const rerankCalls = clientTrace.mock.calls.filter(
      (call) => (call[0] as { name?: string } | undefined)?.name === 'chat.rerank',
    );
    expect(rerankCalls.length).toBe(1);
    const rerankSpanArg = rerankCalls[0]?.[0] as
      | { name: string; metadata?: Record<string, unknown> }
      | undefined;
    expect(rerankSpanArg?.name).toBe('chat.rerank');
    expect(rerankSpanArg?.metadata).toMatchObject({
      'rerank.caller': 'knowledge-router',
      'rerank.candidate_count': 5,
      'rerank.top_n': 5,
      'rerank.outcome': 'fallback',
      'rerank.reason': 'unavailable',
    });
    // queryHash = sha256(query)[:16] — design D6 PII contract.
    const queryHash = (rerankSpanArg?.metadata?.['rerank.query_hash'] as string | undefined) ?? '';
    expect(queryHash).toMatch(/^[a-f0-9]{16}$/);
    expect(queryHash).not.toContain('mona');
  });

  // R5 — distinct reason label when the cause is a timeout (synthetic abort).
  it('uses reason="timeout" when the reranker fails with a timed-out RerankerUnavailableError', async () => {
    const { ws, reranker, service } = makeService();
    const results = [0, 1, 2, 3, 4].map((i) => makeSearchResult(i));
    ws.search.mockResolvedValueOnce(results);
    reranker.rerank.mockRejectedValueOnce(
      new RerankerUnavailableError('rerank timed out after 800ms'),
    );

    const before = await fallbackCounterValue({
      caller: 'knowledge-router',
      reason: 'timeout',
    });
    await service.resolve('mona lisa');
    const after = await fallbackCounterValue({
      caller: 'knowledge-router',
      reason: 'timeout',
    });

    expect(after - before).toBe(1);
  });

  it('does not call reranker when webResults.length <= 1', async () => {
    const { ws, reranker, service } = makeService();
    ws.search.mockResolvedValueOnce([makeSearchResult(0)]);

    await service.resolve('mona lisa');

    expect(reranker.rerank).not.toHaveBeenCalled();
  });
});
