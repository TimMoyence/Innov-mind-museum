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

class SilentOrchestrator implements ChatOrchestrator {
  async generate(_input: OrchestratorInput): Promise<OrchestratorOutput> {
    return { text: 'Réponse du guide.', metadata: {} };
  }
}

class RecordingRouter implements KnowledgeRouterPort {
  readonly terms: string[] = [];

  async resolve(searchTerm: string): Promise<KnowledgeRouterResult> {
    this.terms.push(searchTerm);
    return { facts: [], source: 'none', fallback_triggered: false };
  }
}

const USER_ID = 4343;
const EMAIL = 'jean.dupont@mail.fr';

describe('RAZ-M12c-ROUTER', () => {
  it('RAZ-M12c-ROUTER · le routeur de connaissances et son juge LLM ne reçoivent jamais un email en clair', async () => {
    const router = new RecordingRouter();
    const service = buildChatTestService({
      orchestrator: new SilentOrchestrator(),
      knowledgeRouter: router,
    });
    const session = await service.createSession({ userId: USER_ID });

    await service.postMessage(
      session.id,
      { text: `Écris-moi à ${EMAIL}, quel est ce tableau de Monet ?` },
      undefined,
      USER_ID,
    );

    expect(router.terms).toHaveLength(1);
    expect(router.terms[0]).toContain('Monet');
    expect(router.terms[0]).toContain('[EMAIL]');
    expect(router.terms[0]).not.toContain(EMAIL);
  });
});
