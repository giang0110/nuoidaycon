/**
 * Security regression: privileged helper/trigger functions must not be exposed
 * through the public Data API schema.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Client } from 'pg';
import { hasDatabase, connectAdmin, applySchema } from './helpers/db';

const describeDb = hasDatabase ? describe : describe.skip;

const PRIVILEGED_FUNCTIONS = [
  'assert_template_assignable',
  'handle_new_user',
  'init_child_type_progress',
  'owns_assignment',
  'owns_child',
  'owns_submission',
] as const;

const RLS_HELPERS = new Set(['owns_assignment', 'owns_child', 'owns_submission']);

describeDb('security definer RPC hardening', () => {
  let db: Client;

  beforeAll(async () => {
    db = await connectAdmin();
    await applySchema(db);
  }, 60_000);

  afterAll(async () => {
    await db?.end();
  });

  it('keeps privileged functions out of the public API schema', async () => {
    const result = await db.query<{ proname: string }>(
      `select p.proname
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.prosecdef
          and p.proname = any($1::text[])
        order by p.proname`,
      [PRIVILEGED_FUNCTIONS],
    );

    expect(result.rows).toEqual([]);
  });

  it('grants only the RLS helpers to authenticated and nothing to anon', async () => {
    const result = await db.query<{
      proname: string;
      anon_execute: boolean;
      authenticated_execute: boolean;
    }>(
      `select p.proname,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private'
          and p.prosecdef
          and p.proname = any($1::text[])
        order by p.proname`,
      [PRIVILEGED_FUNCTIONS],
    );

    expect(result.rows).toHaveLength(PRIVILEGED_FUNCTIONS.length);

    for (const row of result.rows) {
      expect(row.anon_execute, `${row.proname} must never be executable by anon`).toBe(false);
      expect(
        row.authenticated_execute,
        `${row.proname} authenticated EXECUTE privilege is wrong`,
      ).toBe(RLS_HELPERS.has(row.proname));
    }
  });
});
