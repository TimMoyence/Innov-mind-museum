import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';
import type {
  ChatOrchestrator,
  OrchestratorOutput,
} from '@modules/chat/adapters/secondary/langchain.orchestrator';
import { LangChainChatOrchestrator } from '@modules/chat/adapters/secondary/langchain.orchestrator';

class ThrowingOrchestrator implements ChatOrchestrator {
  async generate(): Promise<OrchestratorOutput> {
    throw new Error('LLM provider unavailable');
  }
}

class EmptyResponseOrchestrator implements ChatOrchestrator {
  async generate(): Promise<OrchestratorOutput> {
    return { text: '', metadata: {} };
  }
}

class InsultResponseOrchestrator implements ChatOrchestrator {
  async generate(): Promise<OrchestratorOutput> {
    return { text: 'You are stupid and should feel bad', metadata: {} };
  }
}

class OffTopicResponseOrchestrator implements ChatOrchestrator {
  async generate(): Promise<OrchestratorOutput> {
    return { text: 'Here is the latest bitcoin price update', metadata: {} };
  }
}

class ArtResponseOrchestrator implements ChatOrchestrator {
  async generate(): Promise<OrchestratorOutput> {
    return {
      text: 'This painting was created during the Renaissance period.',
      metadata: {
        detectedArtwork: {
          title: 'Mona Lisa',
          artist: 'Leonardo da Vinci',
          confidence: 0.95,
          source: 'vision',
        },
      },
    };
  }
}

describe('chat service orchestrator error handling', () => {
  it('propagates orchestrator errors', async () => {
    const service = buildChatTestService(new ThrowingOrchestrator());
    const session = await service.createSession({});

    await expect(
      service.postMessage(session.id, { text: 'Tell me about this painting' }),
    ).rejects.toThrow('LLM provider unavailable');
  });

  it('triggers output guardrail on empty orchestrator response', async () => {
    const service = buildChatTestService(new EmptyResponseOrchestrator());
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      text: 'Tell me about this painting',
    });

    expect(result.metadata.citations).toContain('policy:unsafe_output');
  });

  it('triggers output guardrail on insult in orchestrator response', async () => {
    const service = buildChatTestService(new InsultResponseOrchestrator());
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      text: 'Tell me about this painting',
    });

    expect(result.metadata.citations).toContain('policy:unsafe_output');
  });

  it('triggers output guardrail on off-topic orchestrator response', async () => {
    const service = buildChatTestService(new OffTopicResponseOrchestrator());
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      text: 'Tell me about this painting',
    });

    expect(result.metadata.citations).toContain('policy:off_topic');
  });

  it('returns fallback text when model is null', async () => {
    const orchestrator = new LangChainChatOrchestrator({ model: null } as Record<string, unknown>);
    const service = buildChatTestService(orchestrator);
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      text: 'Tell me about this painting',
    });

    expect(result.message.text).toContain('running without an LLM key');
  });

  it('passes through valid art responses with metadata', async () => {
    const service = buildChatTestService(new ArtResponseOrchestrator());
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      text: 'Tell me about this painting',
    });

    expect(result.message.text).toContain('Renaissance');
    expect(result.metadata.detectedArtwork?.title).toBe('Mona Lisa');
  });
});
