import { env } from '@src/config/env';
import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import { LangChainChatOrchestrator } from '@modules/chat/adapters/secondary/langchain.orchestrator';

const createMessage = (
  id: string,
  role: 'user' | 'assistant',
  text: string,
): ChatMessage =>
  ({
    id,
    role,
    text,
    imageRef: null,
    metadata: null,
    createdAt: new Date('2026-02-18T10:00:00.000Z'),
    session: undefined as never,
    artworkMatches: [],
  }) as ChatMessage;

type InvokeOptions = {
  signal?: AbortSignal;
};

class FakeSectionModel {
  async invoke(
    messages: unknown,
    options?: InvokeOptions,
  ): Promise<{ content: unknown }> {
    const serialized = JSON.stringify(messages);

    if (serialized.includes('[SECTION:summary]')) {
      return {
        content: JSON.stringify({
          answer: 'Summary answer',
          citations: ['catalog-ref'],
        }),
      };
    }

    if (serialized.includes('[SECTION:expertCompact]')) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 100);
        options?.signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new Error('TimeoutError: Request timed out.'));
          },
          { once: true },
        );
      });

      return { content: 'Expert compact answer' };
    }

    return { content: 'Unknown section' };
  }
}

describe('LangChainChatOrchestrator fail-soft profile', () => {
  const previous = { ...env.llm };

  afterEach(() => {
    Object.assign(env.llm, previous);
  });

  it('returns summary with expert fallback when expert section times out', async () => {
    Object.assign(env.llm, {
      parallelEnabled: true,
      sectionsMaxConcurrent: 2,
      timeoutSummaryMs: 200,
      timeoutExpertCompactMs: 30,
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
    expect(result.text).toContain('Guided question');
    expect(result.metadata.citations).toEqual(['catalog-ref']);
    expect(result.metadata.diagnostics?.degraded).toBe(true);
    expect(result.metadata.diagnostics?.profile).toBe('parallel_sections');

    const expert = result.metadata.diagnostics?.sections.find(
      (section) => section.name === 'expertCompact',
    );
    expect(expert?.status).toBe('fallback');
  });

  it('keeps single-section profile when parallel flag is disabled', async () => {
    Object.assign(env.llm, {
      parallelEnabled: false,
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
      history: [],
      text: 'Who painted this?',
      locale: 'en-US',
      museumMode: false,
      requestId: 'single-section-test',
    });

    expect(result.text).toContain('Summary answer');
    expect(result.metadata.diagnostics?.profile).toBe('single_section');
    expect(result.metadata.diagnostics?.sections).toHaveLength(1);
    expect(result.metadata.diagnostics?.degraded).toBe(false);
  });
});
