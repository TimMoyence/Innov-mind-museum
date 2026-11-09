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

import { CircuitOpenError } from '@modules/chat/domain/errors/circuit-open.error';
import { LangChainChatOrchestrator } from '@modules/chat/adapters/secondary/llm/langchain.orchestrator';
import { LLMCircuitBreaker } from '@modules/chat/adapters/secondary/llm/llm-circuit-breaker';

import {
  makeCostBreaker,
  makeHalfOpenCostBreaker,
  makeOpenCostBreaker,
} from 'tests/helpers/chat/costBreaker.fixtures';

import type { OrchestratorInput } from '@modules/chat/domain/ports/chat-orchestrator.port';

function makeInput(overrides: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return {
    history: [],
    text: 'Tell me about the Mona Lisa',
    museumMode: false,
    locale: 'en',
    requestId: 'test-req-cost-breaker',
    userId: 42,
    museumId: 7,
    ...overrides,
  };
}

const SUCCESS_SECTION_RESPONSE = {
  text: 'The Mona Lisa is a portrait.',
  deeperContext: null,
  openQuestion: null,
  imageDescription: null,
  suggestedImages: null,
  detectedArtwork: null,
  recommendations: null,
  expertiseSignal: null,
  citations: null,
  sources: null,
} as const;

interface FakeModelHandles {
  model: {
    invoke: jest.Mock;
    stream: jest.Mock;
    withStructuredOutput: jest.Mock;
  };
  structuredInvoke: jest.Mock;
}

function makeFakeModel(
  invokeImpl: jest.Mock = jest.fn().mockResolvedValue(SUCCESS_SECTION_RESPONSE),
): FakeModelHandles {
  const structuredInvoke = invokeImpl;
  return {
    structuredInvoke,
    model: {
      invoke: jest.fn(),
      stream: jest.fn().mockResolvedValue(
        (async function* () {
          yield { content: 'unused' };
        })(),
      ),
      withStructuredOutput: jest.fn(() => ({ invoke: structuredInvoke })),
    },
  };
}

function makeFailingFakeModel(err: Error): FakeModelHandles {
  return makeFakeModel(jest.fn().mockRejectedValue(err));
}

const SUCCESS_WALK_RESPONSE = {
  answer: 'Head north along the Seine.',
  suggestions: ['Pont Neuf'],
} as const;

function makeFakeWalkModel(
  invokeImpl: jest.Mock = jest.fn().mockResolvedValue(SUCCESS_WALK_RESPONSE),
): FakeModelHandles {
  return makeFakeModel(invokeImpl);
}

