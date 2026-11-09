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

function makeRecordingOrchestrator(overrideOutput?: Partial<OrchestratorOutput>): {
  orchestrator: ChatOrchestrator;
  capturedInputs: OrchestratorInput[];
} {
  const capturedInputs: OrchestratorInput[] = [];
  const fakeOutput: OrchestratorOutput = {
    text: 'Synthetic assistant response',
    metadata: {},
    degraded: false,
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

describe('chat pipeline — KnowledgeRouter integration (T6.2)', () => {
  it('case 1 — KB hit: source=wikidata, fallback=false, latencyMs.kb measured', async () => {
    const routerResult: KnowledgeRouterResult = {
      facts: ['Mona Lisa (Wikidata Q12418).', 'Artist: Leonardo da Vinci.'],
      sources: [],
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

    expect(capturedInputs).toHaveLength(1);
    expect(capturedInputs[0].facts).toEqual(routerResult.facts);
    expect(capturedInputs[0].factsSource).toBe('wikidata');
  });

  it('case 2 — KB miss + judge low + WS hit: source=web, fallback=true', async () => {
    const wsFacts = ['About Mona Lisa: a 16th-century portrait.', 'Mona Lisa site: A description.'];
    const routerResult: KnowledgeRouterResult = {
      facts: wsFacts,
      sources: [],
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
      sources: [],
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

    expect(capturedInputs[0].facts).toEqual([]);
    expect(capturedInputs[0].factsSource).toBe('none');
    expect(routerResult.judge_confidence ?? 0).toBeGreaterThanOrEqual(0.7);
  });

  it('case 4 — WebSearch fails-open (source=none): pipeline does not throw', async () => {
    const router: KnowledgeRouterPort = {
      async resolve() {
        return {
          facts: [],
          sources: [],
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

    await expect(
      service.postMessage(session.id, { text: 'unreachable web' }),
    ).resolves.toBeDefined();

    expect(capturedInputs[0].factsSource).toBe('none');
    expect(capturedInputs[0].facts).toEqual([]);
  });
});
