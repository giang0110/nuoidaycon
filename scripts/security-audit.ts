/**
 * Static security audit — Phase 9.
 *
 * Checks the invariants that no unit test naturally covers, because they are
 * about the SHAPE of the codebase rather than the behaviour of a function:
 * where secrets may appear, what may import what, and which guarantees must
 * still be stated in the SQL.
 *
 * Runtime enforcement lives in the RLS matrix; this is the complement.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';

interface Finding {
  severity: 'error' | 'warning';
  check: string;
  detail: string;
}

const ROOT = process.cwd();
const findings: Finding[] = [];

function sourceFiles(roots: string[], extensions: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (extensions.some((ext) => full.endsWith(ext))) out.push(full);
    }
  };
  for (const root of roots) walk(resolve(ROOT, root));
  return out;
}

const appSources = sourceFiles(['app', 'lib', 'components'], ['.ts', '.tsx']);
const allSources = sourceFiles(['app', 'lib', 'components', 'scripts', 'tests'], ['.ts', '.tsx']);
const migrations = sourceFiles(['supabase/migrations'], ['.sql']);

/**
 * Remove comments before scanning.
 *
 * Without this, a comment saying "never call withMetadata()" trips the check
 * that looks for withMetadata() — and an audit that cries wolf is an audit
 * people learn to ignore.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function fail(check: string, detail: string) {
  findings.push({ severity: 'error', check, detail });
}
function warn(check: string, detail: string) {
  findings.push({ severity: 'warning', check, detail });
}

// --- 1. Secrets ------------------------------------------------------------
const SECRET_PATTERNS: [string, RegExp][] = [
  ['jwt', /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/],
  ['anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['generic api key', /\bsk-[A-Za-z0-9]{32,}/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['aws key', /\bAKIA[0-9A-Z]{16}\b/],
];

for (const file of [...allSources, ...migrations, resolve(ROOT, '.env.example')]) {
  let content: string;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const [label, pattern] of SECRET_PATTERNS) {
    if (pattern.test(content)) fail('secret', `${label} in ${relative(ROOT, file)}`);
  }
}

// --- 2. Service-role key confined to scripts (decision A3) -----------------
for (const file of appSources) {
  if (/SUPABASE_SERVICE_ROLE_KEY/.test(stripComments(readFileSync(file, 'utf8')))) {
    fail('service-role', `service-role key referenced in ${relative(ROOT, file)}`);
  }
}

// --- 3. Session verification (getUser, never getSession) -------------------
for (const file of appSources) {
  const content = stripComments(readFileSync(file, 'utf8'));
  if (/\.auth\.getSession\s*\(/.test(content)) {
    fail(
      'auth',
      `${relative(ROOT, file)} calls getSession(); it does not verify the cookie — use getUser()`,
    );
  }
}

// --- 4. Domain purity (decision A1) ---------------------------------------
for (const file of sourceFiles(['lib/domain'], ['.ts'])) {
  const content = stripComments(readFileSync(file, 'utf8'));
  const bad = content.match(
    /^\s*import[^;]*from\s+['"](@supabase\/[^'"]*|next[/'"][^'"]*|react)['"]/m,
  );
  if (bad) fail('domain-purity', `${relative(ROOT, file)} imports ${bad[1]}`);
}

// --- 5. RLS still enabled on every table ----------------------------------
const rlsSql = migrations.map((f) => readFileSync(f, 'utf8')).join('\n');
/** Collapsed whitespace: SQL alignment must not change what a check sees. */
const rlsFlat = rlsSql.replace(/\s+/g, ' ');
const createdTables = [...rlsSql.matchAll(/create table if not exists public\.(\w+)/g)].map(
  (m) => m[1]!,
);
for (const table of createdTables) {
  if (!new RegExp(`alter table public\\.${table}\\s+enable row level security`).test(rlsSql)) {
    fail('rls', `table ${table} never has RLS enabled`);
  }
}
if (!/revoke all on all tables in schema public from anon/.test(rlsFlat)) {
  fail('rls', 'anon privileges are never revoked');
}

// --- 6. Storage privacy (decision A10) ------------------------------------
if (!/'submissions', 'submissions', false/.test(rlsFlat)) {
  warn('storage', 'could not confirm the submissions bucket is created private');
}
if (/public\s*=\s*true/.test(rlsSql)) {
  fail('storage', 'a bucket is marked public');
}
if (!/storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/.test(rlsFlat)) {
  fail('storage', 'storage policies do not gate on the parent-id path prefix');
}

