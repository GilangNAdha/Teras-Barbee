import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Keep the development badge from covering mobile navigation and CTAs in previews.
  devIndicators: false,
  allowedDevOrigins: ['**.e2b.app', '127.0.0.1'],
  async headers() {
    return [
      {
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
      },
      // Dev chunk URLs can be reused after a rebuild. Avoid storing them in
      // browsers or preview proxies alongside newer server-rendered HTML.
      ...(process.env.NODE_ENV === 'development'
        ? [{ source: '/_next/static/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] }]
        : [])
    ];
  },
  experimental: {
    typedEnv: true,
    // Do not reuse the dev compiler's on-disk cache across server restarts or branch switches.
    turbopackFileSystemCacheForDev: false
  }
};

export default nextConfig;
