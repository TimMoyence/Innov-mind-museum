/**
 * Typed Express partial mock helpers for middleware unit tests.
 *
 * Eliminates the recurring `{ headers: {...} } as unknown as Request` pattern
 * by centralising the single cast inside typed factory functions.
 */

import type { Request, Response, NextFunction } from 'express';

export interface MockRequestInit {
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, string | string[]>;
  ip?: string;
  method?: string;
  path?: string;
  socket?: { remoteAddress?: string };
  /** Arbitrary extra fields (e.g. user, museumId, requestId set by middleware). */
  [key: string]: unknown;
}

/** Returns a partial Express Request typed as Request. Single cast lives here. */
export function makePartialRequest(init: MockRequestInit = {}): Request {
  return {
    headers: {},
    body: {},
    params: {},
    query: {},
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    method: 'GET',
    path: '/',
    header: (name: string) => (init.headers ?? {})[name.toLowerCase()] as string | undefined,
    ...init,
  } as unknown as Request;
}

/** Returns a partial Express Response with status/json/send/setHeader jest fns. */
export function makePartialResponse(): Response {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    end: jest.fn(),
    locals: {},
  } as unknown as Response;
  return res;
}

/** Returns a jest.fn() NextFunction. */
export function makeNext(): NextFunction {
  return jest.fn() as NextFunction;
}
