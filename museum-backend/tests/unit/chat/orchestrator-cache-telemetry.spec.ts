/**
 * C9.5 — TDD red lock for prompt-cache telemetry (R5..R12 from spec.md).
 *
 * Five test cases mapped to spec EARS:
 *   1. cached_tokens captured in Langfuse generation.end() payload (R9).
 *   2. Prom counter incremented with cache_status="hit" on cache_read=input_tokens (R6/R8).
 *   3. Prom counter incremented with cache_status="partial" on 0 < cache_read < input (R6/R8).
 *   4. Prom counter incremented with cache_status="miss" on cache_read=0 (R6/R8).
 *   5. Deepseek fail-open — usage_metadata absent → cache_status="miss", no throw (R7).
 *
 * Expected RED state today (4bf040b7 HEAD, before T2.3 / T2.4 / T2.5 green):
 *   - All 5 cases FAIL because:
 *     * Orchestrator does not call `withStructuredOutput({ includeRaw: true })`.
 *     * `llmPromptCacheHitsTotal` Counter is declared but `.inc()` call sites
 *       are absent (the green commits add the helper + wiring).
 *     * Langfuse generation.end() payload lacks `usage` / `metadata.cacheStatus`.
 *
 * Once T2.3 (helper) + T2.4 (orchestrator wiring) + T2.5 (Langfuse usageRef)
 * are green, all 5 cases flip green.
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
import { getLangfuse } from '@shared/observability/langfuse.client';
import { logger } from '@shared/logger/logger';
import { llmPromptCacheHitsTotal, registry } from '@shared/observability/prometheus-metrics';

import type { OrchestratorInput } from '@modules/chat/domain/ports/chat-orchestrator.port';
/* eslint-enable import/first */

const getLangfuseMock = getLangfuse as jest.MockedFunction<typeof getLangfuse>;

/**
 * Builds a fake Langfuse client where every call site is a jest spy. Mirrors
 * the pattern in `tests/unit/observability/langchain-orchestrator-tracing.test.ts`.
 */
function makeFakeLangfuseClient() {
  const generationEnd = jest.fn();
  const fakeGeneration = { end: generationEnd };
  const traceGeneration = jest.fn().mockReturnValue(fakeGeneration);
  const fakeTrace = { generation: traceGeneration };
  const clientTrace = jest.fn().mockReturnValue(fakeTrace);
  const fakeClient = { trace: clientTrace };
  return { fakeClient, generationEnd };
}

interface FakeStructuredReturn {
  text: string;
}

interface IncludeRawShape {
  raw: { usage_metadata?: unknown };
  parsed: FakeStructuredReturn | null;
}

/**
 * Fake model whose `withStructuredOutput` returns a runnable resolving with
 * `{ raw: { usage_metadata }, parsed }` (R5 includeRaw shape). Pass
 * `rawUsage = undefined` to simulate Deepseek (missing usage_metadata path).
 */
