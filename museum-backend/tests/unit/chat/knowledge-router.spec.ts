import { RerankerUnavailableError } from '@modules/chat/domain/ports/reranker.port';
import { KnowledgeRouterService } from '@modules/chat/useCase/knowledge/knowledge-router.service';

import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
} from '@modules/chat/domain/ports/knowledge-base.port';
import type { RerankerPort } from '@modules/chat/domain/ports/reranker.port';
import type { LlmJudgePort, LlmJudgeResult } from '@modules/chat/useCase/llm/llm-judge-guardrail';
import type { SearchResult, WebSearchProvider } from '@modules/chat/domain/ports/web-search.port';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const makeFacts = (overrides: Partial<ArtworkFacts> = {}): ArtworkFacts => ({
  qid: 'Q12418',
  title: 'Mona Lisa',
  artist: 'Leonardo da Vinci',
  date: 'c. 1503',
  ...overrides,
});

const makeJudgeResult = (overrides: Partial<LlmJudgeResult> = {}): LlmJudgeResult => ({
  confidence: 0.9,
  decision: 'allow',
  ...overrides,
});

const makeSearchResult = (overrides: Partial<SearchResult> = {}): SearchResult => ({
  url: 'https://example.org/mona-lisa',
  title: 'Mona Lisa overview',
  snippet: 'A celebrated 16th-century portrait painting.',
  ...overrides,
});

interface MockedDeps {
  kb: jest.Mocked<KnowledgeBaseProvider>;
  ws: jest.Mocked<WebSearchProvider>;
  judge: jest.Mocked<LlmJudgePort>;
  service: KnowledgeRouterService;
}

const defaultConfig = {
  threshold: 0.7,
  kbTimeoutMs: 200,
  judgeTimeoutMs: 500,
  wsTimeoutMs: 1500,
  rerankTimeoutMs: 800,
};

const makeService = (config: Partial<typeof defaultConfig> = {}): MockedDeps => {
  const kb = { lookup: jest.fn() } as unknown as jest.Mocked<KnowledgeBaseProvider>;
  const ws = { search: jest.fn() } as unknown as jest.Mocked<WebSearchProvider>;
  const judge = { evaluate: jest.fn() } as unknown as jest.Mocked<LlmJudgePort>;
  const reranker: jest.Mocked<RerankerPort> = {
    rerank: jest
      .fn()
      .mockRejectedValue(new RerankerUnavailableError('reranker disabled by configuration')),
  };

  const service = new KnowledgeRouterService({
    kb,
    ws,
    judge,
    reranker,
    config: { ...defaultConfig, ...config },
  });

  return { kb, ws, judge, service };
};

describe('KnowledgeRouterService — web pages become citable sources', () => {
  it('turns each web result the facts came from into a source', async () => {
    const { kb, ws, judge, service } = makeService();
    kb.lookup.mockResolvedValueOnce(null);
    judge.evaluate.mockResolvedValueOnce(makeJudgeResult({ confidence: 0.3 }));
    ws.search.mockResolvedValueOnce([
      makeSearchResult(),
      makeSearchResult({ url: 'not a url' }),
      makeSearchResult({ url: 'https://example.org/short', snippet: 'Too short' }),
    ]);

    const result = await service.resolve('obscure artist');

    expect(result.sources).toEqual([
      {
        url: 'https://example.org/mona-lisa',
        type: 'web',
        title: 'Mona Lisa overview',
        quote: 'A celebrated 16th-century portrait painting.',
      },
    ]);
  });

  it('has no source when the knowledge base answered', async () => {
    const { kb, service } = makeService();
    kb.lookup.mockResolvedValueOnce(makeFacts());

    const result = await service.resolve('Mona Lisa');

    expect(result.sources).toEqual([]);
  });
});

