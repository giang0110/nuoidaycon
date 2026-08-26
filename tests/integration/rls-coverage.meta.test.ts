/**
 * Meta-test required by PRODUCT_SPEC.md §11.4.
 *
 * The cross-tenant matrix is only trustworthy if it cannot silently fall behind
 * the schema. This enumerates the live database and fails when a table exists
 * that the matrix does not cover — so adding a table without protecting it
 * breaks the build rather than shipping an open door.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Client } from 'pg';
import { hasDatabase, connectAdmin, applySchema } from './helpers/db';
import { COVERED_TABLES, FORCED_TABLES } from './helpers/tenant-tables';

const describeDb = hasDatabase ? describe : describe.skip;

/**
 * Runs unconditionally. Skipping the database suites is fine on a laptop with
 * no local cluster; it is NOT fine in CI, where a silent skip would look
 * exactly like a pass while the RLS matrix never ran.
 */
describe('database test environment', () => {
  it('has TEST_DATABASE_URL configured when running in CI', () => {
    if (process.env.CI) {
      expect(
        hasDatabase,
        'RUNTIME_DB_VERIFICATION_BLOCKED: TEST_DATABASE_URL is unset in CI, so the ' +
          'cross-tenant RLS matrix did not run. Start a disposable PostgreSQL and set it.',
      ).toBe(true);
    } else {
      expect(true).toBe(true);
    }
  });
});

describeDb('RLS matrix coverage', () => {
  let db: Client;
  let liveTables: string[];

  beforeAll(async () => {
    db = await connectAdmin();
    await applySchema(db);
    const result = await db.query<{ table_name: string }>(
      `select table_name
         from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
        order by table_name`,
    );
    liveTables = result.rows.map((r) => r.table_name);
  }, 60_000);

  afterAll(async () => {
    await db?.end();
  });

  it('covers every table that exists in the database', () => {
    const covered = new Set(COVERED_TABLES.map((t) => t.table));
    const uncovered = liveTables.filter((t) => !covered.has(t));
    expect(
      uncovered,
      `These tables exist but are not in the RLS test matrix. Add them to ` +
        `tests/integration/helpers/tenant-tables.ts AND give them policies ` +
        `before merging (PRODUCT_SPEC.md §11.4).`,
    ).toEqual([]);
  });

  it('does not list tables that no longer exist', () => {
    const live = new Set(liveTables);
    const stale = COVERED_TABLES.map((t) => t.table).filter((t) => !live.has(t));
    expect(stale, 'The matrix references tables that were dropped.').toEqual([]);
  });

  it('matches the specified table model — twelve for the MVP plus the Phase 8 audit', () => {
    expect(liveTables).toHaveLength(13);
    expect(liveTables).not.toContain('households');
    expect(liveTables).not.toContain('household_members');
  });

  it('every table has RLS enabled and at least one policy', async () => {
    const result = await db.query<{ relname: string; relrowsecurity: boolean; policies: string }>(
      `select c.relname, c.relrowsecurity,
              (select count(*) from pg_policies p
                where p.schemaname = 'public' and p.tablename = c.relname) as policies
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`,
    );
    for (const row of result.rows) {
      expect(row.relrowsecurity, `${row.relname}: RLS not enabled`).toBe(true);
      expect(
        Number(row.policies),
        `${row.relname}: no policy — deny-by-default with no way in`,
      ).toBeGreaterThan(0);
    }
  });

  it('FORCE RLS is applied only to the justified tables', async () => {
    const result = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relforcerowsecurity`,
    );
    expect(result.rows.map((r) => r.relname).sort()).toEqual([...FORCED_TABLES].sort());
  });

  it('grants nothing in the public schema to anon', async () => {
    const result = await db.query<{ table_name: string; privilege_type: string }>(
      `select table_name, privilege_type
         from information_schema.role_table_grants
        where grantee = 'anon' and table_schema = 'public'`,
    );
    expect(result.rows, 'anon must hold no privilege on any application table').toEqual([]);
  });

  it('grants no write privilege on the interests lookup', async () => {
    const result = await db.query<{ privilege_type: string }>(
      `select privilege_type from information_schema.role_table_grants
        where grantee = 'authenticated' and table_schema = 'public'
          and table_name = 'interests' and privilege_type <> 'SELECT'`,
    );
    expect(result.rows, 'reference data must be read-only for clients').toEqual([]);
  });

  /**
   * Phase 8 grants DML on activity_templates so parents can own AI drafts.
   * Seed content stays unwritable — every draft policy requires
   * `owner_id = auth.uid() AND source = 'ai'`, and seed rows have a null owner,
   * so the policy fails closed against them. The privilege is broad; the policy
   * is what makes it safe, and rls-matrix proves it at runtime.
   */
  it('gates every catalog write policy on ownership and AI provenance', async () => {
    const result = await db.query<{
      policyname: string;
      qual: string | null;
      with_check: string | null;
    }>(
      `select policyname, qual, with_check from pg_policies
        where schemaname = 'public' and tablename = 'activity_templates'
          and cmd <> 'SELECT'`,
    );
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      const clause = `${row.qual ?? ''} ${row.with_check ?? ''}`;
      expect(clause, `${row.policyname} must check ownership`).toMatch(/owner_id/);
      expect(clause, `${row.policyname} must be limited to AI content`).toMatch(/ai/);
    }
  });

  it('grants no UPDATE or DELETE on the audit trail', async () => {
    const result = await db.query<{ privilege_type: string }>(
      `select privilege_type from information_schema.role_table_grants
        where grantee = 'authenticated' and table_schema = 'public'
          and table_name = 'audit_events'
          and privilege_type in ('UPDATE', 'DELETE')`,
    );
    expect(result.rows, 'audit_events must be append-only').toEqual([]);
  });
});
