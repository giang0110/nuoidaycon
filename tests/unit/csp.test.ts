/**
 * Content-Security-Policy regression coverage.
 *
 * The dev relaxation added for React Refresh is exactly the kind of change
 * that leaks into production later, so the production policy is pinned by test
 * rather than by a reviewer noticing a conditional.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildContentSecurityPolicy, scriptSrcFor, SECURITY_HEADERS } from '@/lib/security/csp';
import { isProtectedPath } from '@/lib/supabase/middleware';
import { MAX_UPLOAD_BYTES } from '@/lib/media/sanitise-image';

const PRODUCTION_ENVS = ['production', 'test', 'preview', 'staging', '', undefined as never];

describe("'unsafe-eval' is a development-only relaxation", () => {
  it('is absent from the production policy', () => {
    expect(buildContentSecurityPolicy('production')).not.toContain('unsafe-eval');
  });

  it.each(PRODUCTION_ENVS)(
    'is absent for NODE_ENV=%s — development is the only exception',
    (env) => {
      expect(scriptSrcFor(env as string)).not.toContain('unsafe-eval');
    },
  );

  it('is present in development, where React Refresh needs it', () => {
    expect(scriptSrcFor('development')).toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy('development')).toContain("'unsafe-eval'");
  });

  it('changes nothing else between the two policies', () => {
    const dev = buildContentSecurityPolicy('development').split('; ');
    const prod = buildContentSecurityPolicy('production').split('; ');
    expect(dev).toHaveLength(prod.length);

    const differing = dev.filter((directive, i) => directive !== prod[i]);
    expect(differing.map((d) => d.split(' ')[0])).toEqual(['script-src']);
  });
});

describe('HTTP E2E keeps the production CSP except for transport upgrade', () => {
  it('keeps upgrade-insecure-requests in the real production policy', () => {
    expect(buildContentSecurityPolicy('production')).toContain('upgrade-insecure-requests');
  });

  it('can omit transport upgrade for the explicit localhost HTTP harness', () => {
    const e2e = buildContentSecurityPolicy('production', false);
    expect(e2e).not.toContain('upgrade-insecure-requests');
    expect(e2e).toContain("default-src 'self'");
    expect(e2e).toContain("frame-ancestors 'none'");
    expect(e2e).toContain("form-action 'self'");
    expect(e2e).not.toContain('unsafe-eval');
  });
});

describe('no third-party script origin, in any environment', () => {
  it.each(['development', 'production'])('script-src has no external origin (%s)', (env) => {
    const scriptSrc = buildContentSecurityPolicy(env)
      .split('; ')
      .find((d) => d.startsWith('script-src'))!;
    expect(scriptSrc).not.toMatch(/https?:\/\//);
  });

  it('keeps the directives that make the tracker ban enforceable', () => {
    const csp = buildContentSecurityPolicy('production');
    for (const directive of [
      "default-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ]) {
      expect(csp).toContain(directive);
    }
  });

  it('still allows the font and Supabase origins the app actually needs', () => {
    const csp = buildContentSecurityPolicy('production');
    expect(csp).toContain('https://fonts.gstatic.com');
    expect(csp).toContain('https://*.supabase.co');
  });
});

describe('security headers', () => {
  it('carries every header the audit requires', () => {
    const keys = SECURITY_HEADERS.map((h) => h.key);
    for (const required of [
      'X-Frame-Options',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Strict-Transport-Security',
    ]) {
      expect(keys).toContain(required);
    }
  });

  it('leaves only the camera enabled', () => {
    const permissions = SECURITY_HEADERS.find((h) => h.key === 'Permissions-Policy')!.value;
    expect(permissions).toContain('camera=(self)');
    expect(permissions).toContain('microphone=()');
    expect(permissions).toContain('geolocation=()');
  });
});

/**
 * The framework limit and the sanitiser limit have to stay in the right order,
 * or an oversized upload dies in transit and the parent sees a framework error
 * instead of a message they can act on.
 */
describe('Server Action body limit sits above the sanitiser cap', () => {
  const config = readFileSync('next.config.ts', 'utf8');

  it('configures a body size limit at all', () => {
    expect(config).toMatch(/serverActions:\s*\{\s*bodySizeLimit:\s*'(\d+)mb'/);
  });

  it('is larger than the sanitiser maximum, so OUR check is the one that fires', () => {
    const configuredMb = Number(config.match(/bodySizeLimit:\s*'(\d+)mb'/)?.[1]);
    expect(Number.isFinite(configuredMb)).toBe(true);
    expect(configuredMb * 1024 * 1024).toBeGreaterThan(MAX_UPLOAD_BYTES);
  });

  it('does not silently raise the sanitiser cap', () => {
    // The framework budget moved; the privacy-relevant limit did not.
    expect(MAX_UPLOAD_BYTES).toBe(15 * 1024 * 1024);
  });
});

/**
 * The no-store list and the protected-route list have to stay in step. Next
 * emits no-store for a page that reads cookies, but that is a default rather
 * than a guarantee — so the header is declared explicitly, and this keeps the
 * declaration from drifting behind the routes it is meant to cover.
 */
describe('every route behind a session is declared no-store', () => {
  const config = readFileSync('next.config.ts', 'utf8');
  const noStoreSource =
    config.match(/source:\s*\n?\s*'\/\(([a-z|]+)\)\/:path\*'/)?.[1]?.split('|') ?? [];

  it('parses the no-store route group out of next.config.ts', () => {
    expect(noStoreSource.length).toBeGreaterThan(0);
  });

  it.each([
    'dashboard',
    'children',
    'settings',
    'library',
    'assign',
    'assignments',
    'ai',
    'play',
    'print',
  ])('covers /%s', (segment) => {
    expect(isProtectedPath(`/${segment}`)).toBe(true);
    expect(noStoreSource).toContain(segment);
  });

  it('covers /auth, whose URL carries a one-time credential', () => {
    expect(noStoreSource).toContain('auth');
  });

  it('does not accidentally cover the public marketing pages', () => {
    for (const publicSegment of ['privacy', 'safety']) {
      expect(noStoreSource).not.toContain(publicSegment);
    }
  });
});
