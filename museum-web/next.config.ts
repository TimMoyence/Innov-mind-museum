import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    formats: ['image/avif', 'image/webp'],
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

export default withSentryConfig(nextConfig, {
  // Only upload source maps when SENTRY_AUTH_TOKEN is set (CI / production builds)
  silent: true,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
