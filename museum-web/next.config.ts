import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',

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

export default nextConfig;
