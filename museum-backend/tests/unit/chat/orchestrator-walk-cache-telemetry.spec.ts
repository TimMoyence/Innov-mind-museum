/**
 * C9.5 D5.a — walk-intent path prompt-cache telemetry parity.
 *
 * The chat path (default intent) emits `llm_prompt_cache` telemetry via
 * `recordPromptCacheTelemetry` (Prom Counter + log + Langfuse usage block).
 * The walk path historically opted out (asymmetry comment on `generateWalk`,
 * design.md §D5.a marks the parity switch as "Chosen" but the code never
 * landed it).
 *
 * These tests lock the parity: `intent: 'walk'` MUST also pass
 * `includeRaw: true` to `withStructuredOutput` and MUST increment the same
 * Prom Counter with `provider="openai"` (and the appropriate `cache_status`
 * label derived from `usage_metadata.input_token_details.cache_read`).
 *
 * Expected RED state at HEAD = b73e1d85 (before this corrective):
 *   - walk path calls `withStructuredOutput(schema, { name })` without
 *     `includeRaw: true` → the fake's `parsed`/`raw` envelope is never
 *     returned → `recordPromptCacheTelemetry` is never invoked → Counter
 *     stays at 0 → assertions fail.
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
      maxTextLength: 4000,
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

jest.mock('@shared/observability/langfuse.client', () => ({
  getLangfuse: jest.fn(() => null),
}));

/* eslint-disable import/first -- jest.mock must hoist before imports */
import { LangChainChatOrchestrator } from '@modules/chat/adapters/secondary/llm/langchain.orchestrator';
import { llmPromptCacheHitsTotal, registry } from '@shared/observability/prometheus-metrics';

import type { OrchestratorInput } from '@modules/chat/domain/ports/chat-orchestrator.port';
/* eslint-enable import/first */

interface FakeWalkParsed {
  answer: string;
  suggestions: string[];
}

interface IncludeRawShape {
  raw: { usage_metadata?: unknown };
  parsed: FakeWalkParsed | null;
}

/**
 * Fake walk model whose `withStructuredOutput` returns a runnable resolving
 * with `{ raw: { usage_metadata }, parsed }`. Mirrors `makeIncludeRawModel`
 * from `orchestrator-cache-telemetry.spec.ts` but with the walk-shaped
 * `parsed` payload.
 * @param rawUsage
 */
function makeIncludeRawWalkModel(rawUsage: unknown): {
  withStructuredOutput: jest.Mock;
  invoke: jest.Mock;
  stream: jest.Mock;
} {
  const parsed: FakeWalkParsed = { answer: 'Walk answer.', suggestions: ['Mona Lisa'] };
  return {
    withStructuredOutput: jest.fn().mockImplementation(() => ({
      invoke: jest.fn().mockImplementation(() => {
        const raw: IncludeRawShape = {
          raw: { usage_metadata: rawUsage },
          parsed,
        };
        return Promise.resolve(raw);
      }),
    })),
    invoke: jest.fn(),
    stream: jest.fn(),
  };
}

function getCacheCounterValue(cacheStatus: string, provider: string): number {
  const hashMap = (
    llmPromptCacheHitsTotal as unknown as {
      hashMap: Record<string, { value: number; labels: Record<string, string> }>;
    }
  ).hashMap;
  for (const entry of Object.values(hashMap)) {
    if (entry.labels.cache_status === cacheStatus && entry.labels.provider === provider) {
      return entry.value;
    }
  }
  return 0;
}

function makeWalkInput(overrides: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return {
    history: [],
    text: 'What should I see next on the tour?',
    museumMode: true,
    locale: 'en',
    requestId: 'walk-cache-telemetry-req',
    sessionId: 'sess-walk-cache',
    intent: 'walk',
    ...overrides,
  };
}

describe('LangChainChatOrchestrator — walk intent prompt-cache telemetry (C9.5 D5.a)', () => {
  beforeEach(() => {
    registry.resetMetrics();
  });

  it('walk path increments Prom counter {cache_status="hit"} on full cache hit (cache_read === input_tokens)', async () => {
    const model = makeIncludeRawWalkModel({
      input_tokens: 300,
      output_tokens: 80,
      total_tokens: 380,
      input_token_details: { cache_read: 300 },
    });
    const orchestrator = new LangChainChatOrchestrator({ model: model as never });

    await orchestrator.generate(makeWalkInput());

    expect(getCacheCounterValue('hit', 'openai')).toBe(1);
    expect(getCacheCounterValue('partial', 'openai')).toBe(0);
    expect(getCacheCounterValue('miss', 'openai')).toBe(0);
  });

  it('walk path increments Prom counter {cache_status="partial"} on partial cache hit', async () => {
    const model = makeIncludeRawWalkModel({
      input_tokens: 300,
      output_tokens: 80,
      total_tokens: 380,
      input_token_details: { cache_read: 120 },
    });
    const orchestrator = new LangChainChatOrchestrator({ model: model as never });

    await orchestrator.generate(makeWalkInput());

    expect(getCacheCounterValue('partial', 'openai')).toBe(1);
    expect(getCacheCounterValue('hit', 'openai')).toBe(0);
    expect(getCacheCounterValue('miss', 'openai')).toBe(0);
  });

  it('walk path increments Prom counter {cache_status="miss"} on cache_read === 0', async () => {
    const model = makeIncludeRawWalkModel({
      input_tokens: 300,
      output_tokens: 80,
      total_tokens: 380,
      input_token_details: { cache_read: 0 },
    });
    const orchestrator = new LangChainChatOrchestrator({ model: model as never });

    await orchestrator.generate(makeWalkInput());

    expect(getCacheCounterValue('miss', 'openai')).toBe(1);
    expect(getCacheCounterValue('hit', 'openai')).toBe(0);
    expect(getCacheCounterValue('partial', 'openai')).toBe(0);
  });

  it('walk path requests includeRaw: true on the withStructuredOutput call (R10 parity)', async () => {
    const model = makeIncludeRawWalkModel({
      input_tokens: 100,
      input_token_details: { cache_read: 0 },
    });
    const orchestrator = new LangChainChatOrchestrator({ model: model as never });

    await orchestrator.generate(makeWalkInput());

    expect(model.withStructuredOutput).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ includeRaw: true }),
    );
  });
});
