import type { RequestHandler } from 'express';

/** Asset class — maps to a Cache-Control header set per ADR-024. */
export type AssetCacheClass =
  | 'static-immutable' // hashed bundle filenames; safe to cache forever
  | 'index-html' // SPA shell; revalidate every minute at edge
  | 'openapi-json' // changes per backend deploy
  | 'landing'; // marketing pages; long edge cache, short browser

/**
 * Returns an Express middleware that sets Cache-Control + related headers
 * for the given asset class. Compatible with Cloudflare's `s-maxage` directive
 * (edge cache) and standard browser cache.
 *
 * Spec: see git log (deleted 2026-05-03 — roadmap consolidation, original spec in commit history)
 * ADR: docs/adr/ADR-024-cloudflare-cdn-strategy.md
 *
 * Usage:
 *   router.get('/openapi.json', httpCacheHeaders('openapi-json'), handler);
 */
export function httpCacheHeaders(asset: AssetCacheClass): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('Cache-Control', cacheControlValue(asset));
    if (asset === 'static-immutable') {
      res.setHeader('Vary', 'Accept-Encoding');
    }
    next();
  };
}

const cacheControlValue = (asset: AssetCacheClass): string => {
  switch (asset) {
    case 'static-immutable':
      return 'public, max-age=31536000, immutable';
    case 'index-html':
      return 'public, max-age=0, must-revalidate, s-maxage=60';
    case 'openapi-json':
      return 'public, max-age=300, s-maxage=3600';
    case 'landing':
      return 'public, max-age=300, s-maxage=86400';
  }
};
