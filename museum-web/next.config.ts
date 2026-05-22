import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import { withPlausibleProxy } from 'next-plausible';

// Note: Content-Security-Policy is built per-request (with a fresh nonce) in
// `src/middleware.ts`. Keeping a static CSP here would either duplicate the
// dynamic header or leak `unsafe-inline`. See
// https://nextjs.org/docs/app/guides/content-security-policy.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=()' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    formats: ['image/avif', 'image/webp'],
  },

  async headers() {
    return [
      // TD-RNAV-01 — Force `application/json` on the extensionless AASA file.
      // Next serves a `public/` file with no extension as
      // `application/octet-stream`, which Apple silently rejects (spec R5/R10,
      // design D1). No redirect, no route handler — `/.well-known/*` already
      // bypasses the i18n middleware (design D2, `middleware.test.ts:58-63`).
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      { source: '/:path*', headers: securityHeaders },
    ];
  },

  // Proxy /api calls to the backend in development
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_BASE_URL ?? 'http://localhost:3000'}/api/:path*`,
      },
    ];
  },
};

// Wave C5 / T-C56 — Wrap with `withPlausibleProxy` so the tracker script +
// events endpoint are served first-party (adblocker-proof, same-origin).
// Per `lib-docs/plausible/PATTERNS.md` §3.1 + §7 : `domain` is read from
// `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` (env-driven, never hardcoded — PATTERNS.md
// §5 anti-pattern #2). When the env var is unset (dev), the proxy still
// wires but the `<PlausibleProvider enabled={false}>` in `layout.tsx`
// suppresses script injection — fail-closed posture.
const withPlausible = withPlausibleProxy({
  customDomain: process.env.NEXT_PUBLIC_PLAUSIBLE_CUSTOM_DOMAIN,
});

// Note: `tracePropagationTargets` is a Sentry.init() option (per-runtime),
// NOT a withSentryConfig (build) option. The explicit allowlist
// (api.musaium.com + localhost:3000) is wired in `instrumentation-client.ts`,
// `sentry.server.config.ts`, and `sentry.edge.config.ts`. See
// `lib-docs/@sentry/nextjs/PATTERNS.md` §3 lines 159-161 + §4 line 189.
export default withSentryConfig(withPlausible(nextConfig), {
  // Only upload source maps when SENTRY_AUTH_TOKEN is set (CI / production builds)
  silent: true,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  tunnelRoute: '/monitoring',
});
