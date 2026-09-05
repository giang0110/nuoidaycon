import type { ReadinessCheck } from './report';

export const REQUIRED_HTTP_PATHS = ['/', '/login', '/dashboard', '/play', '/settings'] as const;

const PUBLIC_PATHS = ['/', '/login'] as const;
const PROTECTED_PATHS = ['/dashboard', '/play', '/settings'] as const;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface HttpProbeResult {
  path: string;
  status: number | null;
  location: string | null;
  headers: Record<string, string>;
  error: 'timeout' | 'network' | null;
}

export interface HttpExpectations {
  expectedCsp: string;
  expectedHeaders: Record<string, string>;
}

function pass(id: string, label: string, detail?: string): ReadinessCheck {
  return { id, label, status: 'pass', ...(detail ? { detail } : {}) };
}

function fail(id: string, label: string, detail: string): ReadinessCheck {
  return { id, label, status: 'fail', detail };
}

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value.trim()]),
  );
}

function safeOrigin(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return null;
  }
}

export function evaluateProductionHttp(
  baseUrl: string,
  probes: readonly HttpProbeResult[],
  expectations: HttpExpectations,
): ReadinessCheck[] {
  const byPath = new Map(
    probes.map((probe) => [probe.path, { ...probe, headers: normalizeHeaders(probe.headers) }]),
  );
  const origin = safeOrigin(baseUrl);

  const missingPaths = REQUIRED_HTTP_PATHS.filter((path) => !byPath.has(path));
  const transportFailures = REQUIRED_HTTP_PATHS.filter((path) => {
    const probe = byPath.get(path);
    return probe ? probe.error !== null || probe.status === null : false;
  });
  const publicStatusFailures = PUBLIC_PATHS.filter((path) => {
    const probe = byPath.get(path);
    return probe ? probe.status === null || probe.status < 200 || probe.status >= 400 : false;
  });

  const reachability =
    missingPaths.length === 0 && transportFailures.length === 0 && publicStatusFailures.length === 0
      ? pass('reachability', 'Production routes are reachable')
      : fail(
          'reachability',
          'Production routes are reachable',
          `failed paths: ${
            [...missingPaths, ...transportFailures, ...publicStatusFailures]
              .filter((path, index, paths) => paths.indexOf(path) === index)
              .join(', ') || 'unknown'
          }`,
        );

  const securityFailures: string[] = [];
  for (const path of REQUIRED_HTTP_PATHS) {
    const probe = byPath.get(path);
    if (!probe) continue;
    if (probe.headers['content-security-policy'] !== expectations.expectedCsp) {
      securityFailures.push(`${path}:content-security-policy`);
    }
    for (const [name, expected] of Object.entries(expectations.expectedHeaders)) {
      if (probe.headers[name.toLowerCase()] !== expected) {
        securityFailures.push(`${path}:${name.toLowerCase()}`);
      }
    }
  }
  const securityHeaders =
    securityFailures.length === 0
      ? pass('security-headers', 'Security headers match production policy')
      : fail(
          'security-headers',
          'Security headers match production policy',
          `mismatches: ${securityFailures.join(', ')}`,
        );

  const redirectFailures: string[] = [];
  for (const path of PROTECTED_PATHS) {
    const probe = byPath.get(path);
    if (!probe || !origin || probe.status === null || !REDIRECT_STATUSES.has(probe.status)) {
      redirectFailures.push(path);
      continue;
    }
    if (!probe.location) {
      redirectFailures.push(path);
      continue;
    }
    try {
      const target = new URL(probe.location, origin);
      if (target.origin !== origin || target.pathname !== '/login') redirectFailures.push(path);
    } catch {
      redirectFailures.push(path);
    }
  }
  const protectedRedirects =
    redirectFailures.length === 0
      ? pass('protected-redirects', 'Protected routes redirect to same-origin login')
      : fail(
          'protected-redirects',
          'Protected routes redirect to same-origin login',
          `failed paths: ${redirectFailures.join(', ')}`,
        );

  const cacheFailures = PROTECTED_PATHS.filter((path) => {
    const value = byPath.get(path)?.headers['cache-control']?.toLowerCase() ?? '';
    return !value.includes('private') || !value.includes('no-store');
  });
  const protectedCache =
    cacheFailures.length === 0
      ? pass('protected-cache', 'Protected routes disable intermediary caching')
      : fail(
          'protected-cache',
          'Protected routes disable intermediary caching',
          `failed paths: ${cacheFailures.join(', ')}`,
        );

  const poweredByPaths = REQUIRED_HTTP_PATHS.filter((path) =>
    Boolean(byPath.get(path)?.headers['x-powered-by']),
  );
  const poweredBy =
    poweredByPaths.length === 0
      ? pass('powered-by', 'Framework signature header is absent')
      : fail(
          'powered-by',
          'Framework signature header is absent',
          `exposed paths: ${poweredByPaths.join(', ')}`,
        );

  return [reachability, securityHeaders, protectedRedirects, protectedCache, poweredBy];
}
