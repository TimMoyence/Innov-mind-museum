import { AppError } from '@shared/errors/app.error';
import { createNetProfileFaultMiddleware } from '@shared/net-shaping/net-profile-fault.middleware';
import { resetFailureCounters } from '@shared/net-shaping/failure-counter.store';
import { NETWORK_PROFILES } from '@shared/net-shaping/networkProfiles';

import type { Request, Response, NextFunction } from 'express';

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
    const expectedDelay = profile.latencyMs + profile.jitterMs;

    mw(req, res, next);

    expect(next).not.toHaveBeenCalled();
    jest.advanceTimersByTime(expectedDelay - 1);
    expect(next).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();

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
      jest.advanceTimersByTime(1000);
      return (next as jest.Mock).mock.calls[0]?.[0] as unknown;
    };

    const err1 = runOnce();
    expect(err1).toBeInstanceOf(AppError);
    expect((err1 as AppError).statusCode).toBe(503);

    const err2 = runOnce();
    expect(err2).toBeInstanceOf(AppError);
    expect((err2 as AppError).statusCode).toBe(503);

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

    const errA1 = run('sess-A');
    expect(errA1).toBeInstanceOf(AppError);

    const errB1 = run('sess-B');
    expect(errB1).toBeInstanceOf(AppError);

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
    jest.advanceTimersByTime(1000);
    expect(next).toHaveBeenCalledWith();

    expect(res.json).not.toBe(originalJson);

    const payload = { ok: true, message: 'paced body' };
    res.json(payload);
    jest.advanceTimersByTime(10_000);
    expect(res.__jsonPayloads).toHaveLength(1);
    expect(res.__jsonPayloads[0]).toEqual(payload);
  });
});
