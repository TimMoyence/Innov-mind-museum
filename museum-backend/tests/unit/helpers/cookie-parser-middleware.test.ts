import {
  cookieParserMiddleware,
  parseCookieHeader,
} from '@shared/middleware/cookie-parser.middleware';

import type { NextFunction, Request, Response } from 'express';

describe('parseCookieHeader', () => {
  it('returns {} when header is undefined (no Cookie header)', () => {
    expect(parseCookieHeader(undefined)).toEqual({});
  });

  it('returns {} when header is empty string', () => {
    expect(parseCookieHeader('')).toEqual({});
  });

  it('parses a single name=value pair', () => {
    expect(parseCookieHeader('a=1')).toEqual({ a: '1' });
  });

  it('parses multiple cookies separated by ; with optional whitespace', () => {
    expect(parseCookieHeader('a=1; b=2;c=3 ; d=4')).toEqual({ a: '1', b: '2', c: '3', d: '4' });
  });

  it('drops malformed pairs that have no = sign', () => {
    expect(parseCookieHeader('a=1; nope; b=2')).toEqual({ a: '1', b: '2' });
  });

  it('drops pairs with empty name (e.g. "=value")', () => {
    expect(parseCookieHeader('=lonely; a=1')).toEqual({ a: '1' });
  });

  it('first occurrence wins on duplicate names (cookie-parser parity)', () => {
    expect(parseCookieHeader('a=first; a=second')).toEqual({ a: 'first' });
  });

  it('strips surrounding DQUOTEs from values per RFC 6265', () => {
    expect(parseCookieHeader('a="quoted"; b="also-quoted"')).toEqual({
      a: 'quoted',
      b: 'also-quoted',
    });
  });

  it('URL-decodes values via decodeURIComponent', () => {
    expect(parseCookieHeader('a=%20space%21')).toEqual({ a: ' space!' });
  });

  it('falls back to raw value when decodeURIComponent throws on malformed %', () => {
    expect(parseCookieHeader('a=%ZZ; b=ok')).toEqual({ a: '%ZZ', b: 'ok' });
  });
});

describe('cookieParserMiddleware', () => {
  it('populates req.cookies from headers.cookie and calls next()', () => {
    const req = { headers: { cookie: 'sid=abc; csrf=xyz' } } as unknown as Request & {
      cookies?: Record<string, string>;
    };
    const next: NextFunction = jest.fn();

    cookieParserMiddleware(req, {} as Response, next);

    expect(req.cookies).toEqual({ sid: 'abc', csrf: 'xyz' });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('still sets req.cookies = {} when no Cookie header is present (no `?? {}` downstream)', () => {
    const req = { headers: {} } as unknown as Request & { cookies?: Record<string, string> };
    const next: NextFunction = jest.fn();

    cookieParserMiddleware(req, {} as Response, next);

    expect(req.cookies).toEqual({});
    expect(next).toHaveBeenCalledTimes(1);
  });
});
