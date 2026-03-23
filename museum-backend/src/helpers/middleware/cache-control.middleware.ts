import { Request, Response, NextFunction } from 'express';

/** Pre-defined Cache-Control directives. */
export const NO_STORE = 'no-store';
export const PRIVATE_NO_STORE = 'private, no-store';
export const SHORT_PUBLIC = 'public, max-age=10, s-maxage=10';

/**
 * Middleware factory that sets Cache-Control and Vary headers on the response.
 * @param directive - Cache-Control header value (e.g., 'no-store', 'public, max-age=60').
 */
export function setCacheControl(directive: string) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.set('Cache-Control', directive);
    next();
  };
}
