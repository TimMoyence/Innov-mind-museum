/**
 * RED integration test — C2 cost breaker end-to-end 503 surface.
 *
 * RUN_ID 2026-05-21-p0-c2-cost-breaker.
 * Spec §3 R2 — when the cost breaker is OPEN, the chat path MUST surface the
 *              `CircuitOpenError` (statusCode 503, code `CIRCUIT_BREAKER_OPEN`)
 *              verbatim through the chat-message service → route error
 *              middleware mapping. `mapOrchestratorError`
 *              (`chat-message.service.ts:61`) preserves `AppError` instances
 *              by design, so once the orchestrator throws the right shape it
 *              bubbles cleanly.
 * Design.md §6 — `chat-cost-breaker-503.integration.test.ts`.
 *
 * Today (RED) :
 *  - Default-path `invokeSection()` does NOT consult `costBreaker.canAttempt()`.
 *  - With an OPEN cost breaker, the orchestrator continues to call the fake
 *    LLM → either returns 200-OK with the fake response OR section-runner
 *    fallback. Either way: the path does NOT reject with CircuitOpenError.
 *
 * Green (T2.3 + T2.4) :
 *  - The guards added at `invokeSection()` + `generateWalk()` entry throw
 *    `CircuitOpenError`; `mapOrchestratorError` preserves it; the assertion
 *    below turns green.
 *
 * Wiring : we use `buildChatTestService()` with a real
 * `LangChainChatOrchestrator` (in-process; the cost breaker stub is injected
 * directly via DI). NO Express harness — `chat-message.service` is the
 * narrowest boundary that exercises `mapOrchestratorError` on the orchestrator
 * throw, which is the contract under test for R2.
 */

// NB: we DO NOT mock `@src/config/env` — the chat-service imports a wide
// adapter graph (LocationResolver → NominatimClient, etc.) whose top-level
// reads of `env.*` would NPE with a partial mock. The default `tests/helpers/
// jest-env-pgdatabase.setup.ts` covers PGDATABASE; everything else uses the
// real env values. Sentry / logger mocks remain narrow (avoid log noise).

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

import type { LangChainChatOrchestratorDeps } from '@modules/chat/adapters/secondary/llm/langchain-orchestrator-support';
import { buildChatTestService } from 'tests/helpers/chat/chatTestApp';
import { makeCostBreaker, makeOpenCostBreaker } from 'tests/helpers/chat/costBreaker.fixtures';

const SUCCESS_SECTION_RESPONSE = {
  text: 'A successful answer from the fake LLM.',
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

function makeFakeModel(
  invokeImpl = jest.fn().mockResolvedValue(SUCCESS_SECTION_RESPONSE),
): NonNullable<LangChainChatOrchestratorDeps['model']> {
  return {
    invoke: jest.fn(),
    stream: jest.fn().mockResolvedValue(
      (async function* () {
        yield { content: 'unused' };
      })(),
    ),
    withStructuredOutput: jest.fn(() => ({ invoke: invokeImpl })),
  } as unknown as NonNullable<LangChainChatOrchestratorDeps['model']>;
}

describe('chat cost breaker — end-to-end 503 surface (RUN_ID 2026-05-21-p0-c2-cost-breaker)', () => {
  it('OPEN cost breaker → chat-service postMessage rejects with 503 / CIRCUIT_BREAKER_OPEN (R2)', async () => {
    const orchestrator = new LangChainChatOrchestrator({
      model: makeFakeModel(),
      costBreaker: makeOpenCostBreaker(),
    });
    const chatService = buildChatTestService({ orchestrator });

    const session = await chatService.createSession({
      locale: 'en-US',
      museumMode: false,
      userId: 101,
    });

    await expect(
      chatService.postMessage(
        session.id,
        { text: 'Tell me about the Mona Lisa' },
        'integration-req-001',
        101,
      ),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: 'CIRCUIT_BREAKER_OPEN',
    });
  });

  it('CLOSED cost breaker → chat-service postMessage returns a valid response (baseline)', async () => {
    const orchestrator = new LangChainChatOrchestrator({
      model: makeFakeModel(),
      costBreaker: makeCostBreaker({ state: 'CLOSED', canAttempt: () => true }),
    });
    const chatService = buildChatTestService({ orchestrator });

    const session = await chatService.createSession({
      locale: 'en-US',
      museumMode: false,
      userId: 102,
    });

    const result = await chatService.postMessage(
      session.id,
      { text: 'Tell me about the Mona Lisa' },
      'integration-req-002',
      102,
    );

    expect(result.message.role).toBe('assistant');
    expect(typeof result.message.text).toBe('string');
  });
});
