/**
 * I-FIX3 follow-up (security finding #1, LOW) — `/describe` paid fan-out route
 * was under-counted by the route-keyed cost estimator.
 *
 * Run: 2026-05-25-ifix3-cost-guard-judge · spec §R1 a/b · security PASS finding #1.
 *
 * Problem: `POST /api/chat/describe` mounts `llmCostGuard` (chat-describe.route.ts:40,
 * "Single chokepoint gates LLM + TTS") and fans out to LLM + TTS when
 * `format ∈ {audio, both}` (returns `result.audio` from OpenAI TTS). But
 * `classifyFanout` only matched `/audio`, `/tts`, `/messages` suffixes, so
 * `/describe` fell to the conservative `text` default ($0.002) — under-counting a
 * route whose worst case is LLM + TTS.
 *
 * `format` lives in `req.body`, which is UNPARSED at this middleware seam (express
 * LESSONS 2026-05-18 mutating-middleware ordering — the guard runs before body
 * validation, and reading `req.body` here would be the ordering footgun). So the
 * estimator cannot branch on `format`; it must classify `/describe` at the
 * WORST case (LLM + TTS = the `audio` class) — correct for a safety-net cap.
 *
 * GREEN target: `classifyFanout` maps a `/describe` route to the `audio` class.
 *
 * Failure mode at RED HEAD: `/describe` falls through to the `text` default, so
 * its delta equals the `/messages` (text) delta instead of the `/audio` delta —
 * the relation assertions below FAIL until the `/describe` rule exists.
 *
 * lib-docs consulted: express/PATTERNS.md §3.3, express/LESSONS.md 2026-05-18.
 *
 * Run scope: pnpm jest tests/unit/shared/llm-cost-guard/llm-cost-guard.middleware.describe-route.test.ts
 */
import {
  llmCostGuard,
  setLlmCostCounter,
  _resetLlmCostCounter,
} from '@shared/middleware/llm-cost-guard.middleware';

import {
  makePartialRequest,
  makePartialResponse,
  makeNext,
  type MockRequestInit,
} from '../../../helpers/http/express-mock.helpers';
import { InMemoryLlmCostCounter } from 'tests/helpers/llm-cost-guard/in-memory-llm-cost-counter';

/** Resolves with the USD delta the middleware charges for a route-shaped request. */
async function chargeFor(reqInit: MockRequestInit): Promise<number> {
  const counter = new InMemoryLlmCostCounter();
  const incrSpy = jest.spyOn(counter, 'increment');
  setLlmCostCounter(counter);

  const req = makePartialRequest({
    method: 'POST',
    user: { id: 'user-describe-1' },
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

describe('llmCostGuard — /describe worst-case fan-out (I-FIX3 finding #1)', () => {
  afterEach(() => {
    _resetLlmCostCounter();
    jest.restoreAllMocks();
  });

  it('classifies /describe at the audio worst-case (LLM+TTS), equal to /audio and above the text default', async () => {
    const describeDelta = await chargeFor({
      // Real express shape: chat router mounted at /api/chat, `router.post('/describe')`.
      baseUrl: '/api/chat',
      path: '/describe',
      originalUrl: '/api/chat/describe',
    });
    const audioDelta = await chargeFor({
      baseUrl: '/api/chat/sessions/sess-1',
      path: '/audio',
      originalUrl: '/api/chat/sessions/sess-1/audio',
    });
    const textDelta = await chargeFor({
      baseUrl: '/api/chat/sessions/sess-1',
      path: '/messages',
      originalUrl: '/api/chat/sessions/sess-1/messages',
    });

    // /describe fans out to LLM + TTS → must be charged the audio worst-case,
    // strictly above the text default. FAILS at RED HEAD where /describe == text.
    expect(describeDelta).toBeGreaterThan(textDelta);
    expect(describeDelta).toBe(audioDelta);
  });

  it('still charges /describe a single increment (no double-count)', async () => {
    await expect(
      chargeFor({
        baseUrl: '/api/chat',
        path: '/describe',
        originalUrl: '/api/chat/describe',
      }),
    ).resolves.toBeGreaterThan(0);
  });
});
