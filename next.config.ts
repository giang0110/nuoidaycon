import type { NextConfig } from 'next';
import { buildContentSecurityPolicy, SECURITY_HEADERS } from './lib/security/csp';

/**
 * Security headers come from lib/security/csp.ts so the policy is unit
 * testable — in particular, that production never carries 'unsafe-eval'.
 */
const CSP = buildContentSecurityPolicy(process.env.NODE_ENV);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,

  experimental: {
    /**
     * Server Actions default to a 1 MB request body, which rejected real phone
     * photos before submitAssignmentAction ever ran — the parent saw a
     * framework error rather than the sanitiser's message.
     *
     * 16 MB sits deliberately just above the sanitiser's 15 MB cap
     * (lib/media/sanitise-image.ts) so that an oversized upload is refused by
     * OUR check, with a message a parent can act on, instead of by the
     * framework. The sanitiser stays the authority on what is too large; this
     * only stops the request dying in transit.
     *
     * Note this is a per-REQUEST budget, not per file. The player renders a
     * single, non-multiple file input, so one photo per submission is what the
     * UI can actually produce.
     */
    serverActions: { bodySizeLimit: '16mb' },
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'Content-Security-Policy', value: CSP }, ...SECURITY_HEADERS],
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