// --- 7. EXIF removal is still server-side ---------------------------------
const sanitiser = stripComments(readFileSync(resolve(ROOT, 'lib/media/sanitise-image.ts'), 'utf8'));
if (/withMetadata\s*\(/.test(sanitiser)) {
  fail('privacy', 'sanitise-image re-attaches metadata with withMetadata()');
}
if (!/\.jpeg\s*\(/.test(sanitiser)) {
  fail('privacy', 'sanitise-image no longer re-encodes; EXIF would survive');
}

// --- 8. Answer keys never reach a child -----------------------------------
const player = stripComments(readFileSync(resolve(ROOT, 'components/activity-player.tsx'), 'utf8'));
for (const forbidden of ['answerKey', 'rationale', 'exemplarAnswer', 'isConstructive']) {
  if (new RegExp(`\\b${forbidden}\\b`).test(player)) {
    fail('child-view', `the activity player references ${forbidden}`);
  }
}

// --- 9. No third-party script origin in the CSP ---------------------------
const nextConfig = stripComments(readFileSync(resolve(ROOT, 'next.config.ts'), 'utf8'));
const cspModule = stripComments(readFileSync(resolve(ROOT, 'lib/security/csp.ts'), 'utf8'));

const scriptSrc = cspModule.match(/script-src[^`'"]*/)?.[0] ?? '';
if (/https?:\/\//.test(scriptSrc)) {
  fail('csp', `script-src allows an external origin: ${scriptSrc.trim()}`);
}

/**
 * 'unsafe-eval' is granted to the dev server for React Refresh. It must reach
 * production under no circumstances, so this checks the guard rather than the
 * string: the only place the literal may appear is behind an explicit
 * development comparison.
 */
if (/unsafe-eval/.test(cspModule)) {
  const guarded = /nodeEnv === 'development'[\s\S]{0,120}unsafe-eval/.test(cspModule);
  if (!guarded) {
    fail('csp', "'unsafe-eval' is not gated behind a development check");
  }
}
if (/unsafe-eval/.test(nextConfig)) {
  fail('csp', "next.config.ts hard-codes 'unsafe-eval'; it belongs behind the dev guard");
}
// Headers are declared in the CSP module and wired up by next.config.ts, so
// both files count as "where the headers are set".
const headerSources = `${nextConfig}\n${cspModule}`;
for (const header of [
  'X-Frame-Options',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'Strict-Transport-Security',
]) {
  if (!headerSources.includes(header)) fail('headers', `${header} is not set`);
}
if (!/Content-Security-Policy/.test(nextConfig)) {
  fail('headers', 'the CSP is never attached to a response');
}

// --- 9b. Server Action body limit vs the sanitiser cap --------------------
const bodyLimitMb = Number(nextConfig.match(/bodySizeLimit:\s*'(\d+)mb'/)?.[1]);
const sanitiserCapMb = Number(sanitiser.match(/MAX_UPLOAD_BYTES = (\d+) \* 1024 \* 1024/)?.[1]);
if (!Number.isFinite(bodyLimitMb)) {
  fail(
    'upload',
    'serverActions.bodySizeLimit is not configured; real photos will be rejected in transit',
  );
} else if (Number.isFinite(sanitiserCapMb) && bodyLimitMb <= sanitiserCapMb) {
  fail(
    'upload',
    `bodySizeLimit (${bodyLimitMb}mb) must exceed the sanitiser cap (${sanitiserCapMb}mb) so our check reports the failure, not the framework`,
  );
}

// --- 10. No analytics or advertising SDK (S5) -----------------------------
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
const TRACKERS = [
  'react-ga',
  'react-ga4',
  'mixpanel-browser',
  'posthog-js',
  '@segment/analytics-next',
  'amplitude-js',
  '@sentry/nextjs',
  'hotjar',
  'gtag',
];
for (const tracker of declared.filter((d) => TRACKERS.includes(d))) {
  fail('privacy', `analytics/advertising SDK present: ${tracker}`);
}

// --- 11. Logging must not carry child data --------------------------------
for (const file of appSources) {
  const content = stripComments(readFileSync(file, 'utf8'));
  const logs = content.match(/console\.(log|info|debug|warn|error)\([^)]*\)/g) ?? [];
  for (const log of logs) {
    if (/displayName|answers|content_snapshot|contentSnapshot|payload|child\b/.test(log)) {
      fail('logging', `${relative(ROOT, file)} logs something that may contain child data`);
    }
  }
}

// --- report ----------------------------------------------------------------
const errors = findings.filter((f) => f.severity === 'error');
const warnings = findings.filter((f) => f.severity === 'warning');

console.log('\n  Security audit');
console.log('  ' + '─'.repeat(66));
if (findings.length === 0) {
  console.log('  ✓ all checks passed');
} else {
  for (const finding of findings) {
    console.log(
      `  ${finding.severity === 'error' ? '✗' : '⚠'} [${finding.check}] ${finding.detail}`,
    );
  }
}
console.log('  ' + '─'.repeat(66));
console.log(`  files scanned: ${allSources.length} source, ${migrations.length} migration`);
console.log(`  ${errors.length} error(s), ${warnings.length} warning(s)\n`);

if (errors.length > 0) process.exit(1);
