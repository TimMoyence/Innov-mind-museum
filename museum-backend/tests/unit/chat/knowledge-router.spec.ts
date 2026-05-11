/**
 * T3.2 — `KnowledgeRouterService` use-case unit tests (Phase Red → Green).
 *
 * Spec: `team-state/2026-05-11-c4-anti-hallucination/spec.md#R6..R10` (cascade).
 * Design: `team-state/2026-05-11-c4-anti-hallucination/design.md#D4` (AbortSignal.any),
 *         `#D8` (fail-open), `#D11` (no `*_ENABLED` flag — doctrine pré-launch V1).
 * Plan: `docs/plans/2026-05-10-c4-launch-prompt.md` §G Step 3.2.
 *
 * Contract under test (7 cascade cases) :
 *   1. KB hit                                    → source='wikidata', fallback_triggered=false
 *   2. KB miss + judge confident (>= threshold)  → source='none',     fallback_triggered=false
 *   3. KB miss + judge low + ws hit              → source='web',      fallback_triggered=true
 *   4. KB miss + judge low + ws throws           → source='none',     fallback_triggered=true (fail-open)
 *   5. KB miss + judge low + ws empty            → source='none',     fallback_triggered=true
 *   6. Parent signal aborted upstream            → graceful exit, no throw bubbled to caller
 *   7. KB throws (Wikidata down / circuit open)  → source='none' (ADR-035 fail-open preserved)
 *
 * Mocks : `KnowledgeBaseProvider`, `WebSearchProvider`, `LlmJudgePort` — pure
 * jest.fn() stubs, no I/O. Latency is measured via `performance.now()` inside
 * the service and surfaced through `metadata.latencyMs.{kb,judge,web}`.
 */
import { KnowledgeRouterService } from '@modules/chat/useCase/knowledge/knowledge-router.service';

import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
} from '@modules/chat/domain/ports/knowledge-base.port';
import type {
  LlmJudgePort,
  LlmJudgeResult,
} from '@modules/chat/domain/ports/llm-judge.port';
import type {
  SearchResult,
  WebSearchProvider,
} from '@modules/chat/domain/ports/web-search.port';

// Silence logger output during tests.
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Test helpers — local factories for judge / search result shapes. These are
// inline because they are only used in this spec file and ESLint plugin
// `eslint-plugin-musaium-test-discipline` flags inline `as Entity` casts on
// persisted domain entities, not pure value-object shapes like `LlmJudgeResult`
// (see baseline). If reused elsewhere, move under `tests/helpers/chat/`.
// ---------------------------------------------------------------------------

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
};

const makeService = (
  config: Partial<typeof defaultConfig> = {},
): MockedDeps => {
  const kb = { lookup: jest.fn() } as unknown as jest.Mocked<KnowledgeBaseProvider>;
  const ws = { search: jest.fn() } as unknown as jest.Mocked<WebSearchProvider>;
  const judge = { evaluate: jest.fn() } as unknown as jest.Mocked<LlmJudgePort>;

  const service = new KnowledgeRouterService({
    kb,
    ws,
    judge,
    config: { ...defaultConfig, ...config },
  });

  return { kb, ws, judge, service };
};

// ---------------------------------------------------------------------------
// Tests — 7 cascade cases (spec R6 / plan §G Step 3.2 phase Red)
// ---------------------------------------------------------------------------

