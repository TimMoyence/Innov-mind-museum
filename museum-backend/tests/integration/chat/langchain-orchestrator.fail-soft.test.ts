import { env } from '@src/config/env';
import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import { LangChainChatOrchestrator } from '@modules/chat/adapters/secondary/langchain.orchestrator';
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
  async invoke(messages: unknown, _options?: InvokeOptions): Promise<{ content: unknown }> {
    const serialized = JSON.stringify(messages);

    if (serialized.includes('[SECTION:summary]')) {
      return {
        content: JSON.stringify({
          answer: 'Summary answer',
          deeperContext: 'More context here.',
          followUpQuestions: ['What technique was used?'],
          citations: ['catalog-ref'],
        }),
      };
    }

    return { content: 'Unknown section' };
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
  async invoke(_messages: unknown, options?: InvokeOptions): Promise<{ content: unknown }> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 200);
      options?.signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new Error('TimeoutError: Request timed out.'));
        },
        { once: true },
      );
    });

    return { content: JSON.stringify({ answer: 'Too late' }) };
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
      model: new FakeSectionModel(),
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
    expect(result.metadata.followUpQuestions).toEqual(['What technique was used?']);
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
      model: new SlowFakeModel(),
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
