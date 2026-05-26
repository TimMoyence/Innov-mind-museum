/**
 * M1 W5-C3 (RED, UFR-022) — OpenAiTextToSpeechService feeds the global LLM cost
 * circuit breaker on a successful synthesis, with the charge derived from the
 * (truncated) text length (design §D1/D2/D3/D5, AC2/AC5).
 *
 * We mock the breaker (`{ recordCharge: jest.fn() }`) and assert the
 * INTERACTION — the FSM itself is covered by `llm-cost-circuit-breaker.test.ts`.
 * fetch + env are mocked like the sibling `text-to-speech.test.ts`.
 *
 * FAILS today: `OpenAiTextToSpeechService` constructor takes no breaker
 * argument and never calls `recordCharge`.
 */

jest.mock('@src/config/env', () => ({
  env: {
    llm: {
      openAiApiKey: 'test-api-key',
      timeoutMs: 10000,
    },
    tts: {
      model: 'gpt-4o-mini-tts',
      voice: 'alloy',
      speed: 1,
      maxTextLength: 4096,
    },
  },
}));

import { OpenAiTextToSpeechService } from '@modules/chat/adapters/secondary/audio/text-to-speech.openai';
import { estimateTtsCostCents } from '@modules/chat/adapters/secondary/audio/voice-cost-pricing';

import type { LlmCostCircuitBreaker } from '@modules/chat/adapters/secondary/llm/llm-cost-circuit-breaker';

describe('OpenAiTextToSpeechService — cost breaker wiring', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('records the TTS cost (derived from text length) against the cost breaker after synthesis', async () => {
    const breaker = { recordCharge: jest.fn() };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
    });

    const service = new OpenAiTextToSpeechService(breaker as unknown as LlmCostCircuitBreaker);
    const text = 'a'.repeat(1000);
    await service.synthesize({ text });

    expect(breaker.recordCharge).toHaveBeenCalledTimes(1);
    expect(breaker.recordCharge).toHaveBeenCalledWith(estimateTtsCostCents(1000));
  });

  it('does not propagate a breaker error into the synthesis result (fail-open)', async () => {
    const breaker = {
      recordCharge: jest.fn(() => {
        throw new Error('boom');
      }),
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer),
    });

    const service = new OpenAiTextToSpeechService(breaker as unknown as LlmCostCircuitBreaker);

    await expect(service.synthesize({ text: 'hello' })).resolves.toMatchObject({
      contentType: 'audio/ogg',
    });
  });
});
