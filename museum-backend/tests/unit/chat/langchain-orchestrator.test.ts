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

/**
 * C9.17 — orchestrator default path now goes exclusively through
 * `model.withStructuredOutput(schema).invoke()`. Test fakes that previously
 * returned a plain `invoke({ content })` payload were migrated to also expose
 * `withStructuredOutput`, which returns the parsed `MainAssistantOutput`
 * shape directly.
 */
function makeFakeModel(answer: string, extra: Record<string, unknown> = {}) {
  const structuredInvoke = jest.fn().mockResolvedValue({
    text: answer,
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
    ...extra,
  });
  const model = {
    invoke: jest.fn().mockResolvedValue({ content: answer }),
    stream: jest.fn().mockResolvedValue(
      (async function* () {
        for (const word of answer.split(' ')) {
          yield { content: word + ' ' };
        }
      })(),
    ),
    withStructuredOutput: jest.fn(() => ({ invoke: structuredInvoke })),
    structuredInvoke,
  };
  return model;
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
      expect(model.structuredInvoke).toHaveBeenCalled();
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
      expect(model.structuredInvoke).toHaveBeenCalled();
    });

    it('handles structured-output response with metadata (C9.17)', async () => {
      const model = makeFakeModel('Painted by Leonardo da Vinci.', {
        citations: ['Wikipedia'],
      });
      const orchestrator = new LangChainChatOrchestrator({ model });

      const result = await orchestrator.generate(makeInput());

      expect(result.text).toBe('Painted by Leonardo da Vinci.');
      expect(result.metadata.citations).toEqual(['Wikipedia']);
    });
  });

  describe('circuit breaker integration', () => {
    it('records failures and opens circuit breaker', async () => {
      const structuredInvoke = jest.fn().mockRejectedValue(new Error('LLM unavailable'));
      const failingModel = {
        invoke: jest.fn().mockRejectedValue(new Error('LLM unavailable')),
        stream: jest.fn().mockRejectedValue(new Error('LLM unavailable')),
        withStructuredOutput: jest.fn(() => ({ invoke: structuredInvoke })),
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

      const slowStructuredInvoke = jest.fn(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 50));
        concurrent--;
        return {
          text: 'response',
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
      });
      const slowModel = {
        invoke: jest.fn(),
        stream: jest.fn(),
        withStructuredOutput: jest.fn(() => ({ invoke: slowStructuredInvoke })),
      };

      const semaphore = new Semaphore(1);
      const orchestrator = new LangChainChatOrchestrator({
        model: slowModel as never,
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
