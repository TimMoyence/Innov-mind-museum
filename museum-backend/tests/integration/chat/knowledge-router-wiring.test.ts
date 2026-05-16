/**
 * C4.1 T3.3 — `KnowledgeRouter` wiring integration test (composition root).
 *
 * Asserts that {@link ChatModule.build} instantiates a `KnowledgeRouterService`
 * with the wired KB / judge / WebSearch providers, and that the resulting
 * `BuiltChatModule.knowledgeRouter` actually delegates to those providers
 * along the documented cascade (R6 / R7 / R8 / R9).
 *
 * Strategy : mock the adapter clients (`WikidataClient`, `FallbackSearchProvider`,
 * `LlmJudgeGuardrail`) at module-resolution time so the composition root can
 * import them as usual, then read `built.knowledgeRouter` and exercise the
 * cascade through three scenarios :
 *
 *   1. KB hit                  → `source='wikidata'`, fallback NOT triggered.
 *   2. KB miss + judge HIGH    → `source='none'`,    fallback NOT triggered.
 *   3. KB miss + judge LOW
 *      + WebSearch HIT         → `source='web'`,    fallback triggered.
 *
 * Backward-compat note : we do NOT remove the existing `knowledgeBase`
 * injection (NFR8 — 1 cycle migration). T3.4 will plumb the router into the
 * actual `fetchEnrichmentData` consumer; for now, the router is an additive
 * field on `BuiltChatModule` that asserts the wiring is healthy.
 *
 * Doctrine compliance : no `*_ENABLED` flag is asserted by this test, and no
 * such flag is introduced by the wiring it covers (D11 / pré-launch V1
 * `feedback_no_feature_flags_prelaunch`).
 */

import type { DataSource } from 'typeorm';

// ─── Module mocks ───────────────────────────────────────────────────────────
// Each adapter client gets a jest.fn() impl so the composition root, which
// constructs them with `new XxxClient(...)`, ends up with deterministic mocks.

const wikidataLookup = jest.fn();
const fallbackSearch = jest.fn();
const judgeEvaluate = jest.fn();

jest.mock('@modules/chat/adapters/secondary/search/wikidata.client', () => ({
  // Mock BOTH `lookup` and `lookupOrThrow` because C5.3 Phase B inserts the
  // `WikidataBreakerClient` in the provider chain — the breaker invokes
  // `lookupOrThrow` (its `action` callback) rather than the public `lookup`.
  // Keeping the same `wikidataLookup` impl behind both surfaces preserves the
  // call-count assertions across the wrapped path.
  WikidataClient: jest.fn().mockImplementation(() => ({
    lookup: wikidataLookup,
    lookupOrThrow: wikidataLookup,
  })),
  WikidataTransientError: class extends Error {},
}));

jest.mock('@modules/chat/adapters/secondary/search/fallback-search.provider', () => ({
  FallbackSearchProvider: jest.fn().mockImplementation(() => ({
    search: fallbackSearch,
  })),
}));

jest.mock('@modules/chat/useCase/llm/llm-judge-guardrail', () => {
  const actual = jest.requireActual('@modules/chat/useCase/llm/llm-judge-guardrail');
  return {
    ...actual,
    LlmJudgeGuardrail: jest.fn().mockImplementation(() => ({
      evaluate: judgeEvaluate,
    })),
  };
});

// Avoid pulling the OpenAI client / TTS / OCR / S3 graph at module init.
jest.mock('@modules/chat/adapters/secondary/audio/audio-transcriber.openai', () => ({
  OpenAiAudioTranscriber: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@modules/chat/adapters/secondary/audio/text-to-speech.openai', () => ({
  OpenAiTextToSpeechService: jest.fn().mockImplementation(() => ({})),
  DisabledTextToSpeechService: jest.fn().mockImplementation(() => ({})),
}));

import { ChatModule } from '@modules/chat/chat-module';
import { KnowledgeRouterService } from '@modules/chat/useCase/knowledge/knowledge-router.service';

