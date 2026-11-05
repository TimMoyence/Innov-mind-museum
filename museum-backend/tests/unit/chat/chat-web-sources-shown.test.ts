import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';

import type { CitationSource } from '@modules/chat/domain/chat.types';
import type {
  ChatOrchestrator,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';
import type {
  KnowledgeRouterPort,
  KnowledgeRouterResult,
} from '@modules/chat/useCase/knowledge/knowledge-router.service';

const webSource: CitationSource = {
  url: 'https://example.org/capc',
  type: 'web',
  title: 'CAPC current exhibitions',
  quote: 'The CAPC presents three exhibitions this autumn.',
};

class UncitingOrchestrator implements ChatOrchestrator {
  async generate(): Promise<OrchestratorOutput> {
    return { text: 'Three exhibitions are on this autumn.', metadata: {}, degraded: false };
  }
}

class WebRouter implements KnowledgeRouterPort {
  async resolve(): Promise<KnowledgeRouterResult> {
    return {
      facts: [`${webSource.title}: ${webSource.quote}`],
      sources: [webSource],
      source: 'web',
      fallback_triggered: true,
    };
  }
}

describe('a chat answer grounded on web pages', () => {
  it('shows those pages as sources even when the model cited none', async () => {
    const service = buildChatTestService({
      orchestrator: new UncitingOrchestrator(),
      knowledgeRouter: new WebRouter(),
    });
    const session = await service.createSession({ userId: 7 });

    const response = await service.postMessage(
      session.id,
      { text: 'What exhibitions are on at this museum right now?' },
      undefined,
      7,
    );

    expect(response.metadata.sources).toEqual([webSource]);
  });
});
