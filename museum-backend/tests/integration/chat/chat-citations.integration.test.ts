import { buildContextSection, generateNonce } from '@modules/chat/useCase/llm/llm-sections';

import { makeCitationSource } from 'tests/helpers/chat/citation-source.fixtures';
import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';

import type { CitationSource } from '@modules/chat/domain/chat.types';
import type {
  ChatOrchestrator,
  OrchestratorInput,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';
import type {
  KnowledgeRouterPort,
  KnowledgeRouterResult,
} from '@modules/chat/useCase/knowledge/knowledge-router.service';

function makeRecordingOrchestrator(output: Partial<OrchestratorOutput> = {}): {
  orchestrator: ChatOrchestrator;
  capturedInputs: OrchestratorInput[];
} {
  const capturedInputs: OrchestratorInput[] = [];
  const fakeOutput: OrchestratorOutput = {
    text: 'Synthetic assistant response',
    metadata: {},
    degraded: false,
    ...output,
  };

  const orchestrator: ChatOrchestrator = {
    async generate(input: OrchestratorInput): Promise<OrchestratorOutput> {
      capturedInputs.push(input);
      return fakeOutput;
    },
  };

  return { orchestrator, capturedInputs };
}

function makeFixedRouter(result: KnowledgeRouterResult): KnowledgeRouterPort {
  return {
    async resolve() {
      return result;
    },
  };
}

describe('chat citations end-to-end integration (T6.1)', () => {
  it('case 1 — LLM returns 3 valid sources → response carries metadata.sources.length === 3', async () => {
    const validSources: CitationSource[] = [
      makeCitationSource({
        type: 'wikidata',
        title: 'Mona Lisa',
        quote: 'The Mona Lisa is a half-length portrait by Leonardo da Vinci.',
        url: 'https://www.wikidata.org/wiki/Q12418',
      }),
      makeCitationSource({
        type: 'web',
        title: 'Louvre Mona Lisa entry',
        quote: 'Painted in oil on a poplar wood panel between 1503 and 1519.',
        url: 'https://www.louvre.fr/en/oeuvre-notices/mona-lisa-portrait-lisa-gherardini',
      }),
      makeCitationSource({
        type: 'commons',
        title: 'Mona Lisa file',
        quote: 'Image hosted on Wikimedia Commons under PD-Art license.',
        url: 'https://commons.wikimedia.org/wiki/File:Mona_Lisa.jpg',
      }),
    ];

    const { orchestrator } = makeRecordingOrchestrator({
      metadata: { sources: validSources },
    });
    const service = buildChatTestService({ orchestrator });
    const session = await service.createSession({ locale: 'en-US', museumMode: true });
    const response = await service.postMessage(session.id, { text: 'Tell me about Mona Lisa' });

    expect(response.metadata.sources).toBeDefined();
    expect(response.metadata.sources).toHaveLength(3);
    expect(response.metadata.sources?.[0].type).toBe('wikidata');
    expect(response.metadata.sources?.[1].type).toBe('web');
    expect(response.metadata.sources?.[2].type).toBe('commons');
  });

  it('case 2 — hallucinated quote is filtered by sources-validator', async () => {
    const routerFacts = [
      'Mona Lisa (Wikidata Q12418). Artist: Leonardo da Vinci.',
      'Painted in oil on a poplar wood panel between 1503 and 1519.',
    ];
    const router = makeFixedRouter({
      facts: routerFacts,
      sources: [],
      source: 'wikidata',
      fallback_triggered: false,
      metadata: { searchTerm: 'Mona Lisa', latencyMs: { kb: 11 } },
    });

    const hallucinatedSource = makeCitationSource({
      type: 'web',
      title: 'Fabricated quote',
      quote: 'This sentence does not appear in any of the router facts.',
      url: 'https://example.invalid/article',
    });
    const groundedA = makeCitationSource({
      type: 'wikidata',
      quote: 'Mona Lisa (Wikidata Q12418). Artist: Leonardo da Vinci.',
    });
    const groundedB = makeCitationSource({
      type: 'web',
      quote: 'Painted in oil on a poplar wood panel between 1503 and 1519.',
      url: 'https://www.louvre.fr/en/oeuvre-notices/mona-lisa-portrait-lisa-gherardini',
    });

    const { orchestrator } = makeRecordingOrchestrator({
      metadata: { sources: [groundedA, hallucinatedSource, groundedB] },
    });
    const service = buildChatTestService({ orchestrator, knowledgeRouter: router });
    const session = await service.createSession({ locale: 'en-US', museumMode: true });
    const response = await service.postMessage(session.id, { text: 'Tell me about Mona Lisa' });

    expect(response.metadata.sources).toHaveLength(2);
    expect(response.metadata.sources?.map((s) => s.quote)).not.toContain(hallucinatedSource.quote);
  });

  it('case 3 — LLM omits sources[] → response metadata.sources is undefined (graceful)', async () => {
    const { orchestrator } = makeRecordingOrchestrator({
      metadata: {},
    });
    const service = buildChatTestService({ orchestrator });
    const session = await service.createSession({ locale: 'en-US', museumMode: true });
    const response = await service.postMessage(session.id, { text: 'A generic art question' });

    expect(response.metadata.sources).toBeUndefined();
  });

  it('case 4 — Spotlighting envelope: router facts → orchestrator input + envelope nonce 16 hex chars', async () => {
    const routerFacts = [
      'Mona Lisa (Wikidata Q12418).',
      'Artist: Leonardo da Vinci.',
      'Date: 1503.',
    ];
    const router = makeFixedRouter({
      facts: routerFacts,
      sources: [],
      source: 'wikidata',
      fallback_triggered: false,
      metadata: { searchTerm: 'Tell me about Mona Lisa', latencyMs: { kb: 13 } },
    });

    const { orchestrator, capturedInputs } = makeRecordingOrchestrator();
    const service = buildChatTestService({ orchestrator, knowledgeRouter: router });
    const session = await service.createSession({ locale: 'en-US', museumMode: true });
    await service.postMessage(session.id, { text: 'Tell me about Mona Lisa' });

    expect(capturedInputs[0].facts).toEqual(routerFacts);
    expect(capturedInputs[0].factsSource).toBe('wikidata');

    const nonce = generateNonce();
    expect(nonce).toMatch(/^[0-9a-f]{16}$/);
    const envelope = buildContextSection(routerFacts, 'wikidata', nonce);

    expect(envelope).toContain(`[BEGIN UNTRUSTED EXTERNAL DATA — nonce=${nonce}]`);
    expect(envelope).toContain(`[END UNTRUSTED EXTERNAL DATA — nonce=${nonce}]`);
    expect(envelope).toContain('<untrusted_content source="wikidata"');
    expect(envelope).toContain('nonce="' + nonce + '"');
    expect(envelope).toContain('[1] Mona Lisa (Wikidata Q12418).');
    expect(envelope).toContain('[2] Artist: Leonardo da Vinci.');
    expect(envelope).toContain('[3] Date: 1503.');
  });
});