describe('LangChainChatOrchestrator — C2 cost-breaker guards (RUN_ID 2026-05-21-p0-c2-cost-breaker)', () => {
  describe('R1 — invokeSection() cost guard (default path)', () => {
    it('rejects with CircuitOpenError when costBreaker.canAttempt() returns false', async () => {
      const { model } = makeFakeModel();
      const orchestrator = new LangChainChatOrchestrator({
        model,
        costBreaker: makeOpenCostBreaker(),
      });

      await expect(orchestrator.generate(makeInput())).rejects.toBeInstanceOf(CircuitOpenError);
    });

    it('NEVER calls structured.invoke when costBreaker is OPEN', async () => {
      const { model, structuredInvoke } = makeFakeModel();
      const orchestrator = new LangChainChatOrchestrator({
        model,
        costBreaker: makeOpenCostBreaker(),
      });

      try {
        await orchestrator.generate(makeInput());
      } catch {}

      expect(structuredInvoke).not.toHaveBeenCalled();
    });

    it('thrown CircuitOpenError carries statusCode 503 + code CIRCUIT_BREAKER_OPEN', async () => {
      const { model } = makeFakeModel();
      const orchestrator = new LangChainChatOrchestrator({
        model,
        costBreaker: makeOpenCostBreaker(),
      });

      await expect(orchestrator.generate(makeInput())).rejects.toMatchObject({
        statusCode: 503,
        code: 'CIRCUIT_BREAKER_OPEN',
      });
    });

    it('calls costBreaker.canAttempt() BEFORE structured.invoke (order spy)', async () => {
      const canAttempt = jest.fn(() => true);
      const { model, structuredInvoke } = makeFakeModel();
      const orchestrator = new LangChainChatOrchestrator({
        model,
        costBreaker: makeCostBreaker({ canAttempt }),
      });

      await orchestrator.generate(makeInput());

      expect(canAttempt).toHaveBeenCalled();
      expect(structuredInvoke).toHaveBeenCalled();
      const canAttemptOrder = canAttempt.mock.invocationCallOrder[0];
      const invokeOrder = structuredInvoke.mock.invocationCallOrder[0];
      expect(canAttemptOrder).toBeDefined();
      expect(invokeOrder).toBeDefined();
      expect(canAttemptOrder).toBeLessThan(invokeOrder);
    });

    it('allows structured.invoke when cost breaker is CLOSED (baseline parity)', async () => {
      const { model, structuredInvoke } = makeFakeModel();
      const orchestrator = new LangChainChatOrchestrator({
        model,
        costBreaker: makeCostBreaker({ state: 'CLOSED', canAttempt: () => true }),
      });

      const result = await orchestrator.generate(makeInput());
      expect(structuredInvoke).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('R3 — generateWalk() cost + latency guards (walk path parity)', () => {
    it('rejects with CircuitOpenError when costBreaker.canAttempt() returns false on walk', async () => {
      const { model } = makeFakeWalkModel();
      const orchestrator = new LangChainChatOrchestrator({
        model,
        costBreaker: makeOpenCostBreaker(),
      });

      await expect(orchestrator.generate(makeInput({ intent: 'walk' }))).rejects.toBeInstanceOf(
        CircuitOpenError,
      );
    });

    it('NEVER calls structured.invoke on walk when cost breaker is OPEN', async () => {
      const { model, structuredInvoke } = makeFakeWalkModel();
      const orchestrator = new LangChainChatOrchestrator({
        model,
        costBreaker: makeOpenCostBreaker(),
      });

      try {
        await orchestrator.generate(makeInput({ intent: 'walk' }));
      } catch {}

      expect(structuredInvoke).not.toHaveBeenCalled();
    });

    it('rejects with CircuitOpenError when latency circuitBreaker is OPEN on walk', async () => {
      const latencyBreaker = new LLMCircuitBreaker({
        failureThreshold: 1,
        windowMs: 60_000,
        openDurationMs: 60_000,
      });
      latencyBreaker.recordFailure();
      expect(latencyBreaker.getState().state).toBe('OPEN');

      const { model, structuredInvoke } = makeFakeWalkModel();
      const orchestrator = new LangChainChatOrchestrator({
        model,
        circuitBreaker: latencyBreaker,
        costBreaker: makeCostBreaker(),
      });

      await expect(orchestrator.generate(makeInput({ intent: 'walk' }))).rejects.toBeInstanceOf(
        CircuitOpenError,
      );
      expect(structuredInvoke).not.toHaveBeenCalled();
    });
  });

  describe('R9 — recordFailure() signal on HALF_OPEN probe failure', () => {
    it('invokeSection: calls costBreaker.recordFailure once when structured.invoke throws on HALF_OPEN probe', async () => {
      const recordFailure = jest.fn();
      const breaker = makeHalfOpenCostBreaker({ recordFailure });
      const { model } = makeFailingFakeModel(new Error('upstream 503'));

      const orchestrator = new LangChainChatOrchestrator({
        model,
        costBreaker: breaker,
      });

      try {
        await orchestrator.generate(makeInput());
      } catch {}

      expect(recordFailure).toHaveBeenCalledTimes(1);
    });

    it('generateWalk: calls costBreaker.recordFailure once when structured.invoke throws on HALF_OPEN probe', async () => {
      const recordFailure = jest.fn();
      const breaker = makeHalfOpenCostBreaker({ recordFailure });
      const { model } = makeFailingFakeModel(new Error('upstream 503'));

      const orchestrator = new LangChainChatOrchestrator({
        model,
        costBreaker: breaker,
      });

      try {
        await orchestrator.generate(makeInput({ intent: 'walk' }));
      } catch {}

      expect(recordFailure).toHaveBeenCalledTimes(1);
    });

    it('does NOT call recordFailure when cost breaker is CLOSED and structured.invoke throws', async () => {
      const recordFailure = jest.fn();
      const breaker = makeCostBreaker({
        state: 'CLOSED',
        canAttempt: () => true,
        recordFailure,
      });
      const { model } = makeFailingFakeModel(new Error('upstream 503'));

      const orchestrator = new LangChainChatOrchestrator({
        model,
        costBreaker: breaker,
      });

      try {
        await orchestrator.generate(makeInput({ intent: 'walk' }));
      } catch {}

      expect(recordFailure).not.toHaveBeenCalled();
    });
  });
});
