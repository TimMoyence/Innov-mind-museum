/**
 * M1 W5-C3 (RED, UFR-022) — OpenAiAudioTranscriber feeds the global LLM cost
 * circuit breaker on a successful transcription (design §D1/D2/D5, AC1/AC5).
 *
 * We mock the breaker (`{ recordCharge: jest.fn() }`) and assert the
 * INTERACTION — the FSM itself is covered by `llm-cost-circuit-breaker.test.ts`.
 * fetch + env + observability are mocked like the sibling
 * `audio-transcriber.test.ts`.
 *
 * FAILS today: `OpenAiAudioTranscriber` constructor takes no breaker argument
 * and never calls `recordCharge`.
 */

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@shared/observability/sentry', () => ({
  startSpan: (_ctx: unknown, cb: () => unknown) => cb(),
}));

jest.mock('@src/config/env', () => ({
  env: {
    llm: {
      provider: 'openai',
      openAiApiKey: 'test-key',
      audioTranscriptionModel: 'gpt-4o-mini-transcribe',
      timeoutMs: 15000,
    },
  },
}));

import { OpenAiAudioTranscriber } from '@modules/chat/adapters/secondary/audio/audio-transcriber.openai';
import { estimateSttCostCents } from '@modules/chat/adapters/secondary/audio/voice-cost-pricing';

import type { LlmCostCircuitBreaker } from '@modules/chat/adapters/secondary/llm/llm-cost-circuit-breaker';

const validInput = {
  base64: Buffer.from('fake-audio-data').toString('base64'),
  mimeType: 'audio/m4a',
  locale: 'fr',
};

const okResponse = (): Response =>
  new Response(JSON.stringify({ text: 'bonjour' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('OpenAiAudioTranscriber — cost breaker wiring', () => {
  let fetchSpy: jest.SpiedFunction<typeof global.fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records the STT cost against the cost breaker after a successful transcription', async () => {
    const breaker = { recordCharge: jest.fn() };
    fetchSpy.mockResolvedValue(okResponse());

    const transcriber = new OpenAiAudioTranscriber(breaker as unknown as LlmCostCircuitBreaker);
    await transcriber.transcribe(validInput);

    expect(breaker.recordCharge).toHaveBeenCalledTimes(1);
    expect(breaker.recordCharge).toHaveBeenCalledWith(estimateSttCostCents());
  });

  it('does not propagate a breaker error into the transcription result (fail-open)', async () => {
    const breaker = {
      recordCharge: jest.fn(() => {
        throw new Error('boom');
      }),
    };
    fetchSpy.mockResolvedValue(okResponse());

    const transcriber = new OpenAiAudioTranscriber(breaker as unknown as LlmCostCircuitBreaker);

    await expect(transcriber.transcribe(validInput)).resolves.toMatchObject({
      text: 'bonjour',
      provider: 'openai',
    });
  });
});