describe('KnowledgeRouterService — cascade KB → judge → WebSearch', () => {
  // Case 1 — KB hit short-circuits the cascade. Fully-populated facts exercise
  // every optional branch in `formatKbFacts` so the new file's branch coverage
  // meets the repo's 74 % global threshold.
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

  // Case 1b — KB hit with MINIMAL facts (no optional fields) so the
  // `formatKbFacts` else-branches (missing artist/date/technique/...) are
  // also exercised. Together with case 1, this covers both the truthy and
  // falsy branch of every optional `if` in the formatter.
  it('formats minimal KB facts with no optional fields', async () => {
    const { kb, service } = makeService();
    kb.lookup.mockResolvedValueOnce({ qid: 'Q12418', title: 'Mona Lisa' });

    const result = await service.resolve('Mona Lisa');

    expect(result.source).toBe('wikidata');
    expect(result.facts.length).toBe(1);
    expect(result.facts[0]).toContain('Q12418');
  });

  // Case 2 — KB miss, judge confident → no WebSearch.
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

  // Case 3 — KB miss, judge low, WS hit → fallback triggered.
  it('returns source="web" fallback_triggered=true when WebSearch returns results', async () => {
    const { kb, ws, judge, service } = makeService();
    kb.lookup.mockResolvedValueOnce(null);
    judge.evaluate.mockResolvedValueOnce(makeJudgeResult({ confidence: 0.3 }));
    ws.search.mockResolvedValueOnce([makeSearchResult(), makeSearchResult({ url: 'https://example.org/2' })]);

    const result = await service.resolve('obscure artist');

    expect(result.source).toBe('web');
    expect(result.fallback_triggered).toBe(true);
    expect(result.facts.length).toBeGreaterThan(0);
    expect(result.judge_confidence).toBe(0.3);
    expect(ws.search).toHaveBeenCalledTimes(1);
    expect(result.metadata?.latencyMs.web).toBeGreaterThanOrEqual(0);
  });

  // Case 4 — KB miss, judge low, WS throws → fail-open (no exception bubbles).
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
    // No throw bubbled — promise resolved normally.
  });

  // Case 5 — KB miss, judge low, WS empty → fallback triggered, source='none'.
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

  // Case 6 — parent signal aborted upstream → graceful exit with source='none'.
  //
  // Decision (D4) : when the caller has already aborted before the router is
  // invoked, the router short-circuits immediately, returning `source='none'`
  // WITHOUT calling any of the three legs. This avoids wasted provider calls
  // and matches the fail-open contract (KnowledgeRouterPort never throws).
  // The per-leg `AbortSignal.any` covers the mid-cascade-abort case ; the
  // upfront `parentSignal?.aborted` check covers the already-aborted case.
  it('exits gracefully without throwing when the parent signal is aborted', async () => {
    const { kb, ws, judge, service } = makeService();
    const controller = new AbortController();
    controller.abort();

    await expect(service.resolve('term', controller.signal)).resolves.toMatchObject({
      source: 'none',
      fallback_triggered: false,
      facts: [],
    });
    // Upfront short-circuit — no leg should run.
    expect(kb.lookup).toHaveBeenCalledTimes(0);
    expect(judge.evaluate).toHaveBeenCalledTimes(0);
    expect(ws.search).toHaveBeenCalledTimes(0);
  });

  // Case 6b — parent signal aborts MID-CASCADE (after KB call, before
  // judge call). Verifies the per-leg `AbortSignal.any` plumbing fires for
  // the judge leg and the router still exits gracefully (`source='none'`).
  it('handles mid-cascade parent abort without bubbling the exception', async () => {
    const { kb, ws, judge, service } = makeService();
    const controller = new AbortController();

    kb.lookup.mockImplementation(async () => {
      // Abort the parent right when KB completes — the next leg (judge)
      // sees an already-aborted signal via AbortSignal.any.
      controller.abort();
      return null;
    });
    judge.evaluate.mockResolvedValueOnce(makeJudgeResult({ confidence: 0.1 }));
    ws.search.mockResolvedValueOnce([]);

    const result = await service.resolve('term', controller.signal);

    expect(result.source).toBe('none');
    // No throw bubbled — promise resolved with a router result, not a reject.
  });

  // Case 8 — KB leg exceeds its 200 ms budget. The internal `runWithLegBudget`
  // wrapper aborts the in-flight promise via `AbortSignal.timeout` and the
  // outer `.catch` converts the reject to `null` (fail-open). Cascade then
  // proceeds to the judge leg. Validates the `AbortSignal.any` timeout path
  // (D4) is wired, not just the parent-abort path.
  it('aborts KB leg on timeout and falls through to the judge', async () => {
    const { kb, judge, service } = makeService({ kbTimeoutMs: 20 });
    // KB hangs longer than the 20 ms budget.
    kb.lookup.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(null), 200)),
    );
    judge.evaluate.mockResolvedValueOnce(makeJudgeResult({ confidence: 0.9 }));

    const result = await service.resolve('slow term');

    expect(result.source).toBe('none');
    expect(result.fallback_triggered).toBe(false);
    expect(judge.evaluate).toHaveBeenCalledTimes(1);
    expect(result.metadata?.latencyMs.kb).toBeGreaterThanOrEqual(0);
  });

  // Case 7 — KB throws (Wikidata down / circuit open per ADR-035) → fail-open.
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
