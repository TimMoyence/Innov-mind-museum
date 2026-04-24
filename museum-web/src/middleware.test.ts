/**
 * Integration tests for `src/middleware.ts`.
 *
 * Exercises three responsibilities layered into a single middleware:
 *   1. i18n locale redirect when no locale is in the path
 *   2. admin gate — redirect to `/admin/login` if `admin-authz` cookie absent
 *   3. CSP header + per-request nonce propagation
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

/** Build a minimal NextRequest with optional cookies and headers. */
function buildRequest(
  url: string,
  init: { cookies?: Record<string, string>; headers?: Record<string, string> } = {},
): NextRequest {
  const headers = new Headers(init.headers ?? {});
  if (init.cookies) {
    const cookieHeader = Object.entries(init.cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    headers.set('cookie', cookieHeader);
  }
  return new NextRequest(new URL(url), { headers });
}

describe('middleware — i18n locale redirect', () => {
  it('redirects a root-level path to the default locale (301)', () => {
    const req = buildRequest('https://musaium.com/support');
    const res = middleware(req);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://musaium.com/fr/support');
  });

  it('honours the accept-language header when choosing the locale', () => {
    const req = buildRequest('https://musaium.com/support', {
      headers: { 'accept-language': 'en-US,en;q=0.9' },
    });
    const res = middleware(req);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://musaium.com/en/support');
  });

  it('passes through static files without redirecting', () => {
    const req = buildRequest('https://musaium.com/robots.txt');
    const res = middleware(req);
    expect(res.status).toBe(200);
  });
});

describe('middleware — admin gate', () => {
  it('redirects to /admin/login when the admin-authz cookie is absent', () => {
    const req = buildRequest('https://musaium.com/fr/admin/tickets');
    const res = middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).not.toBeNull();
    expect(location).toContain('/fr/admin/login');
    expect(location).toContain('redirect=%2Ffr%2Fadmin%2Ftickets');
  });

  it('redirects the en locale admin routes too', () => {
    const req = buildRequest('https://musaium.com/en/admin/users');
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/en/admin/login');
  });

  it('lets the request through when the admin-authz cookie is present', () => {
    const req = buildRequest('https://musaium.com/fr/admin/tickets', {
      cookies: { 'admin-authz': '1' },
    });
    const res = middleware(req);
    expect(res.status).toBe(200);
    // Nonce + CSP still emitted on admin pages
    expect(res.headers.get('content-security-policy')).toMatch(/nonce-/);
  });

  it('does NOT gate /admin/login itself (otherwise infinite redirect)', () => {
    const req = buildRequest('https://musaium.com/fr/admin/login');
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it('does NOT gate public routes', () => {
    const req = buildRequest('https://musaium.com/fr/support');
    const res = middleware(req);
    expect(res.status).toBe(200);
  });
});

describe('middleware — CSP + nonce', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits a Content-Security-Policy header with a fresh nonce', () => {
    // Deterministic nonce for assertion stability; not security-critical.
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(
      <T extends ArrayBufferView | null>(buf: T): T => {
        if (buf instanceof Uint8Array) {
          for (let i = 0; i < buf.length; i++) buf[i] = i;
        }
        return buf;
      },
    );

    const req = buildRequest('https://musaium.com/fr');
    const res = middleware(req);
    const csp = res.headers.get('content-security-policy');
    expect(csp).toBeTruthy();
    expect(csp).toMatch(/script-src [^;]*'nonce-[^']+'/);
    expect(csp).toMatch(/'strict-dynamic'/);
    expect(csp).not.toMatch(/script-src [^;]*'unsafe-inline'/);
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).toMatch(/object-src 'none'/);
  });

  it('produces a different nonce on each call', () => {
    const a = middleware(buildRequest('https://musaium.com/fr')).headers.get(
      'content-security-policy',
    );
    const b = middleware(buildRequest('https://musaium.com/fr')).headers.get(
      'content-security-policy',
    );
    expect(a).not.toBe(b);
  });
});
