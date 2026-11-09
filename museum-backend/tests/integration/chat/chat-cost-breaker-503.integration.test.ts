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
