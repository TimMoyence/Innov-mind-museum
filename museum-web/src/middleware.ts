import { type NextRequest, NextResponse } from 'next/server';
import { locales, defaultLocale, type Locale } from '@/lib/i18n';

/** Paths that should never be rewritten by the i18n middleware. */
const IGNORED_PREFIXES = ['/_next', '/api', '/images', '/favicon.ico'];

function getPreferredLocale(request: NextRequest): Locale {
  const acceptLang = request.headers.get('accept-language') ?? '';
  // Simple parser: pick the first locale that matches
  for (const locale of locales) {
    if (acceptLang.toLowerCase().includes(locale)) return locale;
  }
  return defaultLocale;
}

function pathnameHasLocale(pathname: string): boolean {
  return locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`,
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets, API routes, and Next.js internals
  if (IGNORED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Already has a locale prefix — inject x-locale header for root layout
  if (pathnameHasLocale(pathname)) {
    const locale = pathname.split('/')[1];
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-locale', locale);
    return NextResponse.next({ request: { headers: requestHeaders } });
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
