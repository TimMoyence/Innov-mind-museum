/**
 * C4.1 T6.2 — `KnowledgeRouter` end-to-end integration test (full chat pipeline).
 *
 * Whereas T3.3 (`knowledge-router-wiring.test.ts`) verifies that `ChatModule.build()`
 * wires the router with the correct Wikidata / judge / WebSearch providers, T6.2
 * exercises the **full chat pipeline** — `ChatService.postMessage()` → prepare-
 * pipeline → `KnowledgeRouter.resolve()` → orchestrator (mocked) → response shape —
 * and asserts that the router's `facts` + `source` propagate end-to-end into the
 * `OrchestratorInput` the LLM sees, and that fail-open semantics survive a router
 * leg throwing (R10).
 *
 * Mock strategy : we inject a custom `KnowledgeRouterPort` stub through
 * `buildChatTestService({ knowledgeRouter, orchestrator })`. This isolates the
 * test from the Wikidata / Brave / Tavily HTTP graph while still exercising the
 * real `PrepareMessagePipeline` + `ChatMessageService` glue.
 *
 * Spec : `team-state/2026-05-11-c4-anti-hallucination/spec.md` §R6 / R9 / R10.
 * Design : `team-state/2026-05-11-c4-anti-hallucination/design.md` §D4.
 * Plan : `docs/plans/2026-05-10-c4-launch-prompt.md` §J Phase 6 Step 6.2.
 *
 * testcontainers : **NOT used** — the integration surface this test exercises
 * is pure use-case orchestration (no SQL, no Redis path). The in-memory
 * repository from `chatTestApp.ts` suffices. Persistence / cache integration
 * lives in `chat-repository-typeorm.integration.test.ts` (Postgres testcontainer)
 * and `chat-pipeline-spans.integration.test.ts` (metrics).
 *
 * Doctrine : NO `*_ENABLED` flag is asserted or introduced (D11 / pré-launch V1,
 * `feedback_no_feature_flags_prelaunch`).
 */

import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';

