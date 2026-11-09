const mockNodeEnv = { value: 'test' as 'test' | 'development' | 'production' };

jest.mock('@src/config/env', () => ({
  __esModule: true,
  get env() {
    return {
      nodeEnv: mockNodeEnv.value,
      llm: {
        costGuard: { killSwitch: false, userDailyCapUsd: 0.5 },
      },
    };
  },
}));

import {
  llmCostGuard,
  setLlmCostCounter,
  _resetLlmCostCounter,
} from '@shared/middleware/llm-cost-guard.middleware';
import { AppError } from '@shared/errors/app.error';

import {
  makePartialRequest,
  makePartialResponse,
  makeNext,
  type MockRequestInit,
} from '../../../helpers/http/express-mock.helpers';
import { InMemoryLlmCostCounter } from 'tests/helpers/llm-cost-guard/in-memory-llm-cost-counter';

const TODAY_FLAT_USD = 0.002;

async function chargeFor(reqInit: MockRequestInit): Promise<number> {
  const counter = new InMemoryLlmCostCounter();
  const incrSpy = jest.spyOn(counter, 'increment');
  setLlmCostCounter(counter);

  const req = makePartialRequest({
    method: 'POST',
    user: { id: 'user-fanout-1' },
    ...reqInit,
  });
  const res = makePartialResponse();
  const next = makeNext();

  llmCostGuard(req, res, next);

  await new Promise<void>((resolve) => setImmediate(resolve));

  expect(next).toHaveBeenCalledTimes(1);
  expect((next as jest.Mock).mock.calls[0][0]).toBeUndefined();
  expect(incrSpy).toHaveBeenCalledTimes(1);

  const delta = incrSpy.mock.calls[0][2];
  expect(typeof delta).toBe('number');
  expect(Number.isNaN(delta)).toBe(false);
  return delta;
}

describe('llmCostGuard — route-keyed fan-out metering (I-FIX3 T1.1 RED)', () => {
  afterEach(() => {
    _resetLlmCostCounter();
    jest.restoreAllMocks();
  });

  it('charges the audio (STT+LLM+TTS) fan-out MORE than the flat single-call cost', async () => {
    const audioDelta = await chargeFor({
      baseUrl: '/api/chat/sessions/sess-1',
      path: '/audio',
      originalUrl: '/api/chat/sessions/sess-1/audio',
    });

    expect(audioDelta).toBeGreaterThan(TODAY_FLAT_USD);
  });

  it('charges /tts only the TTS sub-call cost (less than the full audio fan-out)', async () => {
    const ttsDelta = await chargeFor({
      baseUrl: '/api/chat/messages/msg-1',
      path: '/tts',
      originalUrl: '/api/chat/messages/msg-1/tts',
    });
    const audioDelta = await chargeFor({
      baseUrl: '/api/chat/sessions/sess-1',
      path: '/audio',
      originalUrl: '/api/chat/sessions/sess-1/audio',
    });

    expect(ttsDelta).toBeLessThan(audioDelta);
    expect(ttsDelta).toBeGreaterThan(0);
  });

  it('charges /messages the LLM (text) cost, ordered text <= audio and text >= tts', async () => {
    const textDelta = await chargeFor({
      baseUrl: '/api/chat/sessions/sess-1',
      path: '/messages',
      originalUrl: '/api/chat/sessions/sess-1/messages',
    });
    const ttsDelta = await chargeFor({
      baseUrl: '/api/chat/messages/msg-1',
      path: '/tts',
      originalUrl: '/api/chat/messages/msg-1/tts',
    });
    const audioDelta = await chargeFor({
      baseUrl: '/api/chat/sessions/sess-1',
      path: '/audio',
      originalUrl: '/api/chat/sessions/sess-1/audio',
    });

    expect(audioDelta).toBeGreaterThan(textDelta);
    expect(textDelta).toBeGreaterThanOrEqual(ttsDelta);
  });

  it('charges an unknown/unmatched route a safe non-zero default (the text class), never 0 / NaN', async () => {
    const unknownDelta = await chargeFor({
      baseUrl: '/api/chat/sessions/sess-1',
      path: '/some-future-paid-route',
      originalUrl: '/api/chat/sessions/sess-1/some-future-paid-route',
    });
    const textDelta = await chargeFor({
      baseUrl: '/api/chat/sessions/sess-1',
      path: '/messages',
      originalUrl: '/api/chat/sessions/sess-1/messages',
    });

    expect(unknownDelta).toBeGreaterThan(0);
    expect(Number.isNaN(unknownDelta)).toBe(false);
    expect(unknownDelta).toBe(textDelta);
  });

  it('makes a single increment call per request (no double-count across the fan-out)', async () => {
    await expect(
      chargeFor({
        baseUrl: '/api/chat/sessions/sess-1',
        path: '/audio',
        originalUrl: '/api/chat/sessions/sess-1/audio',
      }),
    ).resolves.toBeGreaterThan(0);
  });
});

describe('llmCostGuard — unwired counter fail-CLOSED in production (W1-C2 RED)', () => {
  afterEach(() => {
    _resetLlmCostCounter();
    mockNodeEnv.value = 'test';
    jest.restoreAllMocks();
  });

  function runUnwired(nodeEnv: 'test' | 'development' | 'production'): {
    next: jest.Mock;
    res: ReturnType<typeof makePartialResponse>;
  } {
    _resetLlmCostCounter();
    mockNodeEnv.value = nodeEnv;

    const req = makePartialRequest({
      method: 'POST',
      user: { id: 'user-unwired-1' },
      baseUrl: '/api/chat/sessions/sess-1',
      path: '/messages',
      originalUrl: '/api/chat/sessions/sess-1/messages',
    });
    const res = makePartialResponse();
    const next = makeNext() as jest.Mock;

    llmCostGuard(req, res, next);
    return { next, res };
  }

  it('counter unwired + NODE_ENV=production → next(503 COST_GUARD_UNAVAILABLE) (fail-CLOSED)', () => {
    const { next } = runUnwired('production');

    expect(next).toHaveBeenCalledTimes(1);
    const err: unknown = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(503);
    expect((err as AppError).code).toBe('COST_GUARD_UNAVAILABLE');
  });

  it('counter unwired + NODE_ENV=test → next() with no error (fail-OPEN preserved)', () => {
    const { next } = runUnwired('test');

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it('counter unwired + NODE_ENV=development → next() with no error (fail-OPEN preserved)', () => {
    const { next } = runUnwired('development');

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });
});
