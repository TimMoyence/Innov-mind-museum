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

import type { OrchestratorInput } from '@modules/chat/domain/ports/chat-orchestrator.port';

function makeInput(overrides: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return {
    history: [],
    text: "Compare Monet's Water Lilies and Manet's Olympia.",
    museumMode: false,
    locale: 'en',
    requestId: 'structured-test-req',
    ...overrides,
  };
}

interface StructuredFakeReturn {
  text: string;
  suggestedImages?: {
    query: string;
    description: string;
    rationale: string;
    caption: string;
  }[];
  detectedArtwork?: {
    title?: string;
    artist?: string;
    confidence?: number;
    source?: string;
  };
  citations?: string[];
}

class FakeStructuredModel {
  capturedSchemaName: string | undefined;
  invokedStructured = 0;
  invokedLegacy = 0;
  private readonly returnValue: StructuredFakeReturn;

  constructor(returnValue: StructuredFakeReturn) {
    this.returnValue = returnValue;
  }

  withStructuredOutput(
    _schema: unknown,
    options?: { name?: string },
  ): {
    invoke: (messages: unknown, opts?: { signal?: AbortSignal }) => Promise<StructuredFakeReturn>;
  } {
    this.capturedSchemaName = options?.name;
    const captured = this.returnValue;
    const onInvoke = (): void => {
      this.invokedStructured += 1;
    };
    return {
      invoke: (): Promise<StructuredFakeReturn> => {
        onInvoke();
        return Promise.resolve(captured);
      },
    };
  }

  invoke = jest.fn(async () => {
    this.invokedLegacy += 1;
    throw new Error('legacy invoke path retired — see C9.17');
  });

  stream = jest.fn();
}

describe('LangChainChatOrchestrator — structured-output path (C2 fix 2026-05)', () => {
  it('routes through withStructuredOutput when the model supports it', async () => {
    const model = new FakeStructuredModel({
      text: 'Synthetic answer about Monet vs Manet.',
      suggestedImages: [
        {
          query: 'Monet Water Lilies painting',
          description: 'The Water Lilies series',
          rationale: 'Shows the impressionist brushwork central to the answer.',
          caption: 'Water Lilies by Monet',
        },
        {
          query: 'Manet Olympia painting',
          description: 'The Olympia portrait',
          rationale: 'Provides the contrasting realist composition cited.',
          caption: 'Olympia by Manet',
        },
      ],
      detectedArtwork: {
        title: 'Water Lilies',
        artist: 'Claude Monet',
        confidence: 0.9,
        source: 'test',
      },
      citations: ['c2-test'],
    });
    const orchestrator = new LangChainChatOrchestrator({ model: model as never });

    const result = await orchestrator.generate(makeInput());

    expect(model.invokedStructured).toBe(1);
    expect(model.invokedLegacy).toBe(0);
    expect(model.capturedSchemaName).toBe('MainAssistantOutput');

    expect(result.text).toBe('Synthetic answer about Monet vs Manet.');
    expect(result.metadata.suggestedImages).toHaveLength(2);
    expect(result.metadata.suggestedImages?.[0]).toEqual({
      query: 'Monet Water Lilies painting',
      description: 'The Water Lilies series',
      rationale: 'Shows the impressionist brushwork central to the answer.',
      caption: 'Water Lilies by Monet',
    });
    expect(result.metadata.detectedArtwork?.title).toBe('Water Lilies');
    expect(result.metadata.citations).toEqual(['c2-test']);
  });

  it('preserves an empty suggestedImages array as undefined (non-visual subject)', async () => {
    const model = new FakeStructuredModel({
      text: 'Impressionism is a 19th-century movement…',
    });
    const orchestrator = new LangChainChatOrchestrator({ model: model as never });

    const result = await orchestrator.generate(makeInput({ text: 'What is impressionism?' }));

    expect(model.invokedStructured).toBe(1);
    expect(result.text).toBe('Impressionism is a 19th-century movement…');
    expect(result.metadata.suggestedImages).toBeUndefined();
  });

  it('fails closed when section has outputSchema but model lacks withStructuredOutput', async () => {
    const invokeSpy = jest.fn(async () => {
      throw new Error('legacy invoke should not be called');
    });
    const model = {
      invoke: invokeSpy,
      stream: jest.fn(),
    };
    const orchestrator = new LangChainChatOrchestrator({ model: model as never });

    const result = await orchestrator.generate(makeInput({ text: 'Tell me about the Mona Lisa.' }));

    expect(invokeSpy).not.toHaveBeenCalled();
    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
  });
});
