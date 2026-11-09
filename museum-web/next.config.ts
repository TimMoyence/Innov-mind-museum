import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import { withPlausibleProxy } from 'next-plausible';

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
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      { source: '/:path*', headers: securityHeaders },
    ];
  },

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_BASE_URL ?? 'http://localhost:3000'}/api/:path*`,
      },
    ];
  },
};

const withPlausible = withPlausibleProxy({
  customDomain: process.env.NEXT_PUBLIC_PLAUSIBLE_CUSTOM_DOMAIN,
});

export default withSentryConfig(withPlausible(nextConfig), {
  silent: true,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  tunnelRoute: '/monitoring',
});