describe('KnowledgeRouterService — cascade KB → judge → WebSearch', () => {
  it('returns source="wikidata" and fallback_triggered=false when KB hits', async () => {
    const { kb, ws, judge, service } = makeService();
    kb.lookup.mockResolvedValueOnce(
      makeFacts({
        artist: 'Leonardo da Vinci',
        date: 'c. 1503',
        technique: 'Oil on poplar panel',
        collection: 'Louvre Museum',
        movement: 'High Renaissance',
        genre: 'portrait',
      }),
    );

    const result = await service.resolve('Mona Lisa');

    expect(result.source).toBe('wikidata');
    expect(result.fallback_triggered).toBe(false);
    expect(result.facts.length).toBeGreaterThanOrEqual(7);
    expect(result.facts.some((f) => f.includes('Mona Lisa'))).toBe(true);
    expect(result.facts.some((f) => f.includes('Leonardo'))).toBe(true);
    expect(judge.evaluate).not.toHaveBeenCalled();
    expect(ws.search).not.toHaveBeenCalled();
    expect(result.metadata?.latencyMs.kb).toBeGreaterThanOrEqual(0);
    expect(result.metadata?.latencyMs.judge).toBeUndefined();
    expect(result.metadata?.latencyMs.web).toBeUndefined();
    expect(result.metadata?.searchTerm).toBe('Mona Lisa');
  });

  it('formats minimal KB facts with no optional fields', async () => {
    const { kb, service } = makeService();
    kb.lookup.mockResolvedValueOnce({ qid: 'Q12418', title: 'Mona Lisa' });

    const result = await service.resolve('Mona Lisa');

    expect(result.source).toBe('wikidata');
    expect(result.facts.length).toBe(1);
    expect(result.facts[0]).toContain('Q12418');
  });

  it('returns source="none" fallback_triggered=false when judge is confident', async () => {
    const { kb, ws, judge, service } = makeService();
    kb.lookup.mockResolvedValueOnce(null);
    judge.evaluate.mockResolvedValueOnce(makeJudgeResult({ confidence: 0.85 }));

    const result = await service.resolve('vague art term');

    expect(result.source).toBe('none');
    expect(result.fallback_triggered).toBe(false);
    expect(result.facts).toEqual([]);
    expect(result.judge_confidence).toBe(0.85);
    expect(ws.search).not.toHaveBeenCalled();
    expect(result.metadata?.latencyMs.judge).toBeGreaterThanOrEqual(0);
    expect(result.metadata?.latencyMs.web).toBeUndefined();
  });

  it('returns source="web" fallback_triggered=true when WebSearch returns results', async () => {
    const { kb, ws, judge, service } = makeService();
    kb.lookup.mockResolvedValueOnce(null);
    judge.evaluate.mockResolvedValueOnce(makeJudgeResult({ confidence: 0.3 }));
    ws.search.mockResolvedValueOnce([
      makeSearchResult(),
      makeSearchResult({ url: 'https://example.org/2' }),
    ]);

    const result = await service.resolve('obscure artist');

    expect(result.source).toBe('web');
    expect(result.fallback_triggered).toBe(true);
    expect(result.facts.length).toBeGreaterThan(0);
    expect(result.judge_confidence).toBe(0.3);
    expect(ws.search).toHaveBeenCalledTimes(1);
    expect(result.metadata?.latencyMs.web).toBeGreaterThanOrEqual(0);
  });

  it('fails open with source="none" fallback_triggered=true when WebSearch throws', async () => {
    const { kb, ws, judge, service } = makeService();
    kb.lookup.mockResolvedValueOnce(null);
    judge.evaluate.mockResolvedValueOnce(makeJudgeResult({ confidence: 0.2 }));
    ws.search.mockRejectedValueOnce(new Error('WS_TIMEOUT'));

    const result = await service.resolve('something that fails');

    expect(result.source).toBe('none');
    expect(result.fallback_triggered).toBe(true);
    expect(result.facts).toEqual([]);
    expect(result.metadata?.latencyMs.web).toBeGreaterThanOrEqual(0);
  });

  it('returns source="none" fallback_triggered=true when WebSearch returns empty', async () => {
    const { kb, ws, judge, service } = makeService();
    kb.lookup.mockResolvedValueOnce(null);
    judge.evaluate.mockResolvedValueOnce(makeJudgeResult({ confidence: 0.1 }));
    ws.search.mockResolvedValueOnce([]);

    const result = await service.resolve('nothing matches');

    expect(result.source).toBe('none');
    expect(result.fallback_triggered).toBe(true);
    expect(result.facts).toEqual([]);
    expect(ws.search).toHaveBeenCalledTimes(1);
    expect(result.metadata?.latencyMs.web).toBeGreaterThanOrEqual(0);
  });

  it('exits gracefully without throwing when the parent signal is aborted', async () => {
    const { kb, ws, judge, service } = makeService();
    const controller = new AbortController();
    controller.abort();

    await expect(service.resolve('term', controller.signal)).resolves.toMatchObject({
      source: 'none',
      fallback_triggered: false,
      facts: [],
    });
    expect(kb.lookup).toHaveBeenCalledTimes(0);
    expect(judge.evaluate).toHaveBeenCalledTimes(0);
    expect(ws.search).toHaveBeenCalledTimes(0);
  });

  it('handles mid-cascade parent abort without bubbling the exception', async () => {
    const { kb, ws, judge, service } = makeService();
    const controller = new AbortController();

    kb.lookup.mockImplementation(async () => {
      controller.abort();
      return null;
    });
    judge.evaluate.mockResolvedValueOnce(makeJudgeResult({ confidence: 0.1 }));
    ws.search.mockResolvedValueOnce([]);

    const result = await service.resolve('term', controller.signal);

    expect(result.source).toBe('none');
  });

  it('aborts KB leg on timeout and falls through to the judge', async () => {
    const { kb, judge, service } = makeService({ kbTimeoutMs: 20 });
    kb.lookup.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(null);
          }, 200),
        ),
    );
    judge.evaluate.mockResolvedValueOnce(makeJudgeResult({ confidence: 0.9 }));

    const result = await service.resolve('slow term');

    expect(result.source).toBe('none');
    expect(result.fallback_triggered).toBe(false);
    expect(judge.evaluate).toHaveBeenCalledTimes(1);
    expect(result.metadata?.latencyMs.kb).toBeGreaterThanOrEqual(0);
  });

  it('preserves ADR-035 fail-open when KB throws — proceeds to judge', async () => {
    const { kb, ws, judge, service } = makeService();
    kb.lookup.mockRejectedValueOnce(new Error('WIKIDATA_SPARQL_DOWN'));
    judge.evaluate.mockResolvedValueOnce(makeJudgeResult({ confidence: 0.95 }));

    const result = await service.resolve('any term');

    expect(result.source).toBe('none');
    expect(result.fallback_triggered).toBe(false);
    expect(judge.evaluate).toHaveBeenCalledTimes(1);
    expect(ws.search).not.toHaveBeenCalled();
    expect(result.judge_confidence).toBe(0.95);
  });
});
