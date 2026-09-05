import type { ReadinessCheck } from '@/lib/domain/readiness/report';

export interface DatabaseReadinessSnapshot {
  migrationTableExists: boolean;
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

const EXPECTED_MIGRATIONS = [
  '20260826000001',
  '20260826000002',
  '20260826000003',
  '20260826000004',
  '20260826000005',
  '20260905045000',
] as const;

const EXPECTED_TABLES = [
  'profiles',
  'children',
  'interests',
  'child_interests',
  'activity_templates',
  'child_type_progress',
  'assignments',
  'submissions',
  'submission_assets',
  'assignment_reviews',
  'content_reports',
  'audit_events',
] as const;

const FORCE_RLS_TABLES = [
  'submissions',
  'submission_assets',
  'assignment_reviews',
  'content_reports',
] as const;

const PRIVILEGED_FUNCTIONS = [
  'assert_template_assignable',
  'handle_new_user',
  'init_child_type_progress',
  'owns_assignment',
  'owns_child',
  'owns_submission',
] as const;

const AUTHENTICATED_RLS_HELPERS = new Set(['owns_assignment', 'owns_child', 'owns_submission']);

const ALLOWED_AUTHENTICATED_GRANTS: Record<string, ReadonlySet<string>> = {
  profiles: new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
  children: new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
  interests: new Set(['SELECT']),
  child_interests: new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
  activity_templates: new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
  child_type_progress: new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
  assignments: new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
  submissions: new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
  submission_assets: new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
  assignment_reviews: new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
  content_reports: new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE']),
  audit_events: new Set(['SELECT', 'INSERT']),
  ai_generation_events: new Set(['SELECT', 'INSERT']),
};

const EXPECTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const EXPECTED_TYPES = [
  'handwriting',
  'drawing_prompt',
  'story_comprehension',
  'story_summary',
  'reflection',
  'situation_judgment',
] as const;
const EXPECTED_BANDS = ['early', 'lower_primary', 'upper_primary', 'preteen'] as const;

function result(id: string, label: string, ok: boolean, detail: string): ReadinessCheck {
  return { id, label, status: ok ? 'pass' : 'fail', detail };
}

function sameSet(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  const actualSet = new Set(actual);
  return actualSet.size === expected.length && expected.every((item) => actualSet.has(item));
}

function catalogKey(row: Omit<ExpectedCatalogRow, 'ageBand'>): string {
  return [
    row.slug,
    row.type,
    row.status,
    row.source,
    row.minAge,
    row.maxAge,
    row.responseMode,
  ].join('\u0000');
}

function evaluateMigrations(snapshot: DatabaseReadinessSnapshot): ReadinessCheck {
  const missing = EXPECTED_MIGRATIONS.filter(
    (version) => !snapshot.migrationVersions.includes(version),
  );
  const ok = snapshot.migrationTableExists && missing.length === 0;
  return result(
    'migrations',
    'Migration history',
    ok,
    !snapshot.migrationTableExists
      ? 'supabase_migrations.schema_migrations is unavailable'
      : missing.length === 0
        ? `${EXPECTED_MIGRATIONS.length} expected migrations present`
        : `missing ${missing.join(', ')}`,
  );
}

function evaluateSchema(snapshot: DatabaseReadinessSnapshot): ReadinessCheck {
  const names = new Set(snapshot.tables.map((table) => table.name));
  const missing = EXPECTED_TABLES.filter((name) => !names.has(name));
  return result(
    'schema',
    'Required public tables',
    missing.length === 0,
    missing.length === 0 ? `${EXPECTED_TABLES.length} required tables present` : `missing ${missing.join(', ')}`,
  );
}

function evaluateRls(snapshot: DatabaseReadinessSnapshot): ReadinessCheck {
  const tableByName = new Map(snapshot.tables.map((table) => [table.name, table]));
  const withoutRls = EXPECTED_TABLES.filter((name) => !tableByName.get(name)?.rls);
  const withoutForce = FORCE_RLS_TABLES.filter((name) => !tableByName.get(name)?.forceRls);
  const ok = withoutRls.length === 0 && withoutForce.length === 0;
  const detail = ok
    ? `RLS enabled on ${EXPECTED_TABLES.length} tables; required FORCE RLS present`
    : [
        withoutRls.length > 0 ? `RLS missing: ${withoutRls.join(', ')}` : '',
        withoutForce.length > 0 ? `FORCE RLS missing: ${withoutForce.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('; ');
  return result('rls', 'Row Level Security', ok, detail);
}

function evaluateGrants(snapshot: DatabaseReadinessSnapshot): ReadinessCheck {
  const anon = snapshot.grants.filter((grant) => grant.grantee === 'anon');
  const unsafeAuthenticated = snapshot.grants.filter((grant) => {
    if (grant.grantee !== 'authenticated') return false;
    return !ALLOWED_AUTHENTICATED_GRANTS[grant.table]?.has(grant.privilege.toUpperCase());
  });
  const ok = anon.length === 0 && unsafeAuthenticated.length === 0;
  return result(
    'grants',
    'Client table grants',
    ok,
    ok
      ? 'anon has no public table grants; authenticated grants are scoped'
      : `anon=${anon.length}, unsafeAuthenticated=${unsafeAuthenticated.length}`,
  );
}

function evaluateFunctions(snapshot: DatabaseReadinessSnapshot): ReadinessCheck {
  const matching = snapshot.functions.filter((fn) =>
    PRIVILEGED_FUNCTIONS.includes(fn.name as (typeof PRIVILEGED_FUNCTIONS)[number]),
  );
  const exposed = matching.filter((fn) => fn.schema === 'public' && fn.securityDefiner);
  const privateByName = new Map(
    matching.filter((fn) => fn.schema === 'private' && fn.securityDefiner).map((fn) => [fn.name, fn]),
  );
  const missing = PRIVILEGED_FUNCTIONS.filter((name) => !privateByName.has(name));
  const wrongPrivileges = PRIVILEGED_FUNCTIONS.filter((name) => {
    const fn = privateByName.get(name);
    if (!fn) return false;
    return fn.anonExecute || fn.authenticatedExecute !== AUTHENTICATED_RLS_HELPERS.has(name);
  });
  const ok = exposed.length === 0 && missing.length === 0 && wrongPrivileges.length === 0;
  return result(
    'security-definer',
    'Privileged database helpers',
    ok,
    ok
      ? 'six privileged helpers are private with minimum EXECUTE grants'
      : `public=${exposed.length}, missing=${missing.length}, wrongPrivileges=${wrongPrivileges.length}`,
  );
}

function evaluateStorage(snapshot: DatabaseReadinessSnapshot): ReadinessCheck {
  const bucket = snapshot.bucket;
  const ok =
    bucket !== null &&
    bucket.id === 'submissions' &&
    bucket.public === false &&
    bucket.fileSizeLimit === 15 * 1024 * 1024 &&
    bucket.allowedMimeTypes !== null &&
    sameSet(bucket.allowedMimeTypes, EXPECTED_MIME_TYPES);
  return result(
    'storage',
    'Submission Storage bucket',
    ok,
    ok ? 'private, 15 MiB, jpeg/png/webp' : 'submissions bucket configuration drifted',
  );
}

function evaluateCatalog(
  snapshot: DatabaseReadinessSnapshot,
  expectedCatalog: readonly ExpectedCatalogRow[],
): ReadinessCheck {
  const actualKeys = snapshot.catalog.map(catalogKey).sort();
  const expectedKeys = expectedCatalog
    .map(({ ageBand: _ageBand, ...row }) => catalogKey(row))
    .sort();
  const exactRows =
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index]);
  const uniqueSlugs = new Set(snapshot.catalog.map((row) => row.slug)).size === snapshot.catalog.length;

  const expectedCoverage = EXPECTED_BANDS.every((band) => {
    const rows = expectedCatalog.filter((row) => row.ageBand === band);
    return rows.length === 15 && new Set(rows.map((row) => row.type)).size === EXPECTED_TYPES.length;
  });

  const ok =
    exactRows &&
    uniqueSlugs &&
    expectedCatalog.length === 60 &&
    expectedCoverage &&
    snapshot.catalog.every((row) => row.status === 'approved' && row.source === 'seed');

  return result(
    'catalog',
    'Launch activity catalog',
    ok,
    ok ? '60 approved seed activities match the repository catalog' : 'live seed catalog differs from the canonical 60 activities',
  );
}

export function evaluateDatabaseReadiness(
  snapshot: DatabaseReadinessSnapshot,
  expectedCatalog: readonly ExpectedCatalogRow[],
): ReadinessCheck[] {
  return [
    evaluateMigrations(snapshot),
    evaluateSchema(snapshot),
    evaluateRls(snapshot),
    evaluateGrants(snapshot),
    evaluateFunctions(snapshot),
    evaluateStorage(snapshot),
    evaluateCatalog(snapshot, expectedCatalog),
    {
      id: 'launch-context',
      label: 'Launch data context',
      status: 'pass',
      detail: `authUsers=${snapshot.counts.authUsers}, profiles=${snapshot.counts.profiles}, children=${snapshot.counts.children}`,
    },
  ];
}
