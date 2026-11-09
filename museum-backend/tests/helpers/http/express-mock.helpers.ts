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
  [key: string]: unknown;
}

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

export function makePartialResponse(): Response {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    once: jest.fn().mockReturnThis(),
    end: jest.fn(),
    locals: {},
  } as unknown as Response;
  return res;
}

export function makeNext(): NextFunction {
  return jest.fn() as NextFunction;
}
