# Phase 11 — Production Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reproducible read-only production readiness checks, preserve truthful empty-data metrics, synchronize deployment documentation with the live system, and verify the deployed app without mutating production or enabling AI.

**Architecture:** Keep readiness evaluation pure under `lib/domain/readiness/`, with transport adapters confined to `scripts/`. HTTP smoke probes and PostgreSQL queries produce plain snapshots; pure evaluators convert those snapshots into a shared readiness report. Ordinary CI tests the evaluators and adapters against fixtures/disposable PostgreSQL only; live production checks remain explicit operator-run release gates.

**Tech Stack:** TypeScript · Node 22+ · pnpm 10 · Vitest · `pg` · Next.js 16 · Supabase/Postgres · GitHub Actions · Vercel

**Spec:** `docs/superpowers/specs/2026-09-05-production-launch-readiness-design.md`

## Global Constraints

- Production checks are read-only: no production user, child, assignment, submission, Storage object, configuration, migration, seed, DDL or DML mutation.
- `SUPABASE_SERVICE_ROLE_KEY`, `PRODUCTION_DATABASE_URL` and `METRICS_DATABASE_URL` must never enter Vercel runtime configuration.
- Do not print connection strings, keys, cookies, signed URLs or email credentials.
- AI remains disabled; this phase must not enable or live-test generation.
- Human-only gates remain human: real SMTP delivery/Auth email round-trip, real phone-photo EXIF verification, signed-URL expiry on a real object, real A4 print, PDPD/COPPA-style review and the Vietnam/Singapore residency decision.
- Ordinary PR CI must not call the live production URL or use production database credentials.
- The domain layer stays pure: no `pg`, Supabase, Next.js, React or network imports under `lib/domain/readiness/`.
- Any ambiguous or failed production check fails closed; `pending_human` and `insufficient_data` never become `pass`.
- Existing full CI, RLS matrix, catalog validation and Playwright must remain green.

---

## File map

- Create `lib/domain/readiness/report.ts` — shared readiness statuses, report aggregation and stable JSON-safe data shape.
- Create `lib/domain/readiness/http.ts` — pure evaluator for HTTP probe snapshots.
- Create `lib/domain/readiness/database.ts` — pure evaluator for database metadata/catalog snapshots.
- Create `lib/domain/readiness/metrics.ts` — maps existing product metrics to truthful readiness statuses.
- Create `scripts/production-smoke.ts` — unauthenticated HTTP transport only.
- Create `scripts/production-db-readiness.ts` — read-only PostgreSQL transport only.
- Modify `package.json` — add operator commands only; no dependency changes expected.
- Modify `.env.example` — document operator-only environment variables as commented examples and explicitly bar them from Vercel.
- Modify `README.md`, `docs/ops/DEPLOYMENT.md`, `docs/ops/LAUNCH_READINESS.md` — synchronize deployed/machine-verified/human-pending states.
- Create `tests/unit/readiness-report.test.ts` — report semantics.
- Create `tests/unit/production-smoke.test.ts` — HTTP evaluator and transport contract fixtures.
- Create `tests/unit/database-readiness.test.ts` — database evaluator and read-only SQL contract.
- Create `tests/unit/readiness-metrics.test.ts` — empty-data/readiness semantics.
- Create `tests/unit/readiness-docs-contract.test.ts` — catches future deployment-status drift.

---

### Task 1: Shared readiness report domain

**Files:**
- Create: `lib/domain/readiness/report.ts`
- Create: `tests/unit/readiness-report.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const READINESS_STATUSES = [
    'pass',
    'fail',
    'pending_human',
    'not_applicable',
    'insufficient_data',
  ] as const;
  export type ReadinessStatus = (typeof READINESS_STATUSES)[number];

  export interface ReadinessCheck {
    id: string;
    label: string;
    status: ReadinessStatus;
    detail?: string;
  }

  export interface ReadinessReport {
    generatedAt: string;
    checks: ReadinessCheck[];
    counts: Record<ReadinessStatus, number>;
    machineReady: boolean;
  }

  export function buildReadinessReport(
    checks: readonly ReadinessCheck[],
    generatedAt: string,
  ): ReadinessReport;
  ```
