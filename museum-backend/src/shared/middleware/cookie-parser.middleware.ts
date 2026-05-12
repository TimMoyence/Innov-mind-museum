/**
 * F7 (2026-04-30) — Minimal cookie-parser shim.
 *
 * Parses the `Cookie` header into `req.cookies: Record<string, string>` so the
 * cookie-auth fallback and the CSRF double-submit middleware can read named
 * cookies without pulling in a third-party `cookie-parser` package.
 *
 * Why we don't use the published `cookie-parser`:
 *   - It augments `Express.Request` via global `declare` which conflicts with
 *     the typing convention used by the rest of `src/helpers/middleware/`
 *     (e.g. `requestIdMiddleware` extends `Request` locally).
 *   - We only need the unsigned-cookie path; signature support is unnecessary
 *     because authenticated cookies are JWTs (self-signed already).
 *   - One fewer dependency to monitor for supply-chain risk.
 *
 * Spec compliance:
 *   - Splits on `;` then `=` per RFC 6265 §4.2.1 (the spec's serialisation is
 *     intentionally simple).
 *   - URL-decodes values via `decodeURIComponent` (the same algorithm used by
 *     `cookie@1.x`, the canonical reference).
 *   - Silently ignores malformed pairs and any cookie name with no `=`.
 *
 * Adds `req.cookies` regardless of whether a `Cookie` header is present so
 * downstream code never needs `req.cookies ?? {}`.
 */

import type { NextFunction, Request, Response } from 'express';

// `Request.cookies` is augmented in `src/shared/types/express/index.d.ts`
// alongside `req.user` / `req.requestId` so the global ambient declaration
// stays in one place.

/**
 * Decodes a single cookie value safely. Returns the raw value when
 * `decodeURIComponent` throws on a malformed escape sequence so we never reject
 * a request because of one bad cookie elsewhere in the jar.
 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Parses a raw `Cookie` header value into an object. Public for unit tests. */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;

  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    if (!name) continue;
    let value = pair.slice(eq + 1).trim();
    // RFC 6265 allows the value to be wrapped in DQUOTEs.
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    // First occurrence wins — matches Express `cookie-parser` behaviour and
    // prevents an attacker from overriding a same-name cookie by setting a
    // duplicate via Set-Cookie (browsers preserve order; first is the most
    // specific Path/Domain).
    if (!(name in out)) {
      out[name] = safeDecode(value);
    }
  }
  return out;
}

/** Express middleware: populates `req.cookies` from the Cookie header. */
export function cookieParserMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.cookies = parseCookieHeader(req.headers.cookie);
  next();
}
