import type { Request } from 'express';

/**
 * Express 5.1.x widened `req.params[key]` to `string | string[]` for multi-segment
 * matchers (`:slug+`). Narrows scalar-param routes back to `string | undefined`,
 * rejecting arrays + treating empty strings as absent.
 */
export function parseStringParam(req: Request, key: string): string | undefined {
  const value = req.params[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
