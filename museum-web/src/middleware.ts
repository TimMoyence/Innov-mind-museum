import { type NextRequest, NextResponse } from 'next/server';
import { locales, defaultLocale, type Locale } from '@/lib/i18n';

/** Paths that should never be rewritten by the i18n middleware. */
const IGNORED_PREFIXES = ['/_next', '/api', '/images', '/favicon.ico'];

/** File extensions served directly from public/ (verification files, etc.). */
const STATIC_EXTENSIONS = ['.xml', '.html', '.txt', '.ico', '.png', '.svg'];

/**
 * Cookie name used as a lightweight "has admin session" hint for the Edge
 * middleware gate. The backend still performs real JWT enforcement on every
 * admin API call — this cookie is a UX redirect, not a security boundary.
 *
 * Set by `src/lib/auth.tsx` at successful login, cleared at logout / 401.
 */
const ADMIN_AUTHZ_COOKIE = 'admin-authz';

/** Regex matching `/{locale}/admin/...` excluding the login page itself. */
const ADMIN_GATE_REGEX = new RegExp(`^/(?:${locales.join('|')})/admin(?!/login)(?:/|$)`);

function getPreferredLocale(request: NextRequest): Locale {
  const acceptLang = request.headers.get('accept-language') ?? '';
  // Simple parser: pick the first locale that matches
  for (const locale of locales) {
    if (acceptLang.toLowerCase().includes(locale)) return locale;
  }
  return defaultLocale;
}

function pathnameHasLocale(pathname: string): boolean {
  return locales.some((locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`);
}

/** Build per-request nonce (RFC 4648 base64, ≥128 bits entropy). */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // btoa is available in the Edge runtime
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Build the per-request Content-Security-Policy string.
 *
 * script-src: strict — only our own origin + per-request nonce + `strict-dynamic`
 * so Next.js-injected runtime scripts are allowed transitively. No
 * `unsafe-inline` — older browsers without nonce support fall back to
 * `unsafe-inline` is intentionally **not** listed (Next.js 15 targets evergreen
 * browsers that support nonces).
 *
 * style-src: keeps `unsafe-inline` for pragmatic reasons —
 *   - Framer Motion and next/font inject inline `style=""` on elements which
 *     cannot be nonced,
 *   - Tailwind 4 arbitrary variants can emit inline style attributes in
 *     some edge cases.
 * Browsers treat style-injection attacks as strictly lower severity than
 * script injection, so relaxing style-src while tightening script-src is the
 * widely-recommended trade-off (see Next.js official CSP guide).
 */
function buildCspHeader(nonce: string, isDev: boolean): string {
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.ingest.sentry.io https://*.ingest.de.sentry.io",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/**
 * Build the response with the per-request nonce wired into both the request
 * headers (consumed by the root layout via `headers().get('x-nonce')`) and the
 * Content-Security-Policy response header.
 */
function withNonceAndCsp(request: NextRequest, requestHeaders: Headers): NextResponse {
  const nonce = generateNonce();
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(
    'Content-Security-Policy',
    buildCspHeader(nonce, process.env.NODE_ENV !== 'production'),
  );
  return response;
}

/**
 * Enforce presence of the `admin-authz` cookie for any `/{locale}/admin/*`
 * route except `/admin/login`. This is a UX redirect — real enforcement lives
 * on the backend (JWT validation on every /api/admin/* request). See inline
 * ADMIN_AUTHZ_COOKIE comment.
 */
function redirectUnauthedAdminTarget(request: NextRequest, pathname: string): NextResponse | null {
  if (!ADMIN_GATE_REGEX.test(pathname)) return null;
  if (request.cookies.has(ADMIN_AUTHZ_COOKIE)) return null;

  const locale = pathname.split('/')[1];
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}/admin/login`;
  url.searchParams.set('redirect', pathname);
  return NextResponse.redirect(url);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets, API routes, and Next.js internals
  if (IGNORED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Skip root-level static files (verification files, robots.txt, etc.)
  if (STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext)) && !pathname.slice(1).includes('/')) {
    return NextResponse.next();
  }

  // Already has a locale prefix — inject x-locale header for root layout
  if (pathnameHasLocale(pathname)) {
    const adminRedirect = redirectUnauthedAdminTarget(request, pathname);
    if (adminRedirect) return adminRedirect;

    const requestHeaders = new Headers(request.headers);
    const locale = pathname.split('/')[1];
    requestHeaders.set('x-locale', locale);
    return withNonceAndCsp(request, requestHeaders);
  }

  // Detect preferred locale and redirect (301 permanent for SEO)
  const locale = getPreferredLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(url, 301);
}

export const config = {
  matcher: [
    // Match all paths except static files and API
    '/((?!_next/static|_next/image|favicon.ico|images|api).*)',
  ],
};