- `machineReady` means “no machine-verifiable failure exists”; it is `false` only when at least one check is `fail`. It must not hide pending/insufficient items; those remain in `checks` and `counts`.

- [ ] **Step 1: Write the failing report-semantics tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildReadinessReport } from '@/lib/domain/readiness/report';

const GENERATED_AT = '2026-09-05T00:00:00.000Z';

describe('readiness report', () => {
  it('preserves pending and insufficient states instead of upgrading them to pass', () => {
    const report = buildReadinessReport(
      [
        { id: 'http', label: 'HTTP smoke', status: 'pass' },
        { id: 'smtp', label: 'SMTP round-trip', status: 'pending_human' },
        { id: 'retention', label: 'Retention', status: 'insufficient_data' },
      ],
      GENERATED_AT,
    );

    expect(report.checks.map((check) => check.status)).toEqual([
      'pass',
      'pending_human',
      'insufficient_data',
    ]);
    expect(report.counts.pending_human).toBe(1);
    expect(report.counts.insufficient_data).toBe(1);
    expect(report.machineReady).toBe(true);
  });

  it('marks the report not machine-ready when any machine check fails', () => {
    const report = buildReadinessReport(
      [{ id: 'headers', label: 'Security headers', status: 'fail' }],
      GENERATED_AT,
    );
    expect(report.machineReady).toBe(false);
    expect(report.counts.fail).toBe(1);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:
```bash
pnpm exec vitest run --project unit tests/unit/readiness-report.test.ts
```
Expected: FAIL because `@/lib/domain/readiness/report` does not exist.

- [ ] **Step 3: Implement the minimal pure report domain**

```ts
export const READINESS_STATUSES = [
  'pass',
  'fail',
  'pending_human',
  'not_applicable',
  'insufficient_data',
] as const;

export type ReadinessStatus = (typeof READINESS_STATUSES)[number];

export interface ReadinessCheck {
  id: string;
  label: string;
  status: ReadinessStatus;
  detail?: string;
}

export interface ReadinessReport {
  generatedAt: string;
  checks: ReadinessCheck[];
  counts: Record<ReadinessStatus, number>;
  machineReady: boolean;
}

export function buildReadinessReport(
  checks: readonly ReadinessCheck[],
  generatedAt: string,
): ReadinessReport {
  const counts = Object.fromEntries(READINESS_STATUSES.map((status) => [status, 0])) as Record<
    ReadinessStatus,
    number
  >;
  for (const check of checks) counts[check.status] += 1;

  return {
    generatedAt,
    checks: [...checks],
    counts,
    machineReady: counts.fail === 0,
  };
}
```

- [ ] **Step 4: Run focused test and full unit suite**

Run:
```bash
pnpm exec vitest run --project unit tests/unit/readiness-report.test.ts
pnpm test:unit
```
Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add lib/domain/readiness/report.ts tests/unit/readiness-report.test.ts
git commit -m "feat: add readiness report domain"
```

---

### Task 2: Production HTTP smoke evaluator and operator script

**Files:**
- Create: `lib/domain/readiness/http.ts`
- Create: `scripts/production-smoke.ts`
- Create: `tests/unit/production-smoke.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ReadinessCheck`, `buildReadinessReport` from Task 1; `buildContentSecurityPolicy` and `SECURITY_HEADERS` already exist under `lib/security/csp.ts` and are used only by the script/test adapter, not imported into the pure readiness module.
- Produces:
  ```ts
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

  export function evaluateProductionHttp(
    baseUrl: string,
    probes: readonly HttpProbeResult[],
    expectations: HttpExpectations,
  ): ReadinessCheck[];
  ```
- Required probe paths are exactly `/`, `/login`, `/dashboard`, `/play`, `/settings`.
- Protected route redirects may use `301`, `302`, `303`, `307` or `308`, but `Location` must resolve to the same origin and pathname `/login`.
- Protected route cache-control must contain both `private` and `no-store` when present on the redirect response or terminal login response; implementation probes redirects manually rather than forwarding cookies.

- [ ] **Step 1: Write failing evaluator tests for happy path and failure modes**

Add fixtures that assert all of these in `tests/unit/production-smoke.test.ts`:

```ts
const expectedHeaders = {
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
};

it('passes the expected production surface', () => {
  const checks = evaluateProductionHttp(BASE, goodProbes(), {
    expectedCsp: "default-src 'self'; script-src 'self' 'unsafe-inline'",
    expectedHeaders,
  });
  expect(checks.every((check) => check.status === 'pass')).toBe(true);
});

it('fails when a protected route returns 200', () => {
  const probes = goodProbes().map((probe) =>
    probe.path === '/dashboard' ? { ...probe, status: 200, location: null } : probe,
  );
  expect(checkById(evaluateProductionHttp(BASE, probes, expectations), 'protected-redirects').status)
    .toBe('fail');
});

it('fails a cross-origin redirect', () => {
  const probes = goodProbes().map((probe) =>
    probe.path === '/settings'
      ? { ...probe, location: 'https://evil.example/login' }
      : probe,
  );
  expect(checkById(evaluateProductionHttp(BASE, probes, expectations), 'protected-redirects').status)
    .toBe('fail');
});

it('fails missing security headers and timeout/network errors', () => {
  // One assertion per missing CSP/HSTS/frame/referrer header plus timeout/network fixture.
});
```

Also add a contract test that a sanitized network failure detail never contains a secret query string from an input such as `https://example.test/?token=secret-value`.

- [ ] **Step 2: Run focused test and confirm RED**

Run:
```bash
pnpm exec vitest run --project unit tests/unit/production-smoke.test.ts
```
Expected: FAIL because HTTP readiness evaluator/script do not exist.

- [ ] **Step 3: Implement the pure HTTP evaluator**

Implementation rules:
- Index probes by exact path and fail if any required probe is missing.
- Check `/` and `/login` status are in `200..399` with no transport error.
- For every probe, compare normalized lowercase headers to expected CSP/HSTS/frame/referrer values and assert `x-powered-by` is absent.
- For protected paths, require an allowed redirect status and same-origin `/login` target.
- Return small `ReadinessCheck` objects with sanitized details; do not include the full base URL when it contains query parameters.

- [ ] **Step 4: Implement the HTTP transport script**

`scripts/production-smoke.ts` must:

```ts
const BASE_URL = process.env.PRODUCTION_BASE_URL ?? '';
const JSON_MODE = process.argv.includes('--json');
const PATHS = ['/', '/login', '/dashboard', '/play', '/settings'] as const;
const TIMEOUT_MS = 8_000;
```

For each path:
- validate `BASE_URL` is HTTPS before any request;
- call `fetch(url, { method: 'GET', redirect: 'manual', signal })`;
- never send Authorization/cookies;
- capture only status, `location`, and lowercased response headers;
- classify `AbortError` as `timeout`, all other fetch failures as `network` without echoing the raw URL;
- build expectations using `buildContentSecurityPolicy('production', true)` and `SECURITY_HEADERS`;
- call `buildReadinessReport`;
- JSON mode prints only `JSON.stringify(report, null, 2)` to stdout;
- human mode prints one line per check;
- exit non-zero when `report.machineReady` is false.

Add to `package.json`:
```json
"smoke:production": "tsx scripts/production-smoke.ts"
```

- [ ] **Step 5: Run focused and full verification**

Run:
```bash
pnpm exec vitest run --project unit tests/unit/production-smoke.test.ts
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:unit
```
Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add lib/domain/readiness/http.ts scripts/production-smoke.ts tests/unit/production-smoke.test.ts package.json
git commit -m "feat: add production HTTP smoke checks"
```

---

### Task 3: Read-only production database readiness

**Files:**
- Create: `lib/domain/readiness/database.ts`
- Create: `scripts/production-db-readiness.ts`
- Create: `tests/unit/database-readiness.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: shared report types from Task 1; `ALL_SEEDS` from `content/seeds`; `BANDS`, `assessCoverage` from `lib/domain/content/coverage` in the operator adapter when building expected catalog input.
- Produces:
  ```ts
  export interface DatabaseReadinessSnapshot {
    migrationVersions: string[];
    tables: { name: string; rls: boolean; forceRls: boolean }[];
    grants: { grantee: string; table: string; privilege: string }[];
    functions: {
      schema: string;
      name: string;
      securityDefiner: boolean;
      anonExecute: boolean;
      authenticatedExecute: boolean;
    }[];
    bucket: {
      id: string;
      public: boolean;
      fileSizeLimit: number | null;
      allowedMimeTypes: string[] | null;
    } | null;
    catalog: {
      slug: string;
      type: string;
      status: string;
      source: string;
      minAge: number;
      maxAge: number;
      responseMode: string;
    }[];
    counts: { authUsers: number; profiles: number; children: number };
  }

  export interface ExpectedCatalogRow {
    slug: string;
    type: string;
    status: string;
    source: string;
    minAge: number;
    maxAge: number;
    responseMode: string;
    ageBand: 'early' | 'lower_primary' | 'upper_primary' | 'preteen';
  }

  export function evaluateDatabaseReadiness(
    snapshot: DatabaseReadinessSnapshot,
    expectedCatalog: readonly ExpectedCatalogRow[],
  ): ReadinessCheck[];
  ```

Expected database invariants:
- migration versions: `20260826000001`, `20260826000002`, `20260826000003`, `20260826000004`, `20260826000005`, `20260905045000`;
- public tables: `profiles`, `children`, `interests`, `child_interests`, `activity_templates`, `child_type_progress`, `assignments`, `submissions`, `submission_assets`, `assignment_reviews`, `content_reports`, `audit_events`;
- FORCE RLS only required on `submissions`, `submission_assets`, `assignment_reviews`, `content_reports`; all 12 must have RLS enabled;
- `anon` must have no public table privileges;
- private security-definer functions are the six names already asserted by `tests/integration/security-definer-rpc.test.ts`; `authenticated` execute only on `owns_child`, `owns_assignment`, `owns_submission`; `anon` execute on none;
- `submissions` bucket is private, 15 MiB, jpeg/png/webp;
- catalog must match the 60 seed rows on slug/type/status/source/minAge/maxAge/responseMode, contain unique slugs, 15 rows per band and all six types per band.

- [ ] **Step 1: Write failing pure evaluator and SQL-contract tests**

In `tests/unit/database-readiness.test.ts`, construct a complete good snapshot and expected catalog fixture, then assert:

```ts
it('passes the canonical database snapshot', () => {
  expect(evaluateDatabaseReadiness(goodSnapshot(), expectedCatalog()).every(
    (check) => check.status === 'pass',
  )).toBe(true);
});

it('fails when an expected table or migration is missing', () => {
  const snapshot = goodSnapshot();
  snapshot.tables = snapshot.tables.filter((row) => row.name !== 'assignments');
  snapshot.migrationVersions = snapshot.migrationVersions.filter(
    (version) => version !== '20260905045000',
  );
  const checks = evaluateDatabaseReadiness(snapshot, expectedCatalog());
  expect(checkById(checks, 'schema').status).toBe('fail');
  expect(checkById(checks, 'migrations').status).toBe('fail');
});

it('fails an anon grant, public security-definer helper, public storage bucket or catalog drift', () => {
  // Use four independent fixture mutations and assert each named check is fail.
});
```

Add a static contract that imports `READINESS_SELECT_QUERIES` from the operator script and rejects mutation keywords in every query:

```ts
const MUTATION = /\b(insert|update|delete|alter|create|drop|truncate|grant|revoke|call|do)\b/i;
for (const [name, sql] of Object.entries(READINESS_SELECT_QUERIES)) {
  expect(sql, `${name} must stay read-only`).not.toMatch(MUTATION);
}
```

- [ ] **Step 2: Run focused test and confirm RED**

Run:
```bash
pnpm exec vitest run --project unit tests/unit/database-readiness.test.ts
```
Expected: FAIL because database readiness modules do not exist.

- [ ] **Step 3: Implement the pure database evaluator**

Implementation must return named checks for:
- `migrations`
- `schema`
- `rls`
- `grants`
- `security-definer`
- `storage`
- `catalog`
- `launch-context`

`launch-context` is informational and `pass` when counts were successfully read; its detail may report only numeric totals (`authUsers=0, profiles=0, children=0`) and never IDs/emails.

- [ ] **Step 4: Implement the read-only PostgreSQL adapter**

`scripts/production-db-readiness.ts` must export a constant object of SELECT-only statements for testability:

```ts
export const READINESS_SELECT_QUERIES = {
  migrations: `select version from supabase_migrations.schema_migrations order by version`,
  tables: `select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as "forceRls" ...`,
  grants: `select grantee, table_name as table, privilege_type as privilege ...`,
  functions: `select n.nspname as schema, p.proname as name, p.prosecdef as "securityDefiner", ...`,
  bucket: `select id, public, file_size_limit as "fileSizeLimit", allowed_mime_types as "allowedMimeTypes" from storage.buckets where id = 'submissions'`,
  catalog: `select slug, type::text, status::text, source::text, min_age as "minAge", max_age as "maxAge", response_mode::text as "responseMode" from public.activity_templates order by slug`,
  counts: `select (select count(*) from auth.users)::int as "authUsers", (select count(*) from public.profiles)::int as profiles, (select count(*) from public.children)::int as children`,
} as const;
```

Use catalog field names that actually exist in `activity_templates`; verify names against migration `20260826000001_init.sql` while implementing rather than casting around a mismatch.

Transaction lifecycle:
```ts
await db.query('begin transaction read only');
try {
  // SELECT-only snapshots
} finally {
  await db.query('rollback').catch(() => undefined);
  await db.end();
}
```

Before the migration query, check `to_regclass('supabase_migrations.schema_migrations')`; if absent, return a failed `migrations` snapshot/check rather than throwing an unhelpful raw error. Do not attempt to create the table.

Build expected catalog rows from `ALL_SEEDS` by mapping:
- `slug`, `type`, `status`
- `source = seed.provenance.source`
- `minAge = seed.audience.minAge`, `maxAge = seed.audience.maxAge`
- `responseMode = seed.response.mode`
- `ageBand = seed.safety.ageBand`

The script must never print `PRODUCTION_DATABASE_URL` and must sanitize caught errors to a short class/message without connection parameters.

Add to `package.json`:
```json
"readiness:db": "tsx scripts/production-db-readiness.ts"
```

- [ ] **Step 5: Run focused tests, typecheck and security audit**

Run:
```bash
pnpm exec vitest run --project unit tests/unit/database-readiness.test.ts
pnpm typecheck
pnpm lint
pnpm audit:security
pnpm test:unit
```
Expected: PASS.

- [ ] **Step 6: Run the disposable database suite unchanged**

Run with the existing disposable PostgreSQL workflow/environment:
```bash
pnpm test:integration
```
Expected: all existing RLS/schema/storage/security-definer tests PASS. Do not point `TEST_DATABASE_URL` at hosted Supabase.

- [ ] **Step 7: Commit Task 3**

```bash
git add lib/domain/readiness/database.ts scripts/production-db-readiness.ts tests/unit/database-readiness.test.ts package.json
git commit -m "feat: add read-only database readiness checks"
```

---

### Task 4: Truthful readiness mapping for product metrics

**Files:**
- Create: `lib/domain/readiness/metrics.ts`
- Create: `tests/unit/readiness-metrics.test.ts`
- Modify only if needed for output clarity: `scripts/metrics.ts`

**Interfaces:**
- Consumes: `ProductReport` from `lib/domain/metrics/product.ts`; `ReadinessCheck` from Task 1.
- Produces:
  ```ts
  export function metricsReadinessChecks(report: ProductReport): ReadinessCheck[];
  ```
- This task does **not** enforce the proposed 20-family/60%/50% launch thresholds because they remain human-unconfirmed policy decisions.

- [ ] **Step 1: Write the failing empty-data semantics tests**

```ts
import { summariseProduct } from '@/lib/domain/metrics/product';
import { metricsReadinessChecks } from '@/lib/domain/readiness/metrics';

it('distinguishes zero families from zero-percent performance', () => {
  const product = summariseProduct(
    { families: [], children: [], assignments: [] },
    new Date('2026-09-05T00:00:00Z'),
    { early: 15, lower_primary: 15, upper_primary: 15, preteen: 15 },
  );
  const checks = metricsReadinessChecks(product);
  expect(checkById(checks, 'families').status).toBe('insufficient_data');
  expect(checkById(checks, 'completion-rate').status).toBe('insufficient_data');
  expect(checkById(checks, 'week-one-return').status).toBe('insufficient_data');
  expect(product.completionRate).toBeNull();
  expect(product.returnedAfterFirstWeek).toBeNull();
});

it('reports measured rates as facts without applying unconfirmed thresholds', () => {
  // Build a non-empty ProductReport with numeric completion/retention and assert status pass.
});
```

- [ ] **Step 2: Run focused test and confirm RED**

Run:
```bash
pnpm exec vitest run --project unit tests/unit/readiness-metrics.test.ts
```
Expected: FAIL because readiness metrics mapping does not exist.

- [ ] **Step 3: Implement the metrics readiness mapping**

Rules:
- `families`: `insufficient_data` when `familiesTotal === 0`, otherwise `pass`.
- `completion-rate`: `insufficient_data` when `completionRate === null`, otherwise `pass` with a factual percentage detail.
- `week-one-return`: `insufficient_data` when `returnedAfterFirstWeek === null`, otherwise `pass` with factual percentage detail.
- `catalog-pressure`: `pass` with factual `childrenNearingExhaustion` count; do not label a retention threshold pass/fail.
- No child IDs from `report.exhaustion` may enter check details.

- [ ] **Step 4: Keep `scripts/metrics.ts` JSON semantics unchanged unless tests expose ambiguity**

`pnpm metrics --json` must continue returning `null` for absent rates. If text output is changed, preserve the existing Vietnamese `chưa có dữ liệu` wording for null rates.

- [ ] **Step 5: Run metric and unit tests**

Run:
```bash
pnpm exec vitest run --project unit tests/unit/product-metrics.test.ts tests/unit/readiness-metrics.test.ts
pnpm test:unit
```
Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add lib/domain/readiness/metrics.ts tests/unit/readiness-metrics.test.ts scripts/metrics.ts
git commit -m "feat: add launch readiness metric semantics"
```

If `scripts/metrics.ts` did not need a code change, omit it from `git add`.

---

### Task 5: Operator documentation, environment contract and drift tests

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/ops/DEPLOYMENT.md`
- Modify: `docs/ops/LAUNCH_READINESS.md`
- Create: `tests/unit/readiness-docs-contract.test.ts`

**Interfaces:**
- Consumes operator command names from Tasks 2–4.
- Produces documentation that distinguishes implemented, deployed, machine-verified, human-pending and insufficient-data states.

- [ ] **Step 1: Write a failing docs/status contract test**

The test reads files using `readFileSync` and asserts:

```ts
expect(readme).not.toContain('production-ready, not deployed');
expect(deployment).not.toContain('No cloud resource has been created');
expect(readme).toContain('https://nuoidaycon-eight.vercel.app');
expect(deployment).toContain('lpqhxznwdsbvjwglsssr');
expect(deployment).toContain('pnpm smoke:production');
expect(deployment).toContain('pnpm readiness:db');
expect(launch).toContain('pending_human');
expect(launch).toContain('insufficient_data');
expect(launch).toMatch(/SMTP|deliverability/i);
expect(launch).toMatch(/PDPD/i);
expect(launch).toMatch(/A4/i);
```

Also assert `.env.example` contains commented operator variables and explicit “never set in Vercel” wording.

- [ ] **Step 2: Run focused test and confirm RED**

Run:
```bash
pnpm exec vitest run --project unit tests/unit/readiness-docs-contract.test.ts
```
Expected: FAIL because docs still state “not deployed” and operator commands are absent.

- [ ] **Step 3: Update `.env.example` without adding real values**

Add only commented examples:
```dotenv
# Phase 11 operator-only production checks. Supply from a trusted shell.
# NEVER set PRODUCTION_DATABASE_URL or METRICS_DATABASE_URL in Vercel.
# PRODUCTION_BASE_URL="https://nuoidaycon-eight.vercel.app"
# PRODUCTION_DATABASE_URL=""
# METRICS_DATABASE_URL=""
```

- [ ] **Step 4: Update README deployment status truthfully**

State:
- deployed production URL;
- default branch production is Vercel-backed and Supabase project exists;
- 60-item launch catalog is live;
- AI generation is implemented behind parent approval but remains disabled;
- Phase 11 adds read-only operator commands;
- link to deployment/launch-readiness docs for pending human gates.

Do not claim SMTP, legal, real-photo or A4-print verification is complete.

- [ ] **Step 5: Rewrite `DEPLOYMENT.md` from “future deployment” to “live deployment + runbook”**

Preserve useful Auth/SMTP/runbook guidance, but replace stale statements with a state table such as:

```md
| Area | State | Evidence / next gate |
|---|---|---|
| Vercel | deployed | production URL ... |
| Supabase DB/Auth/Storage | deployed | project `lpqhxznwdsbvjwglsssr`, Singapore |
| Catalog | deployed | 60 approved seed activities |
| HTTP security surface | machine-verified | `pnpm smoke:production` |
| DB/RLS/storage metadata | machine-verified | `pnpm readiness:db` |
| SMTP/Auth real email | pending_human | Gmail + non-Gmail round-trip required |
| Real photo/EXIF | pending_human | upload a phone photo and inspect stored object |
| A4 print | pending_human | physical print check |
| PDPD/COPPA/residency | pending_human | human/legal decision |
```

Correct migration wording to include the sixth hardening migration `20260905045000_harden_security_definer_rpc.sql` rather than “0001 through 0005”.

- [ ] **Step 6: Update `LAUNCH_READINESS.md` status vocabulary and baseline section**

Add a “Phase 11 machine checks” section with statuses that can later be filled from live verification. Before the live run, machine checks may be described as operator commands without falsely marking them complete. Preserve human gates unchecked.

Explicitly document:
- `0 families` is a count;
- retention/completion with no denominator are `insufficient_data`, not `0%`;
- proposed success thresholds remain unconfirmed.

- [ ] **Step 7: Run docs contract, format and full unit tests**

Run:
```bash
pnpm exec vitest run --project unit tests/unit/readiness-docs-contract.test.ts
pnpm format:check
pnpm test:unit
```
Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git add .env.example README.md docs/ops/DEPLOYMENT.md docs/ops/LAUNCH_READINESS.md tests/unit/readiness-docs-contract.test.ts
git commit -m "docs: synchronize production launch readiness"
```

---

### Task 6: Full branch verification, live read-only gates, review and merge

**Files:**
- Modify after live results: `docs/ops/LAUNCH_READINESS.md`
- No production database files or migrations.

**Interfaces:**
- Consumes all Phase 11 commands and connected Supabase management tools.
- Produces final machine evidence in the same feature branch/PR while keeping human-only gates pending.

- [ ] **Step 1: Run full local/repository verification on the feature HEAD**

Run:
```bash
pnpm verify
pnpm test:integration
pnpm build
pnpm test:e2e
```
Expected: all PASS against local/disposable resources. If local Playwright/browser availability differs, GitHub Actions remains the authoritative E2E gate, but do not mark the task complete until CI passes.

- [ ] **Step 2: Push feature HEAD and require all GitHub Actions jobs green**

Verify:
- Typecheck/lint/format/provider/security/i18n/unit/seed/launch-catalog job: success;
- Database RLS matrix job: success;
- Build/Playwright job: success;
- Vercel preview status: success.

- [ ] **Step 3: Run live HTTP smoke from the feature branch**

Run:
```bash
PRODUCTION_BASE_URL=https://nuoidaycon-eight.vercel.app pnpm smoke:production --json
```
Expected: all machine HTTP checks `pass`; no production data is created.

If the current execution environment cannot run the branch script directly, reproduce the same GET-only probes with an available HTTP tool and record that the script itself is already fixture-tested; do not invent a successful script run.

- [ ] **Step 4: Run live Supabase database readiness read-only**

Preferred operator command from a trusted environment:
```bash
PRODUCTION_DATABASE_URL=<operator-supplied-connection-string> pnpm readiness:db --json
```
Expected: migration/schema/RLS/grants/security-definer/storage/catalog checks pass; launch counts are factual.

In this ChatGPT session, use the connected Supabase management tool with project `lpqhxznwdsbvjwglsssr` to execute only the same SELECT metadata queries if a raw connection string is unavailable. Do not substitute a write-capable command or expose credentials.

- [ ] **Step 5: Run Supabase Security Advisor read-only**

Use the connected Supabase advisor for project `lpqhxznwdsbvjwglsssr`:
- security advisor must have no unresolved security lint that contradicts launch readiness;
- performance advisor findings, if any, are recorded separately and do not get mislabeled as security pass/fail.

No advisor remediation is applied automatically in this task.

- [ ] **Step 6: Establish the first metrics baseline truthfully**

Preferred:
```bash
METRICS_DATABASE_URL=<operator-supplied-connection-string> pnpm metrics --json
```

If only the connected Supabase SQL tool is available, read the same IDs/timestamps/statuses used by `scripts/metrics.ts`, compute `summariseProduct` semantics, and state that this is an equivalent read-only baseline rather than claiming the CLI command ran.

Expected while production remains empty:
- `familiesTotal = 0`
- `childrenTotal = 0`
- `assignmentsTotal = 0`
- `completionRate = null`
- `returnedAfterFirstWeek = null`

If real data now exists, record the actual aggregate instead; never overwrite production to force the expected empty baseline.

- [ ] **Step 7: Update launch readiness with observed machine evidence**

In `docs/ops/LAUNCH_READINESS.md` record:
- feature-branch CI run identifier/SHA;
- HTTP smoke outcome;
- DB readiness outcome;
- Security Advisor outcome;
- metrics baseline aggregate only;
- human gates still `pending_human`.

Do not commit parent/child IDs, emails, connection strings, signed URLs or other sensitive data.

Run:
```bash
pnpm exec vitest run --project unit tests/unit/readiness-docs-contract.test.ts
pnpm format:check
```
Expected: PASS.

Commit:
```bash
git add docs/ops/LAUNCH_READINESS.md
git commit -m "docs: record Phase 11 readiness verification"
```

- [ ] **Step 8: Re-run full CI on the final feature HEAD**

Push the documentation-evidence commit and require all three CI jobs plus Vercel preview to be green on that exact SHA.

- [ ] **Step 9: Request code review and inspect the complete PR diff**

Review specifically for:
- any DDL/DML or production-write path in readiness scripts;
- any secret/URL logging;
- any live-production dependency in CI;
- any human gate incorrectly marked pass;
- any AI enablement;
- any mismatch between documented and actual migration/catalog state.

Fix review findings with a new RED test where behavioral, rerun all affected gates, and only then merge.

- [ ] **Step 10: Merge with expected-head protection**

Open/merge the PR into `claude/parent-learning-app-spec-andbvx` only when the final feature HEAD is mergeable and all gates are green. Use the expected head SHA if the merge API supports it so a moving branch cannot be merged accidentally.

- [ ] **Step 11: Verify the merge commit**

Confirm:
- default branch points at the merge commit;
- post-merge GitHub CI succeeds on the merge commit;
- Vercel production status for the merge commit is `success` / “Deployment has completed”.

- [ ] **Step 12: Re-run post-merge production HTTP smoke**

Run against the newly deployed production:
```bash
PRODUCTION_BASE_URL=https://nuoidaycon-eight.vercel.app pnpm smoke:production --json
```
Expected: same all-pass machine HTTP surface as before merge.

If the post-merge result differs, Phase 11 remains incomplete: diagnose/fix through another reviewed branch rather than editing production data or documentation directly on the default branch.
