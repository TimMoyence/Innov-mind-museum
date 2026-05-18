/**
 * Tests for C9.4 — orchestrator wires `LlmCostCircuitBreaker.recordCharge`
 * after each successful section invoke. Spec R1, R2, R3.
 */

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
    langfuse: { enabled: false },
  },
}));

jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
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
import { LlmCostCircuitBreaker } from '@modules/chat/adapters/secondary/llm/llm-cost-circuit-breaker';

import type { OrchestratorInput } from '@modules/chat/domain/ports/chat-orchestrator.port';

function makeFakeModel(response: string) {
  const structuredInvoke = jest.fn().mockResolvedValue({
    text: response,
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
  });
  return {
    invoke: jest.fn(),
    stream: jest.fn().mockResolvedValue(
      (async function* () {
        yield { content: response };
      })(),
    ),
    withStructuredOutput: jest.fn(() => ({ invoke: structuredInvoke })),
  };
}

function makeThrowingModel(err: Error) {
  const structuredInvoke = jest.fn().mockRejectedValue(err);
  return {
    invoke: jest.fn().mockRejectedValue(err),
    stream: jest.fn().mockRejectedValue(err),
    withStructuredOutput: jest.fn(() => ({ invoke: structuredInvoke })),
  };
}

function makeInput(overrides: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return {
    history: [],
    text: 'Tell me about the Mona Lisa',
    museumMode: false,
    locale: 'en',
    requestId: 'test-req-cost',
    userId: 42,
    museumId: 7,
    ...overrides,
  };
}

describe('LangChainChatOrchestrator cost recording (C9.4)', () => {
  describe('R1 — successful LLM call records charge', () => {
    it('invokes costBreaker.recordCharge at least once with positive integer cents', async () => {
      const recordCharge = jest.fn();
      const fakeBreaker = {
        recordCharge,
        canAttempt: () => true,
        getState: () => ({
          state: 'CLOSED' as const,
          hourlySpendCents: 0,
          dailySpendCents: 0,
          lastTripAt: null,
          openedAt: null,
        }),
      };

      const orchestrator = new LangChainChatOrchestrator({
        model: makeFakeModel('The Mona Lisa is a portrait.'),
        costBreaker: fakeBreaker as unknown as LlmCostCircuitBreaker,
      });

      await orchestrator.generate(makeInput());

      expect(recordCharge).toHaveBeenCalled();
      const firstCallArg = recordCharge.mock.calls[0]?.[0];
      expect(typeof firstCallArg).toBe('number');
      expect(firstCallArg).toBeGreaterThan(0);
      expect(Number.isInteger(firstCallArg)).toBe(true);
    });
  });

  describe('R2 — failed LLM call does NOT record charge', () => {
    it('never invokes recordCharge when the model.invoke throws', async () => {
      const recordCharge = jest.fn();
      const fakeBreaker = {
        recordCharge,
        canAttempt: () => true,
        getState: () => ({
          state: 'CLOSED' as const,
          hourlySpendCents: 0,
          dailySpendCents: 0,
          lastTripAt: null,
          openedAt: null,
        }),
      };

      const orchestrator = new LangChainChatOrchestrator({
        model: makeThrowingModel(new Error('upstream 503')),
        costBreaker: fakeBreaker as unknown as LlmCostCircuitBreaker,
      });

      try {
        await orchestrator.generate(makeInput());
      } catch {
        // Expected — model failure surfaces.
      }

      // Critical: NO charge recorded on the failed path. Some sections may have
      // succeeded before the global failure, so we allow zero charges; what we
      // ASSERT is that the entire path doesn't blow past a sane charge budget.
      // For the all-fail case (single section, failed model), expect exactly 0.
      expect(recordCharge).not.toHaveBeenCalled();
    });
  });

  describe('R3 — missing costBreaker dep is non-fatal', () => {
    it('does not throw when costBreaker is undefined; section result still returned', async () => {
      const orchestrator = new LangChainChatOrchestrator({
        model: makeFakeModel('A second test response.'),
        // costBreaker intentionally omitted
      });

      await expect(orchestrator.generate(makeInput())).resolves.toBeDefined();
    });
  });
});
