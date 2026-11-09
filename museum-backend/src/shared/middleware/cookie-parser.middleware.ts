import type { NextFunction, Request, Response } from 'express';

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = Object.create(null) as Record<string, string>;
  if (!header) return out;

  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    if (!name) continue;
    let value = pair.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    if (name === '__proto__' || name === 'constructor' || name === 'prototype') continue;
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
