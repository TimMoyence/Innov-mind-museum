/**
 * I-FIX3 · T1.1 RED — route-keyed fan-out cost metering at the middleware seam.
 *
 * Run: 2026-05-25-ifix3-cost-guard-judge · spec §R1 · design §4/D1.
 *
 * Problem pinned (spec §1 a/b): the cost-guard middleware charges ONE flat
 * `FLAT_COST_PER_CALL_USD = 0.002` per HTTP request regardless of how many paid
 * sub-calls the route fans out to. A `/audio` request fans out to STT + LLM +
 * TTS, a `/tts` request to TTS, a `/messages` request to LLM — but all three are
 * charged the same flat $0.002, so the per-user daily cap under-counts true spend.
 *
 * GREEN target (design §4): replace the single flat charge with a route-keyed
 * worst-case fan-out estimate read from `req.baseUrl`/`req.path` (NOT `req.body`,
 * which is unparsed at this seam — express LESSONS 2026-05-18 mutating-middleware
 * ordering; the estimate is route-derived so it cannot be inflated by a malformed
 * body). The single `assertAllowed` call is preserved (no double-count, no
 * per-sub-call round-trip — NFR "no double-count" / latency).
 *
 * Magnitudes asserted by RELATION only (UFR-013 — green picks the list-price-
 * grounded cents): `audio > text >= tts` and `audio > 0.002`. No hard-coded cents.
 *
 * Failure mode at RED HEAD (`llm-cost-guard.middleware.ts:14,70`): every route
 * is charged the literal `FLAT_COST_PER_CALL_USD = 0.002`, so the `/audio` delta
 * equals 0.002 (NOT `> 0.002`) and `audio === text === tts`. The relation
 * assertions below therefore FAIL until the route-keyed estimator exists.
 *
 * lib-docs consulted: express/PATTERNS.md §3.3 (mutating-middleware ordering),
 * express/LESSONS.md 2026-05-18 (body-unparsed at this seam).
 *
 * Run scope: pnpm jest tests/unit/shared/llm-cost-guard/llm-cost-guard.middleware.test.ts
 *
 * --------------------------------------------------------------------------
 * W1-C2 RED (run 2026-05-26-kr-domains) — defense-in-depth fail-CLOSED when the
 * cost counter is unwired in production. The middleware currently fails OPEN
 * (`next()`) whenever `llmCostCounter === null`. That is correct for dev/test
 * (no Redis), but in production it silently serves paid LLM calls with NO
 * per-user cap. The fix splits the branch: production → `next(AppError 503
 * COST_GUARD_UNAVAILABLE)`; dev/test → fail-OPEN (unchanged). Controlling
 * `env.nodeEnv` requires mocking `@src/config/env` (the file previously imported
 * the real env). The mock below preserves the `llm.costGuard` shape the existing
 * fan-out cases rely on (killSwitch:false, cap 0.5) so they are non-regressed.
 * --------------------------------------------------------------------------
 */

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

/** The flat charge the middleware uses today — the under-count the fix removes. */
const TODAY_FLAT_USD = 0.002;

/**
 * Runs the middleware against a mocked request shaped like a real chat route and
 * resolves with the USD delta passed to `counter.increment` (the per-request
 * charge against the daily cap). Rejects if the middleware never called
 * `increment` (i.e. it short-circuited or denied unexpectedly).
 *
 * `reqInit` carries the route templates (`baseUrl`/`path`/`originalUrl`) the
 * green estimator reads — passed through the `[key: string]: unknown` index on
 * {@link MockRequestInit}.
 */
async function chargeFor(reqInit: MockRequestInit): Promise<number> {
  const counter = new InMemoryLlmCostCounter();
  const incrSpy = jest.spyOn(counter, 'increment');
  setLlmCostCounter(counter);

  const req = makePartialRequest({
    method: 'POST',
    // An authenticated caller so the guard reaches the per-user counter
    // (anon short-circuits before increment — see llm-cost-guard.test.ts).
    user: { id: 'user-fanout-1' },
    ...reqInit,
  });
  const res = makePartialResponse();
  const next = makeNext();

  llmCostGuard(req, res, next);

  // The handler is promise-based; flush the microtask queue so `.then(next)`
  // / `.catch(next)` settle before we assert.
  await new Promise<void>((resolve) => setImmediate(resolve));

  expect(next).toHaveBeenCalledTimes(1);
  // next() must be called with no error (allowed path).
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

    // Fan-out route must cost strictly more than the flat per-call charge —
    // it triggers ≥2 paid sub-calls (STT + LLM + TTS). FAILS at RED HEAD where
    // every route is charged the flat 0.002.
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

    // TTS-only is a single sub-call → strictly cheaper than the audio fan-out.
    // FAILS at RED HEAD where both equal 0.002.
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

    // Relation per design §4: audio > text >= tts. FAILS at RED HEAD (all equal).
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
    // Unknown route falls back to the conservative text-class default, NOT 0.
    expect(unknownDelta).toBe(textDelta);
  });

  it('makes a single increment call per request (no double-count across the fan-out)', async () => {
    // Reusing chargeFor already asserts `incrSpy` called exactly once. This test
    // pins it explicitly for the audio fan-out (the most sub-calls), so the
    // green refactor cannot move from "undercount" to "once-per-sub-call".
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

  /** Runs the middleware with the counter UNWIRED (null) under a given NODE_ENV. */
  function runUnwired(nodeEnv: 'test' | 'development' | 'production'): {
    next: jest.Mock;
    res: ReturnType<typeof makePartialResponse>;
  } {
    _resetLlmCostCounter(); // ensure llmCostCounter === null
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
    // RED failure mode at be758ab56: the `if (!llmCostCounter) { next(); return; }`
    // branch fails OPEN regardless of NODE_ENV → next() is called with NO error →
    // the `instanceof AppError` / statusCode / code assertions FAIL. Counts as RED.
    const { next } = runUnwired('production');

    expect(next).toHaveBeenCalledTimes(1);
    const err: unknown = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(503);
    expect((err as AppError).code).toBe('COST_GUARD_UNAVAILABLE');
  });

  it('counter unwired + NODE_ENV=test → next() with no error (fail-OPEN preserved)', () => {
    // Non-regression guard: dev/test without Redis MUST keep failing OPEN.
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
