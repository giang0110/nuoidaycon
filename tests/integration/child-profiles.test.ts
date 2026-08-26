/**
 * Phase 3 database behaviour: child profiles under a parent account.
 *
 * Exercises the rules through real SQL as the `authenticated` role, so what is
 * asserted is what RLS actually permits — not what the application intends.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import {
  hasDatabase,
  connectAdmin,
  applySchema,
  asParent,
  seedTenant,
  type Tenant,
} from './helpers/db';

const describeDb = hasDatabase ? describe : describe.skip;

describeDb('child profiles', () => {
  let db: Client;
  let A: Tenant;
  let B: Tenant;

  beforeAll(async () => {
    db = await connectAdmin();
    await applySchema(db);
    A = await seedTenant(db, 'p3a');
    B = await seedTenant(db, 'p3b');
  }, 60_000);

  afterAll(async () => {
    await db?.end();
  });

  it('creates six progress rows when a parent adds a child', async () => {
    const r = await asParent(
      db,
      A.parentId,
      `insert into public.children (parent_id, display_name, birth_year, birth_month, grade)
       values ($1, 'Bé Na', 2019, 4, 'grade_1') returning id`,
      [A.parentId],
    );
    expect(r.error).toBeUndefined();
    const childId = (r.rows[0] as { id: string }).id;

    const progress = await asParent(
      db,
      A.parentId,
      'select type from public.child_type_progress where child_id = $1',
      [childId],
    );
    expect(progress.rowCount).toBe(6);
  });

  it('refuses a child created under another parent id', async () => {
    const r = await asParent(
      db,
      A.parentId,
      `insert into public.children (parent_id, display_name, birth_year, birth_month, grade)
       values ($1, 'Chiếm', 2019, 4, 'grade_1')`,
      [B.parentId],
    );
    expect(r.error, 'RLS must reject a child under another parent').toBeDefined();
  });

  it('rejects an out-of-range birth month at the database level', async () => {
    for (const month of [0, 13]) {
      const r = await asParent(
        db,
        A.parentId,
        `insert into public.children (parent_id, display_name, birth_year, birth_month, grade)
         values ($1, 'x', 2019, $2, 'grade_1')`,
        [A.parentId, month],
      );
      expect(r.error?.message).toMatch(/birth_month/);
    }
  });

  it('archives rather than deletes, so history survives', async () => {
    const r = await asParent(
      db,
      A.parentId,
      `update public.children set archived_at = now() where id = $1 returning archived_at`,
      [A.childId],
    );
    expect(r.rowCount).toBe(1);

    const still = await asParent(db, A.parentId, 'select id from public.children where id = $1', [
      A.childId,
    ]);
    expect(still.rowCount, 'the row is archived, not removed').toBe(1);

    const assignments = await asParent(
      db,
      A.parentId,
      'select id from public.assignments where child_id = $1',
      [A.childId],
    );
    expect(assignments.rowCount, 'assigned work survives archiving').toBeGreaterThan(0);

    await db.query('update public.children set archived_at = null where id = $1', [A.childId]);
  });

  it('lets a parent set and clear their child interests', async () => {
    const interests = await asParent(db, A.parentId, 'select id from public.interests limit 3');
    expect(interests.rowCount).toBe(3);
    const ids = interests.rows.map((r) => (r as { id: string }).id);

    for (const id of ids) {
      const r = await asParent(
        db,
        A.parentId,
        'insert into public.child_interests (child_id, interest_id) values ($1, $2) on conflict do nothing',
        [A.childId, id],
      );
      expect(r.error).toBeUndefined();
    }

    const mine = await asParent(
      db,
      A.parentId,
      'select interest_id from public.child_interests where child_id = $1',
      [A.childId],
    );
    expect(mine.rowCount).toBeGreaterThanOrEqual(3);
  });

  it('refuses to attach an interest to another parent child', async () => {
    const interest = await asParent(db, B.parentId, 'select id from public.interests limit 1');
    const id = (interest.rows[0] as { id: string }).id;
    const r = await asParent(
      db,
      B.parentId,
      'insert into public.child_interests (child_id, interest_id) values ($1, $2)',
      [A.childId, id],
    );
    expect(r.error).toBeDefined();
  });

  it('ships the interest vocabulary as global read-only reference data', async () => {
    const read = await asParent(db, A.parentId, 'select count(*)::int as n from public.interests');
    expect((read.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(20);

    const write = await asParent(
      db,
      A.parentId,
      `insert into public.interests (slug, label_vi) values ($1, 'X')`,
      [`forged-${randomUUID().slice(0, 8)}`],
    );
    expect(write.error, 'clients must not write reference data').toBeDefined();
  });

  it('has no age column on children — age is derived, never stored', async () => {
    const r = await db.query(
      `select column_name from information_schema.columns
        where table_schema='public' and table_name='children'`,
    );
    const columns = r.rows.map((row) => (row as { column_name: string }).column_name);
    expect(columns).toContain('birth_year');
    expect(columns).toContain('birth_month');
    expect(columns).not.toContain('age');
    expect(columns.filter((c) => /date_of_birth|birth_date|dob/.test(c))).toEqual([]);
  });
});
