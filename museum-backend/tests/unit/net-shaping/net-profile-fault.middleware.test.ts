/**
 * W2-05 (RED) — net-profile-fault middleware unit.
 *
 * spec.md §EARS:
 *   R1 — X-Net-Profile present + enabled → apply the profile's DETERMINISTIC
 *        delay (latencyMs + jitterMs, fixed worst-case, NOT random) by EXTENDING
 *        res.setTimeout so the injected delay does not collide with the 20s
 *        socket timeout.
 *   R2 — X-Net-Fail-Count:N → fail the next N requests with a REAL 503 envelope
 *        (via `serviceUnavailable()` from @shared/errors passed to next), then
 *        succeed. Keyed sessionId+userId+path.
 *   R3 — X-Net-Pace:1 (Mode B) → trickle the JSON body paced by bwDownKbps
 *        (patch res.json), AFTER compression, scoped to tagged routes.
 *   R4 — no X-Net-Profile header → next() with ZERO overhead (no timeout touch,
 *        no res.json patch); unknown profile → next() + debug log (NOT 400).
 *
 * design.md §Architecture: consumes `toMiddlewareDescriptor(profile)` from
 *   @shared/net-shaping/networkProfiles; failure-counter.store keyed
 *   sessionId+userId+path; real @shared/errors 503; unknown → next()+debug.
 *
 * RED state: `@shared/net-shaping/net-profile-fault.middleware` does not exist
 * yet → the import throws (module not found) → every assertion fails.
 *
 * lib-docs: express (lib-docs/express/PATTERNS.md §2 res.status().json / §3.7
 *   configurable-middleware factory / §7 testing: fake req/res, next arity).
 *   No inline test entities; fakes are loosely-typed req/res descriptors like
 *   the request-decompression middleware test precedent.
 *
 * Frozen-test invariant: byte-immutable once manifested (phase=green).
 */
import { AppError } from '@shared/errors/app.error';
import { createNetProfileFaultMiddleware } from '@shared/net-shaping/net-profile-fault.middleware';
import { resetFailureCounters } from '@shared/net-shaping/failure-counter.store';
import { NETWORK_PROFILES } from '@shared/net-shaping/networkProfiles';

import type { Request, Response, NextFunction } from 'express';

/**
 * Loosely-typed fake Express request: header lookup + url + params + user.
 * @param headers
 * @param options
 * @param options.path
 * @param options.sessionId
 * @param options.userId
 */
function makeRequest(
  headers: Record<string, string>,
  options: { path?: string; sessionId?: string; userId?: string } = {},
): Request {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const path = options.path ?? '/api/chat/sessions/sess-1/messages';
  return {
    method: 'POST',
    url: path,
    originalUrl: path,
    path,
    params: options.sessionId ? { id: options.sessionId } : {},
    user: options.userId ? { id: options.userId } : undefined,
    header: (name: string): string | undefined => lower[name.toLowerCase()],
    get: (name: string): string | undefined => lower[name.toLowerCase()],
  } as unknown as Request;
}

interface SpyResponse extends Response {
  __setTimeoutCalls: number[];
  __jsonPayloads: unknown[];
  __statusCodes: number[];
}

/** Fake Express response recording setTimeout / json / status interactions. */
function makeResponse(): SpyResponse {
  const res = {
    __setTimeoutCalls: [],
    __jsonPayloads: [],
    __statusCodes: [],
    headersSent: false,
    setTimeout(ms: number) {
      res.__setTimeoutCalls.push(ms);
      return res;
    },
    status(code: number) {
      res.__statusCodes.push(code);
      return res;
    },
    json(payload: unknown) {
      res.__jsonPayloads.push(payload);
      return res;
    },
    setHeader() {
      return res;
    },
    getHeader() {
      return undefined;
    },
  } as unknown as SpyResponse;
  return res;
}

