/**
 * Content-Security-Policy — CHILD_SAFETY.md §7.
 *
 * No third-party script origin is permitted in any environment. This is what
 * makes S5 ("no advertising or behavioural-analytics SDKs") enforceable rather
 * than a promise: a tracker added later would be blocked by the browser, not
 * just frowned upon in review.
 *
 * Lives in its own module, rather than inline in next.config.ts, so the rules
 * below can be unit tested. "Production has no 'unsafe-eval'" is the kind of
 * claim that should be proven by a test rather than trusted to a reviewer
 * noticing a conditional.
 */

export type NodeEnv = 'development' | 'test' | 'production' | (string & {});

/**
 * `'unsafe-eval'` is required by React Refresh and the Next dev overlay, which
 * evaluate code at runtime to hot-reload components and render stack frames.
 *
 * It is a genuine relaxation — with it, an injected string can become
 * executable code — so it is granted ONLY to the development server, which is
 * never reachable by a parent or a child. Production and every preview build
 * get the strict policy.
 */
export function scriptSrcFor(nodeEnv: NodeEnv): string {
  const sources = ["'self'", "'unsafe-inline'"];
  if (nodeEnv === 'development') sources.push("'unsafe-eval'");
  return `script-src ${sources.join(' ')}`;
}

export function buildContentSecurityPolicy(
  nodeEnv: NodeEnv,
  upgradeInsecureRequests = true,
): string {
  const directives = [
    "default-src 'self'",
    // Next injects inline bootstrap scripts; no external script origin is
    // allowed in any environment.
    scriptSrcFor(nodeEnv),
    // Required by Next's inlined critical CSS. Scripts do NOT get it —
    // 'strict-dynamic' plus nonces is the next hardening step.
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
  ];

  // Production is HTTPS and keeps this hardening directive. The explicit E2E
  // HTTP harness may omit it because WebKit upgrades localhost/127.0.0.1
  // subresources and navigations to HTTPS, where the test server has no TLS.
  if (upgradeInsecureRequests) directives.push('upgrade-insecure-requests');

  return directives.join('; ');
}

export const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    // The camera is needed for photographing work; everything else off.
    value: 'camera=(self), microphone=(), geolocation=(), interest-cohort=()',
  },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
] as const;
