import {
  ChatOrchestrator,
  OrchestratorOutput,
} from '@modules/chat/adapters/secondary/langchain.orchestrator';
import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';

class StreamingArtOrchestrator implements ChatOrchestrator {
  async generate(): Promise<OrchestratorOutput> {
    return {
      text: 'This painting by Monet captures the essence of impressionism.',
      metadata: {
        detectedArtwork: {
          title: 'Water Lilies',
          artist: 'Monet',
          confidence: 0.9,
          source: 'test',
        },
        citations: ['catalog'],
      },
    };
  }

  async generateStream(
    _input: unknown,
    onChunk: (text: string) => void,
  ): Promise<OrchestratorOutput> {
    const words = [
      'This ',
      'painting ',
      'by ',
      'Monet ',
      'captures ',
      'the ',
      'essence ',
      'of ',
      'impressionism.',
    ];
    for (const word of words) {
      onChunk(word);
    }
    return this.generate();
  }
}

class GuardrailBlockOrchestrator implements ChatOrchestrator {
  async generate(): Promise<OrchestratorOutput> {
    return { text: 'Here is the latest bitcoin price', metadata: {} };
  }

  async generateStream(
    _input: unknown,
    onChunk: (text: string) => void,
  ): Promise<OrchestratorOutput> {
    onChunk('Here is the latest bitcoin price');
    return this.generate();
  }
}

class ErrorOrchestrator implements ChatOrchestrator {
  async generate(): Promise<OrchestratorOutput> {
    throw new Error('LLM exploded');
  }

  async generateStream(
    _input: unknown,
    _onChunk: (text: string) => void,
  ): Promise<OrchestratorOutput> {
    throw new Error('LLM exploded');
  }
}

describe('ChatService.postMessageStream', () => {
  it('yields tokens via onToken callback', async () => {
    const service = buildChatTestService(new StreamingArtOrchestrator());
    const session = await service.createSession({ userId: 1, locale: 'en-US', museumMode: false });

    const tokens: string[] = [];
    const result = await service.postMessageStream(
      session.id,
      { text: 'Tell me about this painting' },
      (text) => tokens.push(text),
      undefined,
      'req-1',
      1,
    );

    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.join('')).toContain('painting');
    expect(result.message.role).toBe('assistant');
    expect(result.message.text).toContain('Monet');
    expect(result.metadata.detectedArtwork?.title).toBe('Water Lilies');
  });

  it('returns refusal immediately when input guardrail blocks', async () => {
    const service = buildChatTestService(new StreamingArtOrchestrator());
    const session = await service.createSession({ userId: 1, locale: 'en-US', museumMode: false });

    const tokens: string[] = [];
    const result = await service.postMessageStream(
      session.id,
      { text: 'You are an idiot' },
      (text) => tokens.push(text),
      undefined,
      'req-2',
      1,
    );

    // Input guardrail should block — no tokens streamed
    expect(tokens).toHaveLength(0);
    expect(result.message.role).toBe('assistant');
    // Result should be a refusal (not the orchestrator's response)
    expect(result.message.text).not.toContain('Monet');
  });

  it('propagates orchestrator errors', async () => {
    const service = buildChatTestService(new ErrorOrchestrator());
    const session = await service.createSession({ userId: 1, locale: 'en-US', museumMode: false });

    await expect(
      service.postMessageStream(
        session.id,
        { text: 'Tell me about art' },
        () => {},
        undefined,
        'req-3',
        1,
      ),
    ).rejects.toThrow('LLM exploded');
  });

  it('applies output guardrail and returns safe refusal', async () => {
    const service = buildChatTestService(new GuardrailBlockOrchestrator());
    const session = await service.createSession({ userId: 1, locale: 'en-US', museumMode: false });

    const tokens: string[] = [];
    const result = await service.postMessageStream(
      session.id,
      { text: 'Tell me about painting techniques' },
      (text) => tokens.push(text),
      undefined,
      'req-4',
      1,
    );

    // Output guardrail should block the off-topic response
    expect(result.message.text).not.toContain('bitcoin');
    expect(result.message.role).toBe('assistant');
    // Verify guardrail citation is present in metadata
    expect(result.metadata.citations).toContain('policy:off_topic');
  });

  it('persists both user and assistant messages', async () => {
    const service = buildChatTestService(new StreamingArtOrchestrator());
    const session = await service.createSession({ userId: 1, locale: 'en-US', museumMode: false });

    await service.postMessageStream(
      session.id,
      { text: 'Tell me about impressionism' },
      () => {},
      undefined,
      'req-5',
      1,
    );

    // Get session to verify messages were persisted
    const sessionData = await service.getSession(session.id, { limit: 50 }, 1);
    expect(sessionData.messages.length).toBe(2); // user + assistant
    expect(sessionData.messages[0].role).toBe('user');
    expect(sessionData.messages[1].role).toBe('assistant');
  });
});