function makeIncludeRawModel(rawUsage: unknown): {
  withStructuredOutput: jest.Mock;
  invoke: jest.Mock;
  stream: jest.Mock;
} {
  const parsed: FakeStructuredReturn = { text: 'Synthetic answer.' };
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

function makeInput(overrides: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return {
    history: [],
    text: 'Tell me about the Mona Lisa',
    museumMode: false,
    locale: 'en',
    requestId: 'cache-telemetry-req-1',
    sessionId: 'sess-cache-telemetry',
    intent: 'default',
    ...overrides,
  };
}

/**
 * Inspects the `llmPromptCacheHitsTotal` Counter for a specific (status,
 * provider) label-pair and returns the integer count (0 if absent). Uses the
 * `prom-client` `hashMap` accessor pattern (same as other Prom-Counter tests
 * in the repo — e.g. `prometheus-metrics.test.ts`).
 */
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

describe('LangChainChatOrchestrator — prompt-cache telemetry (C9.5)', () => {
  beforeEach(() => {
    registry.resetMetrics();
    getLangfuseMock.mockReset();
    (logger.info as jest.MockedFunction<typeof logger.info>).mockReset();
    (logger.warn as jest.MockedFunction<typeof logger.warn>).mockReset();
  });

  it('Test 1 — captures `cached_tokens` on the Langfuse generation.end() payload', async () => {
    const { fakeClient, generationEnd } = makeFakeLangfuseClient();
    getLangfuseMock.mockReturnValue(fakeClient as unknown as ReturnType<typeof getLangfuse>);

    const model = makeIncludeRawModel({
      input_tokens: 1000,
      output_tokens: 50,
      total_tokens: 1050,
      input_token_details: { cache_read: 200 },
    });

    const orchestrator = new LangChainChatOrchestrator({ model: model as never });
    await orchestrator.generate(makeInput());

    expect(generationEnd).toHaveBeenCalledTimes(1);
    const endArg = generationEnd.mock.calls[0]?.[0] as Record<string, unknown>;
    // Design §7.4 — `usage` block on the C9.0 generation.end() payload, with
    // `cache_read` numeric and `metadata.cacheStatus` enum.
    expect(endArg).toMatchObject({
      usage: expect.objectContaining({
        input: 1000,
        cache_read: 200,
      }),
      metadata: expect.objectContaining({
        cacheStatus: 'partial',
      }),
    });
  });

  it('Test 2 — Prom counter increments {cache_status="hit", provider="openai"} when cache_read === input_tokens', async () => {
    const model = makeIncludeRawModel({
      input_tokens: 200,
      input_token_details: { cache_read: 200 },
    });
    const orchestrator = new LangChainChatOrchestrator({ model: model as never });

    await orchestrator.generate(makeInput());

    expect(getCacheCounterValue('hit', 'openai')).toBe(1);
    expect(getCacheCounterValue('partial', 'openai')).toBe(0);
    expect(getCacheCounterValue('miss', 'openai')).toBe(0);
  });

  it('Test 3 — Prom counter increments {cache_status="partial", provider="openai"} when 0 < cache_read < input_tokens', async () => {
    const model = makeIncludeRawModel({
      input_tokens: 200,
      input_token_details: { cache_read: 100 },
    });
    const orchestrator = new LangChainChatOrchestrator({ model: model as never });

    await orchestrator.generate(makeInput());

    expect(getCacheCounterValue('partial', 'openai')).toBe(1);
    expect(getCacheCounterValue('hit', 'openai')).toBe(0);
    expect(getCacheCounterValue('miss', 'openai')).toBe(0);
  });

  it('Test 4 — Prom counter increments {cache_status="miss", provider="openai"} when cache_read === 0', async () => {
    const model = makeIncludeRawModel({
      input_tokens: 200,
      input_token_details: { cache_read: 0 },
    });
    const orchestrator = new LangChainChatOrchestrator({ model: model as never });

    await orchestrator.generate(makeInput());

    expect(getCacheCounterValue('miss', 'openai')).toBe(1);
    expect(getCacheCounterValue('hit', 'openai')).toBe(0);
    expect(getCacheCounterValue('partial', 'openai')).toBe(0);
  });

  it('Test 5 — Deepseek fail-open: usage_metadata absent → classified as `miss`, no exception', async () => {
    // `rawUsage = undefined` mirrors the Deepseek case (R7 + OQ-3) — the
    // OpenAI-compatible adapter exposes no `usage_metadata.input_token_details`.
    const model = makeIncludeRawModel(undefined);
    const orchestrator = new LangChainChatOrchestrator({ model: model as never });

    // MUST NOT throw — chat path stays healthy on the telemetry blind spot.
    await expect(orchestrator.generate(makeInput())).resolves.toBeDefined();

    // Even with `provider="openai"` in the mock env, R7 forces "miss" because
    // there is no `cache_read` to read. The test asserts the classifier
    // selected `miss` (not a crash, not a thrown error).
    expect(getCacheCounterValue('miss', 'openai')).toBe(1);
  });
});
