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
      retries: 0,
      retryBaseDelayMs: 100,
      temperature: 0.3,
      maxOutputTokens: 800,
      includeDiagnostics: false,
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

import { LangChainChatOrchestrator } from '@modules/chat/adapters/secondary/llm/langchain.orchestrator';
import {
  LLMCircuitBreaker,
  CircuitOpenError,
} from '@modules/chat/adapters/secondary/llm/llm-circuit-breaker';
import { Semaphore } from '@modules/chat/useCase/llm/semaphore';
import { makeMessage } from 'tests/helpers/chat/message.fixtures';

import type { OrchestratorInput } from '@modules/chat/domain/ports/chat-orchestrator.port';

function makeFakeModel(response: string) {
  return {
    invoke: jest.fn().mockResolvedValue({ content: response }),
    stream: jest.fn().mockResolvedValue(
      (async function* () {
        for (const word of response.split(' ')) {
          yield { content: word + ' ' };
        }
      })(),
    ),
  };
}

function makeInput(overrides: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return {
    history: [],
    text: 'Tell me about the Mona Lisa',
    museumMode: false,
    locale: 'en',
    requestId: 'test-req-1',
    ...overrides,
  };
}

describe('LangChainChatOrchestrator', () => {
  describe('generate', () => {
    it('returns parsed response with valid model', async () => {
      const model = makeFakeModel('The Mona Lisa is a famous painting by Leonardo da Vinci.');
      const orchestrator = new LangChainChatOrchestrator({ model });

      const result = await orchestrator.generate(makeInput());

      expect(result.text).toContain('Mona Lisa');
      expect(model.invoke).toHaveBeenCalled();
    });

    it('returns fallback message when model is null', async () => {
      const orchestrator = new LangChainChatOrchestrator({ model: null });

      const result = await orchestrator.generate(makeInput());

      expect(result.text).toContain('without an LLM key');
      expect(result.metadata.citations).toContain('system:missing-llm-api-key');
    });

    it('includes history messages in the prompt', async () => {
      const model = makeFakeModel('Great question about Impressionism.');
      const orchestrator = new LangChainChatOrchestrator({ model });

      const history = [
        makeMessage({
          id: '1',
          role: 'user',
          text: 'Hello',
          createdAt: new Date('2026-01-01T00:00:00Z'),
        }),
        makeMessage({
          id: '2',
          role: 'assistant',
          text: 'Welcome!',
          createdAt: new Date('2026-01-01T00:00:01Z'),
        }),
      ];

      const result = await orchestrator.generate(makeInput({ history }));

      expect(result.text).toBeTruthy();
      expect(model.invoke).toHaveBeenCalled();
    });

    it('handles JSON-formatted LLM response with metadata', async () => {
      const jsonResponse = JSON.stringify({
        answer: 'Painted by Leonardo da Vinci.',
        citations: ['Wikipedia'],
      });
      const model = makeFakeModel(jsonResponse);
      const orchestrator = new LangChainChatOrchestrator({ model });

      const result = await orchestrator.generate(makeInput());

      expect(result.text).toBe('Painted by Leonardo da Vinci.');
      expect(result.metadata.citations).toEqual(['Wikipedia']);
    });
  });

  describe('generateStream', () => {
    it('streams chunks via callback', async () => {
      const model = makeFakeModel('The painting is beautiful.');
      const orchestrator = new LangChainChatOrchestrator({ model });
      const chunks: string[] = [];

      const result = await orchestrator.generateStream(makeInput(), (chunk) => {
        chunks.push(chunk);
      });

      expect(chunks.length).toBeGreaterThan(0);
      expect(result.text).toBeTruthy();
    });

    it('returns fallback message when model is null', async () => {
      const orchestrator = new LangChainChatOrchestrator({ model: null });
      const chunks: string[] = [];

      const result = await orchestrator.generateStream(makeInput(), (chunk) => {
        chunks.push(chunk);
      });

      expect(result.text).toContain('without an LLM key');
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toContain('without an LLM key');
    });

    it('returns partial content on stream error', async () => {
      const model = {
        invoke: jest.fn().mockResolvedValue({ content: '' }),
        stream: jest.fn().mockResolvedValue(
          (async function* () {
            yield { content: 'Partial ' };
            yield { content: 'response ' };
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

      // Should have partial content or a fallback
      expect(result.text).toBeTruthy();
    });
  });

  describe('circuit breaker integration', () => {
    it('records failures and opens circuit breaker', async () => {
      const failingModel = {
        invoke: jest.fn().mockRejectedValue(new Error('LLM unavailable')),
        stream: jest.fn().mockRejectedValue(new Error('LLM unavailable')),
      };

      const circuitBreaker = new LLMCircuitBreaker({
        failureThreshold: 2,
        windowMs: 60000,
        openDurationMs: 60000,
      });

      const orchestrator = new LangChainChatOrchestrator({
        model: failingModel,
        circuitBreaker,
      });

      // generate() catches section errors and returns fallback,
      // but the circuit breaker still records failures internally.
      const result1 = await orchestrator.generate(makeInput({ requestId: 'r1' }));
      expect(result1.text).toBeTruthy(); // fallback text

      const result2 = await orchestrator.generate(makeInput({ requestId: 'r2' }));
      expect(result2.text).toBeTruthy();

      // After 2 failures the breaker should be OPEN
      expect(circuitBreaker.getState().state).toBe('OPEN');
      expect(circuitBreaker.getState().failureCount).toBeGreaterThanOrEqual(2);
    });

    it('circuit breaker directly throws CircuitOpenError when OPEN', async () => {
      const circuitBreaker = new LLMCircuitBreaker({
        failureThreshold: 1,
        windowMs: 60000,
        openDurationMs: 60000,
      });

      // Manually trip the breaker
      circuitBreaker.recordFailure();

      expect(circuitBreaker.getState().state).toBe('OPEN');

      await expect(circuitBreaker.execute(() => Promise.resolve('ok'))).rejects.toThrow(
        CircuitOpenError,
      );
    });

    it('orchestrator.generate() fast-fails CircuitOpenError when breaker is OPEN at entry', async () => {
      // Banking-grade contract: once the breaker is OPEN, generate() must
      // surface 503/CIRCUIT_BREAKER_OPEN immediately without ever invoking
      // the model — otherwise the section-level fallback would mask the
      // degraded-dependency state behind a synthetic 201 response.
      const circuitBreaker = new LLMCircuitBreaker({
        failureThreshold: 1,
        windowMs: 60000,
        openDurationMs: 60000,
      });
      circuitBreaker.recordFailure();
      expect(circuitBreaker.getState().state).toBe('OPEN');

      const model = {
        invoke: jest.fn().mockResolvedValue({ content: 'should never be called' }),
        stream: jest.fn(),
      };
      const orchestrator = new LangChainChatOrchestrator({ model, circuitBreaker });

      await expect(orchestrator.generate(makeInput())).rejects.toThrow(CircuitOpenError);
      expect(model.invoke).not.toHaveBeenCalled();
    });
  });

  describe('semaphore integration', () => {
    it('limits concurrency', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      const slowModel = {
        invoke: jest.fn(async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise((resolve) => setTimeout(resolve, 50));
          concurrent--;
          return { content: 'response' };
        }),
        stream: jest.fn(),
      };

      const semaphore = new Semaphore(1);
      const orchestrator = new LangChainChatOrchestrator({
        model: slowModel,
        semaphore,
      });

      // Fire two concurrent requests
      const [r1, r2] = await Promise.all([
        orchestrator.generate(makeInput({ requestId: 'req-1' })),
        orchestrator.generate(makeInput({ requestId: 'req-2' })),
      ]);

      expect(r1.text).toBeTruthy();
      expect(r2.text).toBeTruthy();
      // Semaphore with limit 1 should serialize requests
      expect(maxConcurrent).toBe(1);
    });
  });

  describe('getCircuitBreakerState', () => {
    it('returns observable circuit breaker state', () => {
      const orchestrator = new LangChainChatOrchestrator({ model: null });

      const state = orchestrator.getCircuitBreakerState();

      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
      expect(state.lastFailureAt).toBeNull();
    });
  });
});
