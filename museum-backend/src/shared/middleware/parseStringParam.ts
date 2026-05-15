import type { Request } from 'express';

/**
 * Express 5.1.x widened `req.params[key]` to `string | string[]` to model
 * legitimate multi-segment matchers (e.g. `:slug+`). For our routes that
 * declare scalar params, this helper narrows back to `string | undefined`
 * by rejecting array values explicitly and treating empty strings as absent.
 *
 * Returns `undefined` when the param is missing, an array (multi-segment), or
 * an empty string. Callers that require a non-empty value should branch on
 * the undefined return and short-circuit with a 400 response.
 */
export function parseStringParam(req: Request, key: string): string | undefined {
  const value = req.params[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
