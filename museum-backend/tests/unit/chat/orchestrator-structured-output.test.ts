/**
 * Verifies the structured-output fast path of {@link LangChainChatOrchestrator}
 * for default (non-walk) intent — C2 image-chat fix 2026-05.
 *
 * Bug history: gpt-4o-mini occasionally ignored the `[META] {json}` directive
 * embedded in the summary section prompt on the first turn, returning the
 * answer text without the trailing `[META]` block. The legacy parser then
 * extracted `metadata: {}`, dropping `suggestedImages` — the fan-out fetcher
 * never ran, no images were attached, promptfoo c2-enrichment regressed at
 * 2/4 PASS.
 *
 * Fix: wire `model.withStructuredOutput(mainAssistantOutputSchema)` into the
 * default section invocation. OpenAI / Gemini honour
 * `response_format: json_schema` and return a parsed object; the orchestrator
 * re-stringifies it as `{ answer, ...metadata }` so the existing legacy
 * parser branch consumes it transparently.
 *
 * This file pins:
 *   1. Structured-output adapter is invoked when both the section ships a
 *      schema AND the model exposes `withStructuredOutput`.
 *   2. Fields produced by the schema (`text`, `suggestedImages`,
 *      `detectedArtwork`, etc.) make it to `OrchestratorOutput.metadata`.
 *   3. Models without `withStructuredOutput` fall back gracefully to the
 *      legacy text + [META] path.
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

/**
 * Fake model that exposes both `invoke` and `withStructuredOutput`. The
 * structured adapter is invoked by the orchestrator when the section ships a
 * schema; this fake captures the schema arg and returns a deterministic object.
 */
class FakeStructuredModel {
  capturedSchemaName: string | undefined;
  invokedStructured = 0;
  invokedLegacy = 0;
  private readonly returnValue: StructuredFakeReturn;

  constructor(returnValue: StructuredFakeReturn) {
    this.returnValue = returnValue;
  }

  withStructuredOutput(_schema: unknown, options?: { name?: string }): {
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
    return Promise.resolve({
      content: 'fallback text\n[META]\n{}',
    });
  });

  stream = jest.fn();
}

/**
 * Fake model that exposes only `invoke` (no `withStructuredOutput`). The
 * orchestrator must fall back to the legacy text + [META] path.
 */
class FakeLegacyModel {
  invokedStructured = 0;
  invokedLegacy = 0;

  invoke = jest.fn(async () => {
    this.invokedLegacy += 1;
    return Promise.resolve({
      content:
        "Plain answer about the comparison.\n[META]\n" +
        JSON.stringify({
          suggestedImages: [
            {
              query: 'Monet Water Lilies',
              description: 'Late series',
              rationale: 'Shows the brushwork.',
              caption: 'Water Lilies series',
            },
          ],
        }),
    });
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
      // No suggestedImages — non-visual subject.
    });
    const orchestrator = new LangChainChatOrchestrator({ model: model as never });

    const result = await orchestrator.generate(makeInput({ text: 'What is impressionism?' }));

    expect(model.invokedStructured).toBe(1);
    expect(result.text).toBe('Impressionism is a 19th-century movement…');
    expect(result.metadata.suggestedImages).toBeUndefined();
  });

  it('falls back gracefully to the legacy [META] path when withStructuredOutput is missing', async () => {
    const model = new FakeLegacyModel();
    const orchestrator = new LangChainChatOrchestrator({ model: model as never });

    const result = await orchestrator.generate(makeInput());

    expect(model.invokedStructured).toBe(0);
    expect(model.invokedLegacy).toBe(1);
    expect(result.text).toBe('Plain answer about the comparison.');
    expect(result.metadata.suggestedImages).toHaveLength(1);
    expect(result.metadata.suggestedImages?.[0].caption).toBe('Water Lilies series');
  });
});
