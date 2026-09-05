import { describe, expect, it } from 'vitest';
import {
  evaluateProductionHttp,
  type HttpExpectations,
  type HttpProbeResult,
} from '@/lib/domain/readiness/http';

const BASE = 'https://app.example';
const CSP = "default-src 'self'; script-src 'self'";
const expectations: HttpExpectations = {
  expectedCsp: CSP,
  expectedHeaders: {
    'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
  },
};

function commonHeaders(cacheControl?: string): Record<string, string> {
  return {
    'content-security-policy': CSP,
    'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    ...(cacheControl ? { 'cache-control': cacheControl } : {}),
  };
}

function goodProbes(): HttpProbeResult[] {
  return [
    {
      path: '/',
      status: 200,
      location: null,
      headers: commonHeaders(),
      error: null,
    },
    {
      path: '/login',
      status: 200,
      location: null,
      headers: commonHeaders('private, no-store, max-age=0'),
      error: null,
    },
    ...(['/dashboard', '/play', '/settings'] as const).map((path) => ({
      path,
      status: 307,
      location: `${BASE}/login?next=${encodeURIComponent(path)}`,
      headers: commonHeaders('private, no-store, max-age=0'),
      error: null as const,
    })),
  ];
}

function status(checks: ReturnType<typeof evaluateProductionHttp>, id: string) {
  return checks.find((check) => check.id === id)?.status;
}

describe('production HTTP readiness', () => {
  it('passes the expected public and protected surface', () => {
    const checks = evaluateProductionHttp(BASE, goodProbes(), expectations);

    expect(checks.every((check) => check.status === 'pass')).toBe(true);
  });

  it('fails when a protected route returns content instead of redirecting', () => {
    const probes = goodProbes().map((probe) =>
      probe.path === '/dashboard' ? { ...probe, status: 200, location: null } : probe,
    );

    expect(status(evaluateProductionHttp(BASE, probes, expectations), 'protected-redirects')).toBe(
      'fail',
    );
  });

  it('fails a cross-origin protected redirect even when the pathname is login', () => {
    const probes = goodProbes().map((probe) =>
      probe.path === '/settings'
        ? { ...probe, location: 'https://evil.example/login?next=%2Fsettings' }
        : probe,
    );

    expect(status(evaluateProductionHttp(BASE, probes, expectations), 'protected-redirects')).toBe(
      'fail',
    );
  });

  it.each([
    'content-security-policy',
    'strict-transport-security',
    'x-frame-options',
    'referrer-policy',
  ])('fails when %s is missing', (header) => {
    const probes = goodProbes();
    delete probes[0]!.headers[header];

    expect(status(evaluateProductionHttp(BASE, probes, expectations), 'security-headers')).toBe(
      'fail',
    );
  });

  it('fails when a protected response loses private no-store cache semantics', () => {
    const probes = goodProbes();
    probes.find((probe) => probe.path === '/play')!.headers['cache-control'] = 'public, max-age=300';

    expect(status(evaluateProductionHttp(BASE, probes, expectations), 'protected-cache')).toBe(
      'fail',
    );
  });

  it('fails when X-Powered-By is exposed', () => {
    const probes = goodProbes();
    probes[0]!.headers['x-powered-by'] = 'Next.js';

    expect(status(evaluateProductionHttp(BASE, probes, expectations), 'powered-by')).toBe('fail');
  });

  it.each(['timeout', 'network'] as const)('fails closed on %s transport errors', (error) => {
    const probes = goodProbes().map((probe) =>
      probe.path === '/' ? { ...probe, status: null, error } : probe,
    );

    expect(status(evaluateProductionHttp(BASE, probes, expectations), 'reachability')).toBe('fail');
  });

  it('fails when a required probe is missing', () => {
    const probes = goodProbes().filter((probe) => probe.path !== '/settings');

    expect(status(evaluateProductionHttp(BASE, probes, expectations), 'reachability')).toBe('fail');
  });

  it('does not copy secret query strings into failure details', () => {
    const probes = goodProbes().map((probe) =>
      probe.path === '/' ? { ...probe, status: null, error: 'network' as const } : probe,
    );
    const checks = evaluateProductionHttp(
      'https://app.example/?token=secret-value',
      probes,
      expectations,
    );

    expect(JSON.stringify(checks)).not.toContain('secret-value');
    expect(JSON.stringify(checks)).not.toContain('token=');
  });
});
