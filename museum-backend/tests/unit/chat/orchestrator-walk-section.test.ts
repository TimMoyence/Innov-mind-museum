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

import { LangChainChatOrchestrator } from '@modules/chat/adapters/secondary/langchain.orchestrator';
import { MISSING_LLM_KEY_FALLBACK } from '@modules/chat/adapters/secondary/langchain-orchestrator-support';

import type { OrchestratorInput } from '@modules/chat/domain/ports/chat-orchestrator.port';

function makeInput(overrides: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return {
    history: [],
    text: 'What should I see next?',
    museumMode: true,
    locale: 'en',
    requestId: 'walk-test-req',
    ...overrides,
  };
}

/**
 * Fake model that captures messages passed to it and returns a walk-structured output.
 * Implements `withStructuredOutput()` so the walk path can call it.
 */
class FakeWalkModel {
  capturedMessages: unknown[] = [];
  private readonly returnValue: { answer: string; suggestions: string[] };

  constructor(returnValue = { answer: 'Here is your answer', suggestions: ['Mona Lisa'] }) {
    this.returnValue = returnValue;
  }

  withStructuredOutput(_schema: unknown, _options?: unknown) {
    return {
      invoke: async (messages: unknown, _opts?: unknown) => {
        this.capturedMessages = messages as unknown[];
        return this.returnValue;
      },
    };
  }

  // Standard invoke for the non-walk path
  invoke = jest.fn().mockResolvedValue({
    content: JSON.stringify({ answer: 'Non-walk answer', citations: [] }),
  });

  stream = jest.fn().mockResolvedValue(
    (async function* () {
      yield { content: JSON.stringify({ answer: 'Non-walk stream answer' }) };
    })(),
  );
}

/**
 * Fake model for default (non-walk) path: captures messages from standard invoke,
 * does NOT implement withStructuredOutput (would throw if called on walk path).
 */
class FakeDefaultModel {
  capturedMessages: unknown[] = [];

  invoke = jest.fn(async (messages: unknown) => {
    this.capturedMessages = messages as unknown[];
    return {
      content: JSON.stringify({ answer: 'Default answer', citations: [] }),
    };
  });

  stream = jest.fn().mockResolvedValue(
    (async function* () {
      yield { content: JSON.stringify({ answer: 'Default stream answer' }) };
    })(),
  );
}

describe('LangChainChatOrchestrator — walk intent', () => {
  describe('generate() with intent=walk', () => {
    it('includes WALK_TOUR_GUIDE_SECTION as a system message', async () => {
      const model = new FakeWalkModel();
      const orchestrator = new LangChainChatOrchestrator({ model: model as never });

      await orchestrator.generate(makeInput({ intent: 'walk' }));

      // capturedMessages should include a SystemMessage whose content contains the walk section marker
      const messages = model.capturedMessages as {
        _getType?: () => string;
        content?: unknown;
        lc_kwargs?: { content?: unknown };
      }[];
      const contents = messages.map((m) => {
        // LangChain BaseMessage exposes content directly
        if (typeof m.content === 'string') return m.content;
        if (m.lc_kwargs && typeof m.lc_kwargs.content === 'string') return m.lc_kwargs.content;
        return '';
      });

      const hasWalkSection = contents.some((c) => c.includes('guided-walk museum companion'));
      expect(hasWalkSection).toBe(true);
    });

    it('returns suggestions from structured output', async () => {
      const model = new FakeWalkModel({ answer: 'hi', suggestions: ['Mona Lisa'] });
      const orchestrator = new LangChainChatOrchestrator({ model: model as never });

      const result = await orchestrator.generate(makeInput({ intent: 'walk' }));

      expect(result.text).toBe('hi');
      expect(result.suggestions).toEqual(['Mona Lisa']);
    });
  });

  describe('generate() with default intent', () => {
    it('returns no suggestions and does not inject the walk section', async () => {
      const model = new FakeDefaultModel();
      const orchestrator = new LangChainChatOrchestrator({ model: model as never });

      const result = await orchestrator.generate(makeInput({ intent: 'default' }));

      // suggestions should be absent for default path
      expect(result.suggestions).toBeUndefined();

      // captured messages should NOT contain the walk section marker
      const messages = model.capturedMessages as {
        content?: unknown;
        lc_kwargs?: { content?: unknown };
      }[];
      const contents = messages.map((m) => {
        if (typeof m.content === 'string') return m.content;
        if (m.lc_kwargs && typeof m.lc_kwargs.content === 'string') return m.lc_kwargs.content;
        return '';
      });
      const hasWalkSection = contents.some((c) => c.includes('guided-walk museum companion'));
      expect(hasWalkSection).toBe(false);
    });
  });

  describe('generate() with intent=walk and model=null', () => {
    it('falls back gracefully with MISSING_LLM_KEY_FALLBACK and no suggestions', async () => {
      const orchestrator = new LangChainChatOrchestrator({ model: null });

      const result = await orchestrator.generate(makeInput({ intent: 'walk' }));

      expect(result.text).toBe(MISSING_LLM_KEY_FALLBACK);
      expect(result.suggestions).toBeUndefined();
      expect(result.metadata.citations).toContain('system:missing-llm-api-key');
    });
  });

  describe('generateStream() with intent=walk', () => {
    it('emits full text as a single chunk and returns suggestions', async () => {
      const model = new FakeWalkModel({
        answer: 'Walk stream answer',
        suggestions: ['The Scream'],
      });
      const orchestrator = new LangChainChatOrchestrator({ model: model as never });
      const chunks: string[] = [];

      const result = await orchestrator.generateStream(makeInput({ intent: 'walk' }), (chunk) => {
        chunks.push(chunk);
      });

      expect(result.text).toBe('Walk stream answer');
      expect(result.suggestions).toEqual(['The Scream']);
      // Single chunk emitted (the whole answer)
      expect(chunks).toEqual(['Walk stream answer']);
    });
  });
});
