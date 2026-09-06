import { pathToFileURL } from 'node:url';
import {
  evaluateProductionHttp,
  REQUIRED_HTTP_PATHS,
  type HttpExpectations,
  type HttpProbeResult,
} from '../lib/domain/readiness/http';
import { buildReadinessReport } from '../lib/domain/readiness/report';
import { buildContentSecurityPolicy, SECURITY_HEADERS } from '../lib/security/csp';

const DEFAULT_TIMEOUT_MS = 8_000;

function normalizeBaseUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('PRODUCTION_BASE_URL must be a valid URL');
  }

  const localHttp =
    parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !localHttp) {
    throw new Error('PRODUCTION_BASE_URL must use HTTPS');
  }

  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  parsed.pathname = '/';
  return parsed;
}

function responseHeaders(response: Response): Record<string, string> {
  return Object.fromEntries(response.headers.entries());
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

export async function collectHttpProbes(
  rawBaseUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<HttpProbeResult[]> {
  const base = normalizeBaseUrl(rawBaseUrl);

  const probe = async (path: (typeof REQUIRED_HTTP_PATHS)[number]): Promise<HttpProbeResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(new URL(path, base), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept: 'text/html,application/xhtml+xml' },
      });

      return {
        path,
        status: response.status,
        location: response.headers.get('location'),
        headers: responseHeaders(response),
        error: null,
      };
    } catch (error) {
      return {
        path,
        status: null,
        location: null,
        headers: {},
        error: isAbortError(error) ? 'timeout' : 'network',
      };
    } finally {
      clearTimeout(timer);
    }
  };

  return await Promise.all(REQUIRED_HTTP_PATHS.map((path) => probe(path)));
}

function productionExpectations(): HttpExpectations {
  return {
    expectedCsp: buildContentSecurityPolicy('production', true),
    expectedHeaders: Object.fromEntries(SECURITY_HEADERS.map(({ key, value }) => [key, value])),
  };
}

function printHuman(report: ReturnType<typeof buildReadinessReport>): void {
  console.log('\n  Production smoke');
  console.log('  ' + '─'.repeat(66));
  for (const check of report.checks) {
    const icon = check.status === 'pass' ? '✓' : '✗';
    console.log(`  ${icon} ${check.label}${check.detail ? ` — ${check.detail}` : ''}`);
  }
  console.log('  ' + '─'.repeat(66));
  console.log(`  machine ready: ${report.machineReady ? 'yes' : 'no'}\n`);
}

async function main(): Promise<void> {
  const baseUrl = process.env.PRODUCTION_BASE_URL ?? '';
  const asJson = process.argv.includes('--json');

  if (!baseUrl) {
    console.error('PRODUCTION_BASE_URL is required');
    process.exitCode = 1;
    return;
  }

  try {
    const base = normalizeBaseUrl(baseUrl);
    const probes = await collectHttpProbes(base.origin);
    const checks = evaluateProductionHttp(base.origin, probes, productionExpectations());
    const report = buildReadinessReport(checks, new Date().toISOString());

    if (asJson) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);

    if (!report.machineReady) process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'production smoke failed';
    console.error(message);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  void main();
}