import type {
  ChatOrchestrator,
  OrchestratorInput,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';
import type {
  KnowledgeRouterPort,
  KnowledgeRouterResult,
} from '@modules/chat/useCase/knowledge/knowledge-router.service';

/**
 * Build an orchestrator that records every `OrchestratorInput` it sees so tests
 * can assert what the LLM would have received (facts + factsSource threaded by
 * the prepare pipeline). Optional `overrideOutput` lets callers customise the
 * synthetic LLM response per case.
 * @param overrideOutput - Optional partial `OrchestratorOutput` to override the
 *                         synthetic defaults (e.g. inject `metadata.sources[]`).
 * @returns Tuple of the orchestrator stub + the captured-inputs array.
 */
function makeRecordingOrchestrator(overrideOutput?: Partial<OrchestratorOutput>): {
  orchestrator: ChatOrchestrator;
  capturedInputs: OrchestratorInput[];
} {
  const capturedInputs: OrchestratorInput[] = [];
  const fakeOutput: OrchestratorOutput = {
    text: 'Synthetic assistant response',
    metadata: {},
    ...overrideOutput,
  };
  const orchestrator: ChatOrchestrator = {
    async generate(input: OrchestratorInput): Promise<OrchestratorOutput> {
      capturedInputs.push(input);
      return fakeOutput;
    },
  };
  return { orchestrator, capturedInputs };
}

/* ─────────────────────────────────────────────────────────────────────── */

describe('chat pipeline — KnowledgeRouter integration (T6.2)', () => {
  it('case 1 — KB hit: source=wikidata, fallback=false, latencyMs.kb measured', async () => {
    const routerResult: KnowledgeRouterResult = {
      facts: ['Mona Lisa (Wikidata Q12418).', 'Artist: Leonardo da Vinci.'],
      source: 'wikidata',
      fallback_triggered: false,
      metadata: { searchTerm: 'Tell me about Mona Lisa', latencyMs: { kb: 17 } },
    };
    let captured: { term: string; result: KnowledgeRouterResult } | undefined;
    const router: KnowledgeRouterPort = {
      async resolve(searchTerm: string) {
        captured = { term: searchTerm, result: routerResult };
        return routerResult;
      },
    };

    const { orchestrator, capturedInputs } = makeRecordingOrchestrator();
    const service = buildChatTestService({ orchestrator, knowledgeRouter: router });

    const session = await service.createSession({ locale: 'en-US', museumMode: true });
    await service.postMessage(session.id, { text: 'Tell me about Mona Lisa' });

    expect(captured?.term).toBe('Tell me about Mona Lisa');
    expect(captured?.result.source).toBe('wikidata');
    expect(captured?.result.fallback_triggered).toBe(false);
    expect(captured?.result.metadata?.latencyMs.kb).toBeGreaterThanOrEqual(0);

    // End-to-end propagation : the orchestrator input MUST carry the verified
    // facts + the provenance label so the Spotlighting envelope (T3.4) wraps
    // them as the 2nd SystemMessage.
    expect(capturedInputs).toHaveLength(1);
    expect(capturedInputs[0].facts).toEqual(routerResult.facts);
    expect(capturedInputs[0].factsSource).toBe('wikidata');
  });

  it('case 2 — KB miss + judge low + WS hit: source=web, fallback=true', async () => {
    const wsFacts = ['About Mona Lisa: a 16th-century portrait.', 'Mona Lisa site: A description.'];
    const routerResult: KnowledgeRouterResult = {
      facts: wsFacts,
      source: 'web',
      fallback_triggered: true,
      judge_confidence: 0.2,
      metadata: { searchTerm: 'obscure topic', latencyMs: { kb: 200, judge: 480, web: 900 } },
    };
    const router: KnowledgeRouterPort = {
      async resolve() {
        return routerResult;
      },
    };

    const { orchestrator, capturedInputs } = makeRecordingOrchestrator();
    const service = buildChatTestService({ orchestrator, knowledgeRouter: router });

    const session = await service.createSession({ locale: 'en-US', museumMode: true });
    await service.postMessage(session.id, { text: 'obscure topic' });

    expect(capturedInputs[0].facts).toEqual(wsFacts);
    expect(capturedInputs[0].factsSource).toBe('web');
  });

  it('case 3 — KB miss + judge HIGH: source=none, fallback NOT triggered (judge ≥ 0.7)', async () => {
    const routerResult: KnowledgeRouterResult = {
      facts: [],
      source: 'none',
      fallback_triggered: false,
      judge_confidence: 0.92,
      metadata: { searchTerm: 'whatever question', latencyMs: { kb: 180, judge: 420 } },
    };
    const router: KnowledgeRouterPort = {
      async resolve() {
        return routerResult;
      },
    };

    const { orchestrator, capturedInputs } = makeRecordingOrchestrator();
    const service = buildChatTestService({ orchestrator, knowledgeRouter: router });

    const session = await service.createSession({ locale: 'en-US', museumMode: true });
    await service.postMessage(session.id, { text: 'whatever question' });

    // judge confident → no facts, source=none, fallback NOT triggered.
    expect(capturedInputs[0].facts).toEqual([]);
    expect(capturedInputs[0].factsSource).toBe('none');
    expect(routerResult.judge_confidence ?? 0).toBeGreaterThanOrEqual(0.7);
  });

  it('case 4 — WebSearch fails-open (source=none): pipeline does not throw', async () => {
    // The router contract (port docstring) says implementations MUST NOT throw —
    // they return `source: 'none'` on any leg failure (R10 fail-open). We model
    // that contract here by stubbing a router that catches its own WebSearch
    // failure and returns the neutral result. The crucial integration claim is
    // that the chat pipeline does NOT surface a 503 in this scenario : facts is
    // empty and factsSource is 'none', the orchestrator runs, and a normal
    // response comes back.
    //
    // The "router throwing despite the contract" path is asserted by the
    // unit-level `knowledge-router.spec.ts` (cases 5-7 — fail-open on KB / judge
    // / WS exception) — that scenario is NOT this integration test's surface.
    const router: KnowledgeRouterPort = {
      async resolve() {
        return {
          facts: [],
          source: 'none',
          fallback_triggered: true,
          judge_confidence: 0,
          metadata: {
            searchTerm: 'unreachable web',
            latencyMs: { kb: 200, judge: 500, web: 1500 },
          },
        };
      },
    };

    const { orchestrator, capturedInputs } = makeRecordingOrchestrator();
    const service = buildChatTestService({ orchestrator, knowledgeRouter: router });

    const session = await service.createSession({ locale: 'en-US', museumMode: true });

    // The crucial assertion : the pipeline does not throw even when every
    // router leg has failed (modelled as a `source: 'none'` result).
    await expect(
      service.postMessage(session.id, { text: 'unreachable web' }),
    ).resolves.toBeDefined();

    expect(capturedInputs[0].factsSource).toBe('none');
    expect(capturedInputs[0].facts).toEqual([]);
  });
});
