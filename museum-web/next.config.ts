import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

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
    return [{ source: '/:path*', headers: securityHeaders }];
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

// Note: `tracePropagationTargets` is a Sentry.init() option (per-runtime),
// NOT a withSentryConfig (build) option. The explicit allowlist
// (api.musaium.com + localhost:3000) is wired in `instrumentation-client.ts`,
// `sentry.server.config.ts`, and `sentry.edge.config.ts`. See
// `lib-docs/@sentry/nextjs/PATTERNS.md` §3 lines 159-161 + §4 line 189.
export default withSentryConfig(nextConfig, {
  // Only upload source maps when SENTRY_AUTH_TOKEN is set (CI / production builds)
  silent: true,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  tunnelRoute: '/monitoring',
});
