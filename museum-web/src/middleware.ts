import { type NextRequest, NextResponse } from 'next/server';
import { locales, defaultLocale, type Locale } from '@/lib/i18n';

const IGNORED_PREFIXES = ['/_next', '/api', '/images', '/favicon.ico', '/.well-known'];

const STATIC_EXTENSIONS = ['.xml', '.html', '.txt', '.ico', '.png', '.svg'];

const ADMIN_AUTHZ_COOKIE = 'admin-authz';

const ADMIN_GATE_REGEX = new RegExp(`^/(?:${locales.join('|')})/admin(?!/login)(?:/|$)`);

function getPreferredLocale(request: NextRequest): Locale {
  const acceptLang = request.headers.get('accept-language') ?? '';
  for (const locale of locales) {
    if (acceptLang.toLowerCase().includes(locale)) return locale;
  }
  return defaultLocale;
}

function pathnameHasLocale(pathname: string): boolean {
  return locales.some((locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`);
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function buildCspHeader(nonce: string, isDev: boolean, isHttps: boolean): string {
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://*.basemaps.cartocdn.com",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(isHttps ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

function withNonceAndCsp(request: NextRequest, requestHeaders: Headers): NextResponse {
  const nonce = generateNonce();
  requestHeaders.set('x-nonce', nonce);

  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const isHttps = request.nextUrl.protocol === 'https:' || forwardedProto === 'https';

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(
    'Content-Security-Policy',
    buildCspHeader(nonce, process.env.NODE_ENV !== 'production', isHttps),
  );
  return response;
}

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

  if (IGNORED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  if (STATIC_EXTENSIONS.some((ext) => pathname.endsWith(ext)) && !pathname.slice(1).includes('/')) {
    return NextResponse.next();
  }

  if (pathnameHasLocale(pathname)) {
    const adminRedirect = redirectUnauthedAdminTarget(request, pathname);
    if (adminRedirect) return adminRedirect;

    const requestHeaders = new Headers(request.headers);
    const [, locale] = pathname.split('/');
    if (locale) {
      requestHeaders.set('x-locale', locale);
    }
    return withNonceAndCsp(request, requestHeaders);
  }

  const locale = getPreferredLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname}`;
  return NextResponse.redirect(url, 301);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|api|monitoring|maplibre).*)'],
};
