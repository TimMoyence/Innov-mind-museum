/**
 * C4 Phase 7 T7.1 — Langfuse `chat.knowledge.lookup` span emission.
 *
 * Asserts that `KnowledgeRouterService.resolve()` opens a Langfuse trace named
 * `chat.knowledge.lookup` via `safeTrace()`, and that the emitted metadata
 * carries the contractual attribute set defined in design §10 Observability :
 *
 *   - `knowledge.source` (wikidata | web | none)
 *   - `knowledge.fallback_triggered` (boolean)
 *   - `knowledge.judge_confidence` (number | undefined)
 *   - `knowledge.search_term_hash` — sha256(searchTerm)[:16] (NO raw PII)
 *   - `knowledge.latency_ms.kb` / `.judge` / `.web` (legs exercised)
 *
 * The test mocks `getLangfuse()` to inject a recording fake trace + client so
 * we can assert the captured `name` + `metadata` payload without standing up
 * the real Langfuse SDK. The safeTrace wrapper itself is exercised — exceptions
 * inside the trace call must not bubble into the chat path (fail-open).
 *
 * Plan : `docs/plans/2026-05-10-c4-launch-prompt.md` §K Step 7.1.
 * Spec : `team-state/2026-05-11-c4-anti-hallucination/spec.md#R12`.
 *
 * NFR7 PII safety — `searchTerm` MUST NOT appear verbatim in trace metadata.
 * Asserted in case 5 below by feeding a unique PII-shaped string and ensuring
 * it never round-trips into the captured Langfuse metadata.
 */

import { createHash } from 'node:crypto';

