/**
 * F Phase 2 — httpCacheHeaders middleware unit tests (ADR-024).
 */
import { httpCacheHeaders } from '@src/helpers/http-cache-headers';

import type { Request, Response } from 'express';

describe('httpCacheHeaders', () => {
  const buildRes = (): {
    getHeader: (k: string) => string | undefined;
    setHeader: (k: string, v: string) => void;
  } => {
    const store = new Map<string, string>();
    return {
      getHeader: (k: string) => store.get(k),
      setHeader: (key: string, value: string) => {
        store.set(key, value);
      },
    };
  };

  it('static-immutable: 1-year max-age + immutable + Vary: Accept-Encoding', () => {
    const res = buildRes();
    httpCacheHeaders('static-immutable')({} as Request, res as unknown as Response, jest.fn());
    expect(res.getHeader('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(res.getHeader('Vary')).toBe('Accept-Encoding');
  });

  it('index-html: max-age=0 + must-revalidate + s-maxage=60', () => {
    const res = buildRes();
    httpCacheHeaders('index-html')({} as Request, res as unknown as Response, jest.fn());
    expect(res.getHeader('Cache-Control')).toContain('must-revalidate');
    expect(res.getHeader('Cache-Control')).toContain('s-maxage=60');
    expect(res.getHeader('Cache-Control')).toContain('max-age=0');
    expect(res.getHeader('Vary')).toBeUndefined();
  });

  it('openapi-json: 5-min browser TTL, 1-hour Cloudflare edge TTL', () => {
    const res = buildRes();
    httpCacheHeaders('openapi-json')({} as Request, res as unknown as Response, jest.fn());
    expect(res.getHeader('Cache-Control')).toBe('public, max-age=300, s-maxage=3600');
    expect(res.getHeader('Vary')).toBeUndefined();
  });

  it('landing: 5-min browser TTL, 24-hour Cloudflare edge TTL', () => {
    const res = buildRes();
    httpCacheHeaders('landing')({} as Request, res as unknown as Response, jest.fn());
    expect(res.getHeader('Cache-Control')).toBe('public, max-age=300, s-maxage=86400');
    expect(res.getHeader('Vary')).toBeUndefined();
  });

  it('calls next() for every asset class', () => {
    const assetClasses = ['static-immutable', 'index-html', 'openapi-json', 'landing'] as const;
    for (const asset of assetClasses) {
      const next = jest.fn();
      const res = buildRes();
      httpCacheHeaders(asset)({} as Request, res as unknown as Response, next);
      expect(next).toHaveBeenCalledTimes(1);
    }
  });
});
