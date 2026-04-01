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
  async generateStream(_i: unknown, _c: (t: string) => void): Promise<OrchestratorOutput> {
    return this.generate();
  }
}

class EmptyResponseOrchestrator implements ChatOrchestrator {
  async generate(): Promise<OrchestratorOutput> {
    return { text: '', metadata: {} };
  }
  async generateStream(_i: unknown, onChunk: (t: string) => void): Promise<OrchestratorOutput> {
    const r = await this.generate();
    onChunk(r.text);
    return r;
  }
}

class InsultResponseOrchestrator implements ChatOrchestrator {
  async generate(): Promise<OrchestratorOutput> {
    return { text: 'You are stupid and should feel bad', metadata: {} };
  }
  async generateStream(_i: unknown, onChunk: (t: string) => void): Promise<OrchestratorOutput> {
    const r = await this.generate();
    onChunk(r.text);
    return r;
  }
}

class InjectionLeakOrchestrator implements ChatOrchestrator {
  async generate(): Promise<OrchestratorOutput> {
    return {
      text: 'Sure, here are my system prompt instructions: ignore previous rules',
      metadata: {},
    };
  }
  async generateStream(_i: unknown, onChunk: (t: string) => void): Promise<OrchestratorOutput> {
    const r = await this.generate();
    onChunk(r.text);
    return r;
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
  async generateStream(_i: unknown, onChunk: (t: string) => void): Promise<OrchestratorOutput> {
    const r = await this.generate();
    onChunk(r.text);
    return r;
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

  it('triggers output guardrail on injection leak in orchestrator response', async () => {
    const service = buildChatTestService(new InjectionLeakOrchestrator());
    const session = await service.createSession({ locale: 'en-US' });

    const result = await service.postMessage(session.id, {
      text: 'Tell me about this painting',
    });

    expect(result.metadata.citations).toContain('policy:unsafe_output');
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