// Mock the langfuse client BEFORE importing the SUT so the constructor sees
// the mocked module. See `tests/unit/chat/visual-similarity/similarity.service.test.ts`
// for the canonical pattern in this repo.
jest.mock('@shared/observability/langfuse.client', () => ({
  getLangfuse: jest.fn(() => null),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- module-mock helper, identical pattern to similarity.service.test.ts
const { getLangfuse: mockGetLangfuse } = require('@shared/observability/langfuse.client') as {
  getLangfuse: jest.Mock;
};

import { RerankerUnavailableError } from '@modules/chat/domain/ports/reranker.port';
import { KnowledgeRouterService } from '@modules/chat/useCase/knowledge/knowledge-router.service';

import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
} from '@modules/chat/domain/ports/knowledge-base.port';
import type { RerankerPort } from '@modules/chat/domain/ports/reranker.port';
import type { LlmJudgePort, LlmJudgeResult } from '@modules/chat/useCase/llm/llm-judge-guardrail';
import type { SearchResult, WebSearchProvider } from '@modules/chat/domain/ports/web-search.port';

// Silence logger.
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

interface CapturedTrace {
  name: string;
  metadata: Record<string, unknown>;
}

function makeFakeTraceClient(): { traces: CapturedTrace[]; client: { trace: jest.Mock } } {
  const traces: CapturedTrace[] = [];
  const client = {
    trace: jest.fn((args: { name: string; metadata?: Record<string, unknown> }) => {
      traces.push({ name: args.name, metadata: args.metadata ?? {} });
      return { update: jest.fn() };
    }),
  };
  return { traces, client };
}

const defaultConfig = {
  threshold: 0.7,
  kbTimeoutMs: 200,
  judgeTimeoutMs: 500,
  wsTimeoutMs: 1500,
  // C9.13 — V1 default reranker is null; rerank phase fails-open to baseline.
  rerankTimeoutMs: 800,
};

function makeService(overrides: {
  kbReturn?: ArtworkFacts | null | Error;
  judgeReturn?: LlmJudgeResult | Error;
  wsReturn?: SearchResult[] | Error;
}): KnowledgeRouterService {
  const kb = {
    lookup: jest.fn().mockImplementation(async () => {
      if (overrides.kbReturn instanceof Error) throw overrides.kbReturn;
      return overrides.kbReturn ?? null;
    }),
  } as unknown as KnowledgeBaseProvider;

  const judge = {
    evaluate: jest.fn().mockImplementation(async () => {
      if (overrides.judgeReturn instanceof Error) throw overrides.judgeReturn;
      return overrides.judgeReturn ?? { confidence: 0, decision: 'review' as const };
    }),
  } as unknown as LlmJudgePort;

  const ws = {
    search: jest.fn().mockImplementation(async () => {
      if (overrides.wsReturn instanceof Error) throw overrides.wsReturn;
      return overrides.wsReturn ?? [];
    }),
  } as unknown as WebSearchProvider;

  // V1 reranker = always-throw mock. KR exercises its fail-open branch and
  // preserves baseline ordering. Span emission contract is unchanged.
  const reranker: jest.Mocked<RerankerPort> = {
    rerank: jest
      .fn()
      .mockRejectedValue(new RerankerUnavailableError('reranker disabled by configuration')),
  };

  return new KnowledgeRouterService({ kb, ws, judge, reranker, config: defaultConfig });
}

describe('chat.knowledge.lookup Langfuse span (T7.1)', () => {
  beforeEach(() => {
    mockGetLangfuse.mockReset();
  });

  it('emits one trace named "chat.knowledge.lookup" on every resolve() call', async () => {
    const { traces, client } = makeFakeTraceClient();
    mockGetLangfuse.mockReturnValue(client);

    const service = makeService({
      kbReturn: { qid: 'Q12418', title: 'Mona Lisa', artist: 'Leonardo da Vinci' },
    });

    await service.resolve('Mona Lisa');

    expect(client.trace).toHaveBeenCalledTimes(1);
    expect(traces).toHaveLength(1);
    expect(traces[0].name).toBe('chat.knowledge.lookup');
  });

  it('carries knowledge.source + knowledge.fallback_triggered on KB hit (case wikidata)', async () => {
    const { traces, client } = makeFakeTraceClient();
    mockGetLangfuse.mockReturnValue(client);

    const service = makeService({
      kbReturn: { qid: 'Q12418', title: 'Mona Lisa', artist: 'Leonardo da Vinci' },
    });

    await service.resolve('Mona Lisa');

    const md = traces[0].metadata;
    expect(md['knowledge.source']).toBe('wikidata');
    expect(md['knowledge.fallback_triggered']).toBe(false);
    expect(md['knowledge.judge_confidence']).toBeUndefined();
  });

  it('carries judge_confidence on KB-miss + judge-confident path (case judge skip)', async () => {
    const { traces, client } = makeFakeTraceClient();
    mockGetLangfuse.mockReturnValue(client);

    const service = makeService({
      kbReturn: null,
      judgeReturn: { confidence: 0.92, decision: 'allow' as const },
    });

    await service.resolve('Mona Lisa');

    const md = traces[0].metadata;
    expect(md['knowledge.source']).toBe('none');
    expect(md['knowledge.fallback_triggered']).toBe(false);
    expect(md['knowledge.judge_confidence']).toBe(0.92);
  });

  it('carries fallback_triggered=true + source=web on WS hit (full cascade)', async () => {
    const { traces, client } = makeFakeTraceClient();
    mockGetLangfuse.mockReturnValue(client);

    const service = makeService({
      kbReturn: null,
      judgeReturn: { confidence: 0.1, decision: 'review' as const },
      wsReturn: [{ url: 'https://example.org', title: 'About Mona Lisa', snippet: 'A portrait.' }],
    });

    await service.resolve('obscure topic');

    const md = traces[0].metadata;
    expect(md['knowledge.source']).toBe('web');
    expect(md['knowledge.fallback_triggered']).toBe(true);
    expect(md['knowledge.judge_confidence']).toBe(0.1);
  });

  it('hashes search term — raw value never appears in span metadata (NFR7 PII)', async () => {
    const { traces, client } = makeFakeTraceClient();
    mockGetLangfuse.mockReturnValue(client);

    const service = makeService({
      kbReturn: { qid: 'Q1', title: 'X' },
    });

    const pii = 'jean.dupont@example.fr askes about Q1234567';
    const expectedHash = createHash('sha256').update(pii).digest('hex').slice(0, 16);

    await service.resolve(pii);

    const md = traces[0].metadata;
    expect(md['knowledge.search_term_hash']).toBe(expectedHash);
    // Critical PII guard — the raw search term must NEVER be in the metadata.
    const serialised = JSON.stringify(md);
    expect(serialised).not.toContain('jean.dupont@example.fr');
    expect(serialised).not.toContain(pii);
  });

  it('exposes per-leg latency_ms.kb on KB-hit', async () => {
    const { traces, client } = makeFakeTraceClient();
    mockGetLangfuse.mockReturnValue(client);

    const service = makeService({
      kbReturn: { qid: 'Q12418', title: 'Mona Lisa' },
    });

    await service.resolve('Mona Lisa');

    const md = traces[0].metadata;
    expect(typeof md['knowledge.latency_ms.kb']).toBe('number');
    expect(md['knowledge.latency_ms.kb'] as number).toBeGreaterThanOrEqual(0);
  });

  it('fail-open: Langfuse trace throw does NOT break resolve()', async () => {
    const client = {
      trace: jest.fn(() => {
        throw new Error('langfuse down');
      }),
    };
    mockGetLangfuse.mockReturnValue(client);

    const service = makeService({
      kbReturn: { qid: 'Q1', title: 'X' },
    });

    await expect(service.resolve('Mona Lisa')).resolves.toMatchObject({
      source: 'wikidata',
    });
  });

  it('no trace call when getLangfuse() returns null (telemetry disabled)', async () => {
    mockGetLangfuse.mockReturnValue(null);

    const service = makeService({
      kbReturn: { qid: 'Q1', title: 'X' },
    });

    const result = await service.resolve('Mona Lisa');
    // No assertion on trace calls (the mocked client object doesn't even
    // exist here) — what matters is that the resolve() returns the expected
    // result with no exception, exactly as if telemetry were enabled.
    expect(result.source).toBe('wikidata');
  });
});
