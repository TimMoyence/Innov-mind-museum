/**
 * F7 (2026-04-30) — Minimal cookie-parser shim (RFC 6265 §4.2.1).
 *
 * In-house instead of `cookie-parser` package: avoids global `declare` augmentation
 * conflict with our local Request typing convention; only need unsigned path (auth
 * cookies are self-signed JWTs); one fewer supply-chain dep.
 *
 * Always populates `req.cookies` even without Cookie header (no `?? {}` downstream).
 */

import type { NextFunction, Request, Response } from 'express';

// `Request.cookies` augmented in `src/shared/types/express/index.d.ts`.

/** Returns raw value on `decodeURIComponent` throw — one bad cookie can't reject the request. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Public for unit tests. */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
  // Prototype-less store: an attacker who sends `Cookie: __proto__=foo` cannot
  // pollute Object.prototype (no inherited slots), and `name in out` always
  // reflects only what we have written ourselves. CodeQL
  // `js/remote-property-injection` flagged the previous `{}` literal.
  const out: Record<string, string> = Object.create(null) as Record<string, string>;
  if (!header) return out;

  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    if (!name) continue;
    let value = pair.slice(eq + 1).trim();
    // RFC 6265 allows DQUOTE-wrapped values.
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    // SEC: first occurrence wins (Express cookie-parser parity) — prevents an attacker
    // from overriding a same-name cookie via duplicate Set-Cookie (browsers preserve
    // order; first is most specific Path/Domain).
    if (!(name in out)) {
      out[name] = safeDecode(value);
    }
  }
  return out;
}

export function cookieParserMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.cookies = parseCookieHeader(req.headers.cookie);
  next();
}
