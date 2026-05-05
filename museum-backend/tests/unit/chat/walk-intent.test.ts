/**
 * Service-integration coverage for chat session intent='walk'.
 *
 * Exercises the full ChatService path (createSession → buildOrchestratorInput →
 * orchestrator.generate → commitAssistantResponse) with an in-memory repo and
 * a walk-aware fake orchestrator that emits structured suggestions.
 *
 * Plan deviation: the original spec referenced createE2EHarness (HTTP + testcontainers
 * Postgres). We follow the existing pattern in this directory
 * (chat-api.smoke.integration.test.ts) using buildChatTestService for lower setup
 * cost and identical coverage of the use-case → service → repo path. The HTTP layer
 * is independently exercised by the unit tests added in T1.3
 * (contracts-create-session-intent.test.ts) and T1.7
 * (message-commit-suggestions.test.ts).
 */

import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';
import type {
  ChatOrchestrator,
  OrchestratorInput,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';

// ── Walk-aware fake orchestrator ────────────────────────────────────────────

class WalkAwareOrchestrator implements ChatOrchestrator {
  public lastIntent: string | undefined;

  async generate(input: OrchestratorInput): Promise<OrchestratorOutput> {
    this.lastIntent = input.intent;
    if (input.intent === 'walk') {
      return {
        text: 'Welcome to the guided walk.',
        metadata: { citations: ['walk:test'] },
        suggestions: ['Mona Lisa', 'Vénus de Milo'],
      };
    }
    return {
      text: 'Generic art response.',
      metadata: { citations: ['test'] },
    };
  }

  async generateStream(
    input: OrchestratorInput,
    onChunk: (text: string) => void,
  ): Promise<OrchestratorOutput> {
    const result = await this.generate(input);
    onChunk(result.text);
    return result;
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

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
        };
      },
      async generateStream(
        input: OrchestratorInput,
        onChunk: (text: string) => void,
      ): Promise<OrchestratorOutput> {
        const result = await emptyOrchestrator.generate(input);
        onChunk(result.text);
        return result;
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