import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';
import type { KnowledgeRouterPort } from '@modules/chat/useCase/knowledge/knowledge-router.service';
import type { SearchResult } from '@modules/chat/domain/ports/web-search.port';

/**
 * Builds a minimal {@link DataSource} stub sufficient for `ChatModule.build()`
 * to traverse the TypeORM repositories' constructors. Every `getRepository()`
 * returns an empty object — repository methods are never invoked because the
 * router test does not exercise persistence paths.
 */
function makeStubDataSource(): DataSource {
  return {
    getRepository: jest.fn().mockReturnValue({
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
      manager: { transaction: jest.fn() },
    }),
  } as unknown as DataSource;
}

/* ───────────────────────────────────────────────────────────────────────── */

describe('chat-module knowledge router wiring (T3.3 integration)', () => {
  let module: ChatModule;
  let router: KnowledgeRouterPort;

  beforeEach(() => {
    wikidataLookup.mockReset();
    fallbackSearch.mockReset();
    judgeEvaluate.mockReset();

    module = new ChatModule();
    const built = module.build(makeStubDataSource());

    // Wiring contract — the router must be exposed on the built module so
    // upstream observability / debugging / tests can inspect the cascade.
    if (!built.knowledgeRouter) {
      throw new Error('BuiltChatModule.knowledgeRouter is undefined — T3.3 wiring missing');
    }
    router = built.knowledgeRouter;
  });

  afterEach(() => {
    module.stopArtKeywordsRefresh();
  });

  it('exposes a KnowledgeRouterService on BuiltChatModule', () => {
    expect(router).toBeInstanceOf(KnowledgeRouterService);
  });

  it('cascade case 1 — KB hit short-circuits to source=wikidata (judge + WS not called)', async () => {
    const facts: ArtworkFacts = {
      qid: 'Q12418',
      title: 'Mona Lisa',
      artist: 'Leonardo da Vinci',
      date: '1503',
    };
    wikidataLookup.mockResolvedValueOnce(facts);

    const result = await router.resolve('Mona Lisa');

    expect(result.source).toBe('wikidata');
    expect(result.fallback_triggered).toBe(false);
    expect(result.facts.length).toBeGreaterThan(0);
    expect(wikidataLookup).toHaveBeenCalledTimes(1);
    expect(judgeEvaluate).not.toHaveBeenCalled();
    expect(fallbackSearch).not.toHaveBeenCalled();
  });

  it('cascade case 2 — KB miss + judge confident skips WebSearch (source=none, fallback=false)', async () => {
    wikidataLookup.mockResolvedValueOnce(null);
    judgeEvaluate.mockResolvedValueOnce({ confidence: 0.92, decision: 'allow' });

    const result = await router.resolve('Q-not-in-wikidata');

    expect(result.source).toBe('none');
    expect(result.fallback_triggered).toBe(false);
    expect(result.judge_confidence).toBeCloseTo(0.92);
    expect(wikidataLookup).toHaveBeenCalledTimes(1);
    expect(judgeEvaluate).toHaveBeenCalledTimes(1);
    expect(fallbackSearch).not.toHaveBeenCalled();
  });

  it('cascade case 3 — KB miss + judge low triggers WebSearch (source=web, fallback=true)', async () => {
    wikidataLookup.mockResolvedValueOnce(null);
    judgeEvaluate.mockResolvedValueOnce({ confidence: 0.2, decision: 'review' });
    const wsResults: SearchResult[] = [
      { title: 'About X', url: 'https://x.example', snippet: 'X is a thing.' },
      { title: 'Y site', url: 'https://y.example', snippet: 'Y too.' },
    ];
    fallbackSearch.mockResolvedValueOnce(wsResults);

    const result = await router.resolve('obscure topic');

    expect(result.source).toBe('web');
    expect(result.fallback_triggered).toBe(true);
    expect(result.facts.length).toBe(2);
    expect(wikidataLookup).toHaveBeenCalledTimes(1);
    expect(judgeEvaluate).toHaveBeenCalledTimes(1);
    expect(fallbackSearch).toHaveBeenCalledTimes(1);
  });
});
