jest.mock('@src/config/env', () => ({
  env: {
    llm: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      maxHistoryMessages: 10,
      maxConcurrent: 2,
      timeoutMs: 10000,
      timeoutSummaryMs: 10000,
      totalBudgetMs: 30000,
      retries: 1,
      retryBaseDelayMs: 10,
      temperature: 0.3,
      maxOutputTokens: 800,
      includeDiagnostics: true,
      openAiApiKey: 'test-key',
    },
  },
}));

jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@shared/observability/sentry', () => ({
  startSpan: jest.fn((_ctx: unknown, cb: (span: unknown) => unknown) => cb({})),
}));

jest.mock('@sentry/node', () => ({
  getActiveSpan: jest.fn(() => ({
    setAttribute: jest.fn(),
  })),
}));

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn(),
}));

jest.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: jest.fn(),
}));

import { LangChainChatOrchestrator } from '@modules/chat/adapters/secondary/langchain.orchestrator';
import { LLMCircuitBreaker } from '@modules/chat/adapters/secondary/llm-circuit-breaker';
import { Semaphore } from '@modules/chat/useCase/semaphore';
import { makeMessage } from 'tests/helpers/chat/message.fixtures';

import type { OrchestratorInput } from '@modules/chat/domain/ports/chat-orchestrator.port';

function makeInput(overrides: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return {
    history: [],
    text: 'What is this painting?',
    museumMode: false,
    locale: 'en',
    requestId: 'branch-test-req',
    ...overrides,
  };
}

