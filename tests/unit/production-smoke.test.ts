import { describe, expect, it } from 'vitest';
import {
  evaluateProductionHttp,
  type HttpExpectations,
  type HttpProbeResult,
} from '@/lib/domain/readiness/http';
import { collectHttpProbes } from '../../scripts/production-smoke';

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
      error: null,
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
    probes.find((probe) => probe.path === '/play')!.headers['cache-control'] =
      'public, max-age=300';

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

describe('production smoke transport', () => {
  it('probes exactly the five allowed paths with manual GET redirects and no authorization', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, init });
      return new Response('', {
        status: url.endsWith('/') || url.endsWith('/login') ? 200 : 307,
        headers: {
          location: `${BASE}/login`,
          'x-test-header': 'captured',
        },
      });
    };

    const probes = await collectHttpProbes(BASE, fakeFetch, 50);

    expect(probes.map((probe) => probe.path)).toEqual([
      '/',
      '/login',
      '/dashboard',
      '/play',
      '/settings',
    ]);
    expect(calls).toHaveLength(5);
    for (const call of calls) {
      expect(call.init?.method).toBe('GET');
      expect(call.init?.redirect).toBe('manual');
      expect(new Headers(call.init?.headers).has('authorization')).toBe(false);
    }
    expect(probes[0]?.headers['x-test-header']).toBe('captured');
  });

  it('rejects a non-HTTPS production base URL before making requests', async () => {
    let called = false;
    const fakeFetch: typeof fetch = async () => {
      called = true;
      return new Response('');
    };

    await expect(collectHttpProbes('http://app.example', fakeFetch, 50)).rejects.toThrow(/https/i);
    expect(called).toBe(false);
  });

  it('classifies fetch failures as network errors without throwing the raw error', async () => {
    const fakeFetch: typeof fetch = async () => {
      throw new Error('token=secret-value');
    };

    const probes = await collectHttpProbes(BASE, fakeFetch, 50);

    expect(probes).toHaveLength(5);
    expect(probes.every((probe) => probe.error === 'network')).toBe(true);
    expect(JSON.stringify(probes)).not.toContain('secret-value');
  });

  it('classifies aborted requests as timeouts', async () => {
    const fakeFetch: typeof fetch = async (_input, init) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });

    const probes = await collectHttpProbes(BASE, fakeFetch, 1);

    expect(probes).toHaveLength(5);
    expect(probes.every((probe) => probe.error === 'timeout')).toBe(true);
  });
});