describe('net-profile-fault middleware (W2-05)', () => {
  afterEach(() => {
    resetFailureCounters();
    jest.useRealTimers();
  });

  it('R4 — no X-Net-Profile header → next() with zero overhead (no timeout touch, no json patch)', () => {
    const mw = createNetProfileFaultMiddleware();
    const req = makeRequest({});
    const res = makeResponse();
    const originalJson = res.json;
    const next = jest.fn() as NextFunction;

    mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(res.__setTimeoutCalls).toHaveLength(0);
    // res.json must NOT be patched on the zero-overhead path.
    expect(res.json).toBe(originalJson);
  });

  it('R4 — unknown profile → next() + debug log, NOT a 400', () => {
    const logDebug = jest.fn();
    const mw = createNetProfileFaultMiddleware({ logDebug });
    const req = makeRequest({ 'X-Net-Profile': 'satellite-uplink-9000' });
    const res = makeResponse();
    const next = jest.fn() as NextFunction;

    mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    // next() with NO error argument (not a 400/AppError).
    expect(next).toHaveBeenCalledWith();
    const errArg = (next as jest.Mock).mock.calls[0][0] as unknown;
    expect(errArg).toBeUndefined();
    expect(logDebug).toHaveBeenCalledTimes(1);
    expect(res.__statusCodes).toHaveLength(0);
  });

  it('R1 — known profile applies a DETERMINISTIC delay = latencyMs + jitterMs and EXTENDS res.setTimeout', () => {
    jest.useFakeTimers();
    const mw = createNetProfileFaultMiddleware();
    const req = makeRequest({ 'X-Net-Profile': '2g' });
    const res = makeResponse();
    const next = jest.fn() as NextFunction;

    const profile = NETWORK_PROFILES['2g'];
    const expectedDelay = profile.latencyMs + profile.jitterMs; // 350 + 150 = 500, fixed worst-case

    mw(req, res, next);

    // Delay is deterministic (worst-case latency+jitter), applied via timers.
    expect(next).not.toHaveBeenCalled();
    jest.advanceTimersByTime(expectedDelay - 1);
    expect(next).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();

    // res.setTimeout was extended beyond the injected delay (so the injected
    // delay can't trip the default 20s socket timeout).
    expect(res.__setTimeoutCalls.length).toBeGreaterThanOrEqual(1);
    const extended = res.__setTimeoutCalls[res.__setTimeoutCalls.length - 1];
    expect(extended).toBeGreaterThan(expectedDelay);
  });

  it('R2 — X-Net-Fail-Count:2 → next(serviceUnavailable 503) twice, then succeeds (real envelope)', () => {
    jest.useFakeTimers();
    const mw = createNetProfileFaultMiddleware();
    const headers = {
      'X-Net-Profile': 'normal',
      'X-Net-Fail-Count': '2',
    };
    const reqOpts = { sessionId: 'sess-A', userId: 'user-A' };

    const runOnce = (): unknown => {
      const req = makeRequest(headers, reqOpts);
      const res = makeResponse();
      const next = jest.fn() as NextFunction;
      mw(req, res, next);
      // 'normal' delay is tiny (25+10) — flush it.
      jest.advanceTimersByTime(1000);
      return (next as jest.Mock).mock.calls[0]?.[0] as unknown;
    };

    // 1st request → 503 envelope.
    const err1 = runOnce();
    expect(err1).toBeInstanceOf(AppError);
    expect((err1 as AppError).statusCode).toBe(503);

    // 2nd request → 503 envelope.
    const err2 = runOnce();
    expect(err2).toBeInstanceOf(AppError);
    expect((err2 as AppError).statusCode).toBe(503);

    // 3rd request → success (no error passed to next).
    const err3 = runOnce();
    expect(err3).toBeUndefined();
  });

  it('R2 — failure counter is keyed sessionId+userId+path: a different session is unaffected', () => {
    jest.useFakeTimers();
    const mw = createNetProfileFaultMiddleware();
    const headers = { 'X-Net-Profile': 'normal', 'X-Net-Fail-Count': '1' };

    const run = (sessionId: string): unknown => {
      const req = makeRequest(headers, { sessionId, userId: 'user-A' });
      const res = makeResponse();
      const next = jest.fn() as NextFunction;
      mw(req, res, next);
      jest.advanceTimersByTime(1000);
      return (next as jest.Mock).mock.calls[0]?.[0] as unknown;
    };

    // Arm session A (fail next 1).
    const errA1 = run('sess-A');
    expect(errA1).toBeInstanceOf(AppError);

    // Session B has its OWN bucket — it is armed for its own first request,
    // independent of session A's consumed bucket.
    const errB1 = run('sess-B');
    expect(errB1).toBeInstanceOf(AppError);

    // Session A's bucket is now exhausted → success.
    const errA2 = run('sess-A');
    expect(errA2).toBeUndefined();
  });

  it('R3 — X-Net-Pace:1 (Mode B) → res.json is patched to trickle the body (paced by bwDownKbps)', () => {
    jest.useFakeTimers();
    const mw = createNetProfileFaultMiddleware();
    const req = makeRequest({ 'X-Net-Profile': '2g', 'X-Net-Pace': '1' });
    const res = makeResponse();
    const originalJson = res.json;
    const next = jest.fn() as NextFunction;

    mw(req, res, next);
    // Flush the injected latency so next() (the route) can run.
    jest.advanceTimersByTime(1000);
    expect(next).toHaveBeenCalledWith();

    // Mode B replaces res.json with a paced trickle wrapper.
    expect(res.json).not.toBe(originalJson);

    // Calling the patched res.json eventually delivers the payload (after the
    // bwDownKbps-paced trickle completes). We assert the payload is delivered
    // exactly once and unchanged once the timers drain.
    const payload = { ok: true, message: 'paced body' };
    res.json(payload);
    jest.advanceTimersByTime(10_000);
    expect(res.__jsonPayloads).toHaveLength(1);
    expect(res.__jsonPayloads[0]).toEqual(payload);
  });
});
