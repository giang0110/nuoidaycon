import type { NextConfig } from 'next';

/**
 * Content-Security-Policy and security headers — CHILD_SAFETY.md §7.
 *
 * No third-party script origin is permitted anywhere. This is what makes S5
 * ("no advertising or behavioural-analytics SDKs") enforceable rather than a
 * promise: a tracker added later would be blocked by the browser, not just
 * frowned upon in review.
 *
 * `'unsafe-inline'` on style-src is required by Next's inlined critical CSS.
 * Scripts do NOT get it — `'strict-dynamic'` plus nonces would be the next
 * hardening step once the app has a nonce middleware.
 */
const CSP = [
  "default-src 'self'",
  // Next injects inline bootstrap scripts; no external script origin is allowed.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  // blob: covers the client-side preview of a photo before it is uploaded.
  "img-src 'self' data: blob: https://*.supabase.co",
  "connect-src 'self' https://*.supabase.co",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            // The camera is needed for photographing work; everything else off.
            value: 'camera=(self), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
      {
        // A child's work must never be cached by an intermediary.
        source: '/(play|print|assignments)/:path*',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      },
    ];
  },
};

export default nextConfig;
