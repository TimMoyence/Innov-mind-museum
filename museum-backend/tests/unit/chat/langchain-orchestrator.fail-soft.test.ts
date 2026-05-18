import { env } from '@src/config/env';
import { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import { LangChainChatOrchestrator } from '@modules/chat/adapters/secondary/llm/langchain.orchestrator';
import { makeMessage } from '../../helpers/chat/message.fixtures';

const createMessage = (id: string, role: 'user' | 'assistant', text: string): ChatMessage =>
  makeMessage({
    id,
    role,
    text,
    sessionId: 'test-session',
    createdAt: new Date('2026-02-18T10:00:00.000Z'),
  });

interface InvokeOptions {
  signal?: AbortSignal;
}

class FakeSectionModel {
  // C9.17 — orchestrator default path now goes exclusively through
  // `withStructuredOutput(schema).invoke()`. Plain `invoke()` retained as a
  // no-op since the `ChatModel` contract still types it.
  async invoke(_messages: unknown, _options?: InvokeOptions): Promise<{ content: unknown }> {
    return { content: '' };
  }

  withStructuredOutput(
    _schema: unknown,
    _opts?: { name?: string },
  ): {
    invoke: (messages: unknown, opts?: InvokeOptions) => Promise<Record<string, unknown>>;
  } {
    return {
      invoke: async (messages: unknown, _opts?: InvokeOptions) => {
        const serialized = JSON.stringify(messages);
        if (serialized.includes('[SECTION:summary]')) {
          return {
            text: 'Summary answer',
            deeperContext: 'More context here.',
            openQuestion: null,
            suggestedFollowUp: 'What technique was used?',
            imageDescription: null,
            suggestedImages: null,
            detectedArtwork: null,
            recommendations: null,
            expertiseSignal: null,
            citations: ['catalog-ref'],
            sources: null,
          };
        }
        return {
          text: 'Unknown section',
          deeperContext: null,
          openQuestion: null,
          suggestedFollowUp: null,
          imageDescription: null,
          suggestedImages: null,
          detectedArtwork: null,
          recommendations: null,
          expertiseSignal: null,
          citations: null,
          sources: null,
        };
      },
    };
  }

  async stream(
    messages: unknown,
    options?: InvokeOptions,
  ): Promise<AsyncIterable<{ content: unknown }>> {
    const result = await this.invoke(messages, options);
    return (async function* () {
      yield result;
    })();
  }
}

class SlowFakeModel {
  async invoke(_messages: unknown, _options?: InvokeOptions): Promise<{ content: unknown }> {
    return { content: '' };
  }

  withStructuredOutput(
    _schema: unknown,
    _opts?: { name?: string },
  ): {
    invoke: (messages: unknown, opts?: InvokeOptions) => Promise<Record<string, unknown>>;
  } {
    return {
      invoke: async (_messages: unknown, opts?: InvokeOptions) => {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 200);
          opts?.signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(new Error('TimeoutError: Request timed out.'));
            },
            { once: true },
          );
        });
        return {
          text: 'Too late',
          deeperContext: null,
          openQuestion: null,
          suggestedFollowUp: null,
          imageDescription: null,
          suggestedImages: null,
          detectedArtwork: null,
          recommendations: null,
          expertiseSignal: null,
          citations: null,
          sources: null,
        };
      },
    };
  }

  async stream(
    messages: unknown,
    options?: InvokeOptions,
  ): Promise<AsyncIterable<{ content: unknown }>> {
    const result = await this.invoke(messages, options);
    return (async function* () {
      yield result;
    })();
  }
}

describe('LangChainChatOrchestrator fail-soft profile', () => {
  const previous = { ...env.llm };

  afterEach(() => {
    Object.assign(env.llm, previous);
  });

  it('returns summary with new metadata fields', async () => {
    Object.assign(env.llm, {
      timeoutSummaryMs: 200,
      totalBudgetMs: 500,
      retries: 0,
      retryBaseDelayMs: 1,
      includeDiagnostics: true,
    });

    const orchestrator = new LangChainChatOrchestrator({
      model: new FakeSectionModel() as never,
    });

    const result = await orchestrator.generate({
      history: [
        createMessage('u1', 'user', 'Tell me about this painting.'),
        createMessage('a1', 'assistant', 'This work explores movement.'),
      ],
      text: 'How should I interpret this work?',
      locale: 'en-US',
      museumMode: true,
      context: {
        location: 'Room 4',
        guideLevel: 'intermediate',
      },
      requestId: 'test-request-id',
    });

    expect(result.text).toContain('Summary answer');
    expect(result.metadata.citations).toEqual(['catalog-ref']);
    expect(result.metadata.deeperContext).toBe('More context here.');
    expect(result.metadata.suggestedFollowUp).toBe('What technique was used?');
    expect(result.metadata.diagnostics?.profile).toBe('single_section');
    expect(result.metadata.diagnostics?.sections).toHaveLength(1);
    expect(result.metadata.diagnostics?.degraded).toBe(false);
  });

  it('falls back gracefully when summary times out', async () => {
    Object.assign(env.llm, {
      timeoutSummaryMs: 30,
      totalBudgetMs: 100,
      retries: 0,
      retryBaseDelayMs: 1,
      includeDiagnostics: true,
    });

    const orchestrator = new LangChainChatOrchestrator({
      model: new SlowFakeModel() as never,
    });

    const result = await orchestrator.generate({
      history: [],
      text: 'Who painted this?',
      locale: 'en-US',
      museumMode: false,
      requestId: 'timeout-test',
    });

    expect(result.text).toBeTruthy();
    expect(result.metadata.diagnostics?.degraded).toBe(true);
    expect(result.metadata.diagnostics?.sections[0].status).toBe('fallback');
  });
});