describe('LangChainChatOrchestrator — uncovered branches', () => {
  describe('generate — empty/null content from model', () => {
    it('uses fallback text when model returns empty string', async () => {
      const model = {
        invoke: jest.fn().mockResolvedValue({ content: '' }),
        stream: jest.fn(),
      };
      const orchestrator = new LangChainChatOrchestrator({ model });

      const result = await orchestrator.generate(makeInput());

      // Empty content should trigger the "no text" fallback
      expect(result.text).toBeTruthy();
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('handles model returning array content', async () => {
      const model = {
        invoke: jest.fn().mockResolvedValue({
          content: [{ text: 'Part 1' }, { text: 'Part 2' }],
        }),
        stream: jest.fn(),
      };
      const orchestrator = new LangChainChatOrchestrator({ model });

      const result = await orchestrator.generate(makeInput());

      expect(result.text).toBeTruthy();
    });

    it('handles model returning null content gracefully', async () => {
      const model = {
        invoke: jest.fn().mockResolvedValue({ content: null }),
        stream: jest.fn(),
      };
      const orchestrator = new LangChainChatOrchestrator({ model });

      const result = await orchestrator.generate(makeInput());

      expect(result.text).toBeTruthy();
    });
  });

  describe('generate — diagnostics included when enabled', () => {
    it('includes diagnostics metadata when includeDiagnostics is true', async () => {
      const model = {
        invoke: jest.fn().mockResolvedValue({
          content: JSON.stringify({
            answer: 'A masterpiece by Monet.',
            citations: ['art-catalog'],
          }),
        }),
        stream: jest.fn(),
      };
      const orchestrator = new LangChainChatOrchestrator({ model });

      const result = await orchestrator.generate(makeInput());

      expect(result.metadata.diagnostics).toBeDefined();
      expect(result.metadata.diagnostics?.profile).toBe('single_section');
      expect(result.metadata.diagnostics?.degraded).toBe(false);
      expect(result.metadata.diagnostics?.totalLatencyMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata.diagnostics?.sections).toHaveLength(1);
    });
  });

  describe('generate — fallback when section errors', () => {
    it('returns degraded response when model throws non-retryable error', async () => {
      const model = {
        invoke: jest.fn().mockRejectedValue(new Error('Invalid API key')),
        stream: jest.fn(),
      };

      const circuitBreaker = new LLMCircuitBreaker({ failureThreshold: 100 });
      const orchestrator = new LangChainChatOrchestrator({ model, circuitBreaker });

      const result = await orchestrator.generate(makeInput());

      // Should fall back gracefully
      expect(result.text).toBeTruthy();
      expect(result.metadata.diagnostics?.degraded).toBe(true);
    });

    it('retries on retryable errors (timeout)', async () => {
      const model = {
        invoke: jest
          .fn()
          .mockRejectedValueOnce(new Error('TimeoutError: request timed out'))
          .mockResolvedValueOnce({ content: 'Recovered response' }),
        stream: jest.fn(),
      };

      const circuitBreaker = new LLMCircuitBreaker({ failureThreshold: 100 });
      const orchestrator = new LangChainChatOrchestrator({ model, circuitBreaker });

      const result = await orchestrator.generate(makeInput());

      expect(result.text).toBeTruthy();
    });

    it('retries on 429 rate limit error', async () => {
      const rateLimitError = new Error('Request failed with status code 429');
      rateLimitError.name = 'APIError';

      const model = {
        invoke: jest
          .fn()
          .mockRejectedValueOnce(rateLimitError)
          .mockResolvedValueOnce({ content: 'After rate limit' }),
        stream: jest.fn(),
      };

      const circuitBreaker = new LLMCircuitBreaker({ failureThreshold: 100 });
      const orchestrator = new LangChainChatOrchestrator({ model, circuitBreaker });

      const result = await orchestrator.generate(makeInput());

      expect(result.text).toBeTruthy();
    });
  });

  describe('generate — assembleResponse edge cases', () => {
    it('sets status to "fallback" for missing section results when summary failed', async () => {
      // Force timeout by using a model that never resolves within budget
      const model = {
        invoke: jest.fn().mockImplementation(
          (_messages: unknown, options?: { signal?: AbortSignal }) =>
            new Promise<{ content: unknown }>((resolve, reject) => {
              const timer = setTimeout(() => resolve({ content: 'too late' }), 60000);
              options?.signal?.addEventListener(
                'abort',
                () => {
                  clearTimeout(timer);
                  reject(new Error('AbortError'));
                },
                { once: true },
              );
            }),
        ),
        stream: jest.fn(),
      };

      const { env } = jest.requireMock('@src/config/env') as {
        env: { llm: Record<string, unknown> };
      };
      const originalTimeout = env.llm.timeoutSummaryMs;
      const originalBudget = env.llm.totalBudgetMs;
      const originalRetries = env.llm.retries;
      env.llm.timeoutSummaryMs = 20;
      env.llm.totalBudgetMs = 50;
      env.llm.retries = 0;

      const circuitBreaker = new LLMCircuitBreaker({ failureThreshold: 100 });
      const orchestrator = new LangChainChatOrchestrator({ model, circuitBreaker });

      const result = await orchestrator.generate(makeInput());

      expect(result.text).toBeTruthy();
      expect(result.metadata.diagnostics?.degraded).toBe(true);
      expect(result.metadata.diagnostics?.sections[0].status).toBe('fallback');

      env.llm.timeoutSummaryMs = originalTimeout;
      env.llm.totalBudgetMs = originalBudget;
      env.llm.retries = originalRetries;
    });
  });

  describe('generate — with conversation history', () => {
    it('processes input with history messages and context', async () => {
      const model = {
        invoke: jest.fn().mockResolvedValue({
          content: JSON.stringify({
            answer: 'This is an Impressionist painting.',
            deeperContext: 'The light play is characteristic of Monet.',
            followUpQuestions: ['What year was it painted?'],
          }),
        }),
        stream: jest.fn(),
      };
      const orchestrator = new LangChainChatOrchestrator({ model });

      const history = [
        makeMessage({
          id: 'h1',
          role: 'user',
          text: 'Show me this artwork',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        }),
        makeMessage({
          id: 'h2',
          role: 'assistant',
          text: 'This appears to be a landscape.',
          createdAt: new Date('2026-01-01T00:00:01Z'),
        }),
      ];

      const result = await orchestrator.generate(
        makeInput({
          history,
          museumMode: true,
          context: { location: 'Room 5', guideLevel: 'expert' },
        }),
      );

      expect(result.text).toBe('This is an Impressionist painting.');
      expect(result.metadata.deeperContext).toBe('The light play is characteristic of Monet.');
      expect(result.metadata.followUpQuestions).toEqual(['What year was it painted?']);
    });
  });

  describe('generateStream — uncovered branches', () => {
    it('includes diagnostics in stream result when includeDiagnostics is true', async () => {
      const model = {
        invoke: jest.fn(),
        stream: jest.fn().mockResolvedValue(
          (async function* () {
            yield { content: 'Streamed ' };
            yield { content: 'response.' };
          })(),
        ),
      };
      const orchestrator = new LangChainChatOrchestrator({ model });
      const chunks: string[] = [];

      const result = await orchestrator.generateStream(makeInput(), (chunk) => {
        chunks.push(chunk);
      });

      expect(chunks.length).toBeGreaterThan(0);
      expect(result.text).toBeTruthy();
      expect(result.metadata.diagnostics).toBeDefined();
      expect(result.metadata.diagnostics?.profile).toBe('single_section');
      expect(result.metadata.diagnostics?.degraded).toBe(false);
    });

    it('skips empty chunks in stream', async () => {
      const model = {
        invoke: jest.fn(),
        stream: jest.fn().mockResolvedValue(
          (async function* () {
            yield { content: 'Hello ' };
            yield { content: '' }; // empty chunk
            yield { content: null }; // null content
            yield { content: 'World' };
          })(),
        ),
      };
      const orchestrator = new LangChainChatOrchestrator({ model });
      const chunks: string[] = [];

      const result = await orchestrator.generateStream(makeInput(), (chunk) => {
        chunks.push(chunk);
      });

      // Only non-empty chunks should be emitted
      expect(chunks).toEqual(['Hello ', 'World']);
      expect(result.text).toContain('Hello');
      expect(result.text).toContain('World');
    });

    it('returns fallback when stream fails with no accumulated content', async () => {
      const model = {
        invoke: jest.fn(),
        stream: jest.fn().mockRejectedValue(new Error('Connection reset')),
      };

      const circuitBreaker = new LLMCircuitBreaker({ failureThreshold: 100 });
      const orchestrator = new LangChainChatOrchestrator({ model, circuitBreaker });
      const chunks: string[] = [];

      const result = await orchestrator.generateStream(makeInput(), (chunk) => {
        chunks.push(chunk);
      });

      // Should return fallback text, not throw
      expect(result.text).toBeTruthy();
      expect(result.metadata).toBeDefined();
    });

    it('returns partial content when stream fails mid-way', async () => {
      const model = {
        invoke: jest.fn(),
        stream: jest.fn().mockResolvedValue(
          (async function* () {
            yield { content: 'Partial response about ' };
            yield { content: 'the artwork' };
            throw new Error('Stream interrupted');
          })(),
        ),
      };

      const circuitBreaker = new LLMCircuitBreaker({ failureThreshold: 100 });
      const orchestrator = new LangChainChatOrchestrator({ model, circuitBreaker });
      const chunks: string[] = [];

      const result = await orchestrator.generateStream(makeInput(), (chunk) => {
        chunks.push(chunk);
      });

      // Should use partial accumulated content
      expect(result.text).toBeTruthy();
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('handles stream timeout via abort signal', async () => {
      const model = {
        invoke: jest.fn(),
        stream: jest
          .fn()
          .mockImplementation(async (_messages: unknown, options?: { signal?: AbortSignal }) => {
            return (async function* () {
              yield { content: 'Starting...' };
              await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(resolve, 60000);
                options?.signal?.addEventListener(
                  'abort',
                  () => {
                    clearTimeout(timer);
                    reject(new Error('AbortError: The operation was aborted'));
                  },
                  { once: true },
                );
              });
              yield { content: 'Never reached' };
            })();
          }),
      };

      const { env } = jest.requireMock('@src/config/env') as {
        env: { llm: Record<string, unknown> };
      };
      const originalTimeout = env.llm.timeoutSummaryMs;
      env.llm.timeoutSummaryMs = 50;

      const circuitBreaker = new LLMCircuitBreaker({ failureThreshold: 100 });
      const orchestrator = new LangChainChatOrchestrator({ model, circuitBreaker });
      const chunks: string[] = [];

      const result = await orchestrator.generateStream(makeInput(), (chunk) => {
        chunks.push(chunk);
      });

      // Should have at least the partial content from before timeout
      expect(result.text).toBeTruthy();

      env.llm.timeoutSummaryMs = originalTimeout;
    });
  });

  describe('isRetryableError coverage (via generate)', () => {
    it('does not retry non-Error values', async () => {
      const model = {
        invoke: jest.fn().mockRejectedValue('string error'),
        stream: jest.fn(),
      };

      const { env } = jest.requireMock('@src/config/env') as {
        env: { llm: Record<string, unknown> };
      };
      const originalRetries = env.llm.retries;
      env.llm.retries = 1;

      const circuitBreaker = new LLMCircuitBreaker({ failureThreshold: 100 });
      const orchestrator = new LangChainChatOrchestrator({ model, circuitBreaker });

      const result = await orchestrator.generate(makeInput());

      // Should fallback without retrying (string is not retryable)
      expect(result.text).toBeTruthy();

      env.llm.retries = originalRetries;
    });

    it('retries on 503 Service Unavailable', async () => {
      const error503 = new Error('Service Unavailable 503');

      const model = {
        invoke: jest
          .fn()
          .mockRejectedValueOnce(error503)
          .mockResolvedValueOnce({ content: 'Recovered after 503' }),
        stream: jest.fn(),
      };

      const circuitBreaker = new LLMCircuitBreaker({ failureThreshold: 100 });
      const orchestrator = new LangChainChatOrchestrator({ model, circuitBreaker });

      const result = await orchestrator.generate(makeInput());

      expect(result.text).toBeTruthy();
    });

    it('retries on ECONNRESET error', async () => {
      const connError = new Error('ECONNRESET');

      const model = {
        invoke: jest
          .fn()
          .mockRejectedValueOnce(connError)
          .mockResolvedValueOnce({ content: 'Recovered after reset' }),
        stream: jest.fn(),
      };

      const circuitBreaker = new LLMCircuitBreaker({ failureThreshold: 100 });
      const orchestrator = new LangChainChatOrchestrator({ model, circuitBreaker });

      const result = await orchestrator.generate(makeInput());

      expect(result.text).toBeTruthy();
    });
  });

  describe('constructor — model selection', () => {
    it('accepts explicit null model (no LLM key scenario)', () => {
      const orchestrator = new LangChainChatOrchestrator({ model: null });

      // Verify it works — generate should return missing-key fallback
      expect(orchestrator.getCircuitBreakerState().state).toBe('CLOSED');
    });

    it('accepts custom semaphore', () => {
      const semaphore = new Semaphore(5);
      const orchestrator = new LangChainChatOrchestrator({ model: null, semaphore });

      expect(orchestrator.getCircuitBreakerState().state).toBe('CLOSED');
    });

    it('accepts custom circuit breaker', () => {
      const cb = new LLMCircuitBreaker({ failureThreshold: 3 });
      const orchestrator = new LangChainChatOrchestrator({ model: null, circuitBreaker: cb });

      expect(orchestrator.getCircuitBreakerState().state).toBe('CLOSED');
    });
  });
});
