import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';
import type {
  ChatOrchestrator,
  OrchestratorInput,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';

class WalkAwareOrchestrator implements ChatOrchestrator {
  public lastIntent: string | undefined;

  async generate(input: OrchestratorInput): Promise<OrchestratorOutput> {
    this.lastIntent = input.intent;
    if (input.intent === 'walk') {
      return {
        text: 'Welcome to the guided walk.',
        metadata: { citations: ['walk:test'] },
        suggestions: ['Mona Lisa', 'Vénus de Milo'],
        degraded: false,
      };
    }
    return {
      text: 'Generic art response.',
      metadata: { citations: ['test'] },
      degraded: false,
    };
  }
}

describe('chat walk-intent integration (service-level)', () => {
  it('persists intent=walk on createSession and surfaces suggestions on postMessage', async () => {
    const orchestrator = new WalkAwareOrchestrator();
    const chatService = buildChatTestService({ orchestrator });

    const session = await chatService.createSession({
      locale: 'en-US',
      museumMode: true,
      intent: 'walk',
    });

    expect(session.intent).toBe('walk');

    const response = await chatService.postMessage(session.id, {
      text: 'guide me through this museum',
    });

    expect(orchestrator.lastIntent).toBe('walk');
    expect(response.message.role).toBe('assistant');
    expect(response.message.suggestions).toEqual(['Mona Lisa', 'Vénus de Milo']);
  });

  it('defaults intent and omits suggestions when intent is not specified', async () => {
    const orchestrator = new WalkAwareOrchestrator();
    const chatService = buildChatTestService({ orchestrator });

    const session = await chatService.createSession({
      locale: 'en-US',
      museumMode: true,
    });

    expect(session.intent).toBe('default');

    const response = await chatService.postMessage(session.id, { text: 'hi' });

    expect(orchestrator.lastIntent).toBe('default');
    expect(response.message.suggestions).toBeUndefined();
    expect('suggestions' in response.message).toBe(false);
  });

  it('handles intent=walk with empty suggestions from orchestrator (omits field)', async () => {
    const emptyOrchestrator: ChatOrchestrator = {
      async generate(_input: OrchestratorInput): Promise<OrchestratorOutput> {
        return {
          text: 'Walk response without suggestions.',
          metadata: { citations: ['walk:empty'] },
          suggestions: [],
          degraded: false,
        };
      },
    };

    const chatService = buildChatTestService({ orchestrator: emptyOrchestrator });

    const session = await chatService.createSession({
      locale: 'en-US',
      museumMode: true,
      intent: 'walk',
    });

    const response = await chatService.postMessage(session.id, { text: 'tour' });

    expect(response.message.suggestions).toBeUndefined();
    expect('suggestions' in response.message).toBe(false);
  });
});
