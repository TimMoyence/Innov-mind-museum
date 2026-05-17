import type { RequestHandler } from 'express';

/** Asset class → Cache-Control set per ADR-024 (Cloudflare s-maxage + browser cache). */
export type AssetCacheClass =
  | 'static-immutable' // hashed bundle filenames; cache forever
  | 'index-html' // SPA shell; revalidate every minute at edge
  | 'openapi-json' // per backend deploy
  | 'landing'; // long edge, short browser

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
