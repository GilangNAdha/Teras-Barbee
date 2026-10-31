import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Keep the development badge from covering mobile navigation and CTAs in previews.
  devIndicators: false,
  allowedDevOrigins: ['**.e2b.app', '127.0.0.1'],
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ...(process.env.NODE_ENV === 'production'
          ? [
              { key: 'X-Frame-Options', value: 'DENY' },
              { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }
            ]
          : [])
      ]
    }];
  },
  experimental: {
    typedEnv: true
  }
};

export default nextConfig;
