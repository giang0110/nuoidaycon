import { describe, expect, it } from 'vitest';
import {
  evaluateDatabaseReadiness,
  type DatabaseReadinessSnapshot,
  type ExpectedCatalogRow,
} from '@/lib/domain/readiness/database';
import { READINESS_SELECT_QUERIES } from '../../scripts/production-db-readiness';

const MIGRATIONS = [
  '20260826000001',
  '20260826000002',
  '20260826000003',
  '20260826000004',
  '20260826000005',
  '20260905045000',
];

const TABLES = [
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

const FORCE_RLS = new Set([
  'submissions',
  'submission_assets',
  'assignment_reviews',
  'content_reports',
]);

const PRIVATE_FUNCTIONS = [
  'assert_template_assignable',
  'handle_new_user',
  'init_child_type_progress',
  'owns_assignment',
  'owns_child',
  'owns_submission',
] as const;

const AUTHENTICATED_HELPERS = new Set(['owns_assignment', 'owns_child', 'owns_submission']);

const TYPES = [
  'handwriting',
  'drawing_prompt',
  'story_comprehension',
  'story_summary',
  'reflection',
  'situation_judgment',
] as const;

const BANDS = ['early', 'lower_primary', 'upper_primary', 'preteen'] as const;

function expectedCatalog(): ExpectedCatalogRow[] {
  const rows: ExpectedCatalogRow[] = [];
  for (const [bandIndex, ageBand] of BANDS.entries()) {
    for (let index = 0; index < 15; index += 1) {
      const type = TYPES[index % TYPES.length]!;
      rows.push({
        slug: `${ageBand}-${String(index + 1).padStart(2, '0')}`,
        type,
        status: 'approved',
        source: 'seed',
        minAge: [4, 7, 9, 11][bandIndex]!,
        maxAge: [6, 8, 10, 12][bandIndex]!,
        responseMode: type === 'drawing_prompt' ? 'photo' : 'text',
        ageBand,
      });
    }
  }
  return rows;
}

function goodSnapshot(): DatabaseReadinessSnapshot {
  const catalog = expectedCatalog();
  return {
    migrationTableExists: true,
    migrationVersions: [...MIGRATIONS],
    tables: TABLES.map((name) => ({
      name,
      rls: true,
      forceRls: FORCE_RLS.has(name),
    })),
    grants: [
      { grantee: 'authenticated', table: 'profiles', privilege: 'SELECT' },
      { grantee: 'authenticated', table: 'activity_templates', privilege: 'SELECT' },
    ],
    functions: PRIVATE_FUNCTIONS.map((name) => ({
      schema: 'private',
      name,
      securityDefiner: true,
      anonExecute: false,
      authenticatedExecute: AUTHENTICATED_HELPERS.has(name),
    })),
    bucket: {
      id: 'submissions',
      public: false,
      fileSizeLimit: 15 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    },
    catalog,
    counts: { authUsers: 0, profiles: 0, children: 0 },
  };
}

function checkById(checks: ReturnType<typeof evaluateDatabaseReadiness>, id: string) {
  const check = checks.find((item) => item.id === id);
  expect(check, `missing readiness check ${id}`).toBeDefined();
  return check!;
}

describe('database readiness evaluator', () => {
  it('passes the canonical database snapshot', () => {
    const checks = evaluateDatabaseReadiness(goodSnapshot(), expectedCatalog());
    expect(checks.every((check) => check.status === 'pass')).toBe(true);
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

  it('fails closed when migration history is unavailable', () => {
    const snapshot = goodSnapshot();
    snapshot.migrationTableExists = false;
    snapshot.migrationVersions = [];

    expect(
      checkById(evaluateDatabaseReadiness(snapshot, expectedCatalog()), 'migrations').status,
    ).toBe('fail');
  });

  it('fails an anon grant or an exposed privileged security-definer helper', () => {
    const snapshot = goodSnapshot();
    snapshot.grants.push({ grantee: 'anon', table: 'children', privilege: 'SELECT' });
    snapshot.functions.push({
      schema: 'public',
      name: 'owns_child',
      securityDefiner: true,
      anonExecute: true,
      authenticatedExecute: true,
    });

    const checks = evaluateDatabaseReadiness(snapshot, expectedCatalog());
    expect(checkById(checks, 'grants').status).toBe('fail');
    expect(checkById(checks, 'security-definer').status).toBe('fail');
  });

  it('fails when RLS, storage privacy or catalog content drifts', () => {
    const snapshot = goodSnapshot();
    snapshot.tables.find((row) => row.name === 'children')!.rls = false;
    snapshot.bucket = { ...snapshot.bucket!, public: true };
    snapshot.catalog[0] = { ...snapshot.catalog[0]!, status: 'archived' };

    const checks = evaluateDatabaseReadiness(snapshot, expectedCatalog());
    expect(checkById(checks, 'rls').status).toBe('fail');
    expect(checkById(checks, 'storage').status).toBe('fail');
    expect(checkById(checks, 'catalog').status).toBe('fail');
  });

  it('treats zero launch-context counts as measured facts, not a failure', () => {
    const check = checkById(
      evaluateDatabaseReadiness(goodSnapshot(), expectedCatalog()),
      'launch-context',
    );
    expect(check.status).toBe('pass');
    expect(check.detail).toBe('authUsers=0, profiles=0, children=0');
  });
});

describe('database readiness SQL contract', () => {
  it('contains only read-only SELECT statements', () => {
    const mutation = /\b(insert|update|delete|alter|create|drop|truncate|grant|revoke|call|do)\b/i;
    for (const [name, sql] of Object.entries(READINESS_SELECT_QUERIES)) {
      expect(sql, `${name} must stay read-only`).not.toMatch(mutation);
      expect(sql.trim().toLowerCase(), `${name} must be a SELECT`).toMatch(/^(select|with)\b/);
    }
  });
});
