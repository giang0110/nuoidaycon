/**
 * The database half of the submission-retry fix.
 *
 * tests/unit/submit-flow.test.ts pins the ORDERING rules against in-memory
 * ports. This file pins the statement the fix depends on — INSERT ... ON
 * CONFLICT (assignment_id) DO UPDATE — as the `authenticated` role, with RLS
 * and FORCE RLS switched on exactly as they are in production.
 *
 * That matters because the upsert only works if the `submissions_update`
 * policy admits it. A get-or-create that quietly needed the service-role key
 * would violate decision A3.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Client } from 'pg';
import { hasDatabase, connectAdmin, applySchema, asParent, seedTenant } from './helpers/db';

const describeDb = hasDatabase ? describe : describe.skip;

/** The upsert the repository issues, written out as the SQL it becomes. */
const UPSERT = `insert into public.submissions (assignment_id, answers, auto_score)
                values ($1, $2::jsonb, $3::jsonb)
                on conflict (assignment_id) do update
                  set answers = excluded.answers, auto_score = excluded.auto_score
                returning id, answers, auto_score, submitted_at`;

describeDb('submission upsert is idempotent per assignment', () => {
  let db: Client;

  beforeAll(async () => {
    db = await connectAdmin();
    await applySchema(db);
  }, 60_000);

  afterAll(async () => {
    await db?.end();
  });

  /** A tenant whose assignment has no submission yet. */
  async function freshAssignment(label: string) {
    const tenant = await seedTenant(db, label);
    const assignment = await db.query<{ id: string }>(
      `insert into public.assignments
         (child_id, template_id, assigned_by, difficulty_at_assignment, content_snapshot)
       values ($1, $2, $3, 2, '{"title":"snapshot","schemaVersion":1}'::jsonb)
       returning id`,
      [tenant.childId, tenant.templateId, tenant.parentId],
    );
    return { tenant, assignmentId: assignment.rows[0]!.id };
  }

  it('inserts on the first call and updates on the second', async () => {
    const { tenant, assignmentId } = await freshAssignment('idem-1');

    const first = await asParent(db, tenant.parentId, UPSERT, [
      assignmentId,
      JSON.stringify({ text: { q1: 'lần đầu' }, choice: {} }),
      null,
    ]);
    expect(first.error).toBeUndefined();
    expect(first.rowCount).toBe(1);

    const second = await asParent(db, tenant.parentId, UPSERT, [
      assignmentId,
      JSON.stringify({ text: { q1: 'lần hai' }, choice: {} }),
      JSON.stringify({ correct: 1, total: 1, perQuestion: { q1: true } }),
    ]);

    // The bug was that this raised 23505.
    expect(second.error).toBeUndefined();
    expect(second.rows[0]!.id).toBe(first.rows[0]!.id);

    const rows = await db.query('select id from public.submissions where assignment_id = $1', [
      assignmentId,
    ]);
    expect(rows.rowCount).toBe(1);
  });

  it('refreshes the answers and the score on conflict', async () => {
    const { tenant, assignmentId } = await freshAssignment('idem-2');

    await asParent(db, tenant.parentId, UPSERT, [
      assignmentId,
      JSON.stringify({ text: { q1: 'nháp' }, choice: {} }),
      null,
    ]);
    const after = await asParent(db, tenant.parentId, UPSERT, [
      assignmentId,
      JSON.stringify({ text: { q1: 'bài đã sửa' }, choice: {} }),
      JSON.stringify({ correct: 2, total: 2, perQuestion: {} }),
    ]);

    expect(after.rows[0]!.answers).toMatchObject({ text: { q1: 'bài đã sửa' } });
    expect(after.rows[0]!.auto_score).toMatchObject({ correct: 2, total: 2 });
  });

  it('keeps the original submitted_at across a retry', async () => {
    const { tenant, assignmentId } = await freshAssignment('idem-3');

    const first = await asParent(db, tenant.parentId, UPSERT, [
      assignmentId,
      JSON.stringify({ text: {}, choice: {} }),
      null,
    ]);
    const second = await asParent(db, tenant.parentId, UPSERT, [
      assignmentId,
      JSON.stringify({ text: { q1: 'thêm' }, choice: {} }),
      null,
    ]);

    // submitted_at records when the child finished, not when the upload
    // finally went through, so the payload must not touch it.
    expect(second.rows[0]!.submitted_at).toEqual(first.rows[0]!.submitted_at);
  });

  it('works as `authenticated`, so no service-role key is needed (A3)', async () => {
    const { tenant, assignmentId } = await freshAssignment('idem-4');

    // A DO UPDATE needs the UPDATE policy to admit the row; if it did not, this
    // would fail and the fix would have quietly required elevated credentials.
    await asParent(db, tenant.parentId, UPSERT, [
      assignmentId,
      JSON.stringify({ text: {}, choice: {} }),
      null,
    ]);
    const retry = await asParent(db, tenant.parentId, UPSERT, [
      assignmentId,
      JSON.stringify({ text: {}, choice: {} }),
      null,
    ]);

    expect(retry.error).toBeUndefined();
  });

  it('still refuses another parent, conflict or not', async () => {
    const { assignmentId } = await freshAssignment('idem-5');
    const intruder = await seedTenant(db, 'idem-intruder');

    const first = await asParent(db, intruder.parentId, UPSERT, [
      assignmentId,
      JSON.stringify({ text: { q1: 'không phải con tôi' }, choice: {} }),
      null,
    ]);
    // WITH CHECK on submissions_insert rejects the row outright.
    expect(first.error).toBeDefined();

    const rows = await db.query('select id from public.submissions where assignment_id = $1', [
      assignmentId,
    ]);
    expect(rows.rowCount).toBe(0);
  });

  it('does not let a conflicting upsert overwrite another parent’s submission', async () => {
    const victim = await seedTenant(db, 'idem-victim');
    const intruder = await seedTenant(db, 'idem-thief');

    // victim.assignmentId already carries a submission from seedTenant.
    const attack = await asParent(db, intruder.parentId, UPSERT, [
      victim.assignmentId,
      JSON.stringify({ text: { q1: 'đã bị sửa' }, choice: {} }),
      null,
    ]);
    expect(attack.error).toBeDefined();

    const stored = await db.query<{ answers: Record<string, unknown> }>(
      'select answers from public.submissions where assignment_id = $1',
      [victim.assignmentId],
    );
    expect(JSON.stringify(stored.rows[0]!.answers)).not.toContain('đã bị sửa');
  });
});

describeDb('submission_assets replacement leaves no duplicates', () => {
  let db: Client;

  beforeAll(async () => {
    db = await connectAdmin();
    await applySchema(db);
  }, 60_000);

  afterAll(async () => {
    await db?.end();
  });

  /**
   * There is deliberately no unique index on (submission_id, storage_path) —
   * see the report. This pins the application-level contract instead: a
   * delete-then-insert for one submission converges on exactly the rows the
   * request carried, however many times it runs.
   */
  it('converges on one row per photo when replayed', async () => {
    const tenant = await seedTenant(db, 'assets-replace');
    const path = `${tenant.parentId}/${tenant.childId}/${tenant.submissionId}/0.jpg`;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const del = await asParent(
        db,
        tenant.parentId,
        'delete from public.submission_assets where submission_id = $1',
        [tenant.submissionId],
      );
      expect(del.error).toBeUndefined();

      const ins = await asParent(
        db,
        tenant.parentId,
        `insert into public.submission_assets (submission_id, storage_path, mime_type, size_bytes)
         values ($1, $2, 'image/jpeg', 20480)`,
        [tenant.submissionId, path],
      );
      expect(ins.error).toBeUndefined();
    }

    const rows = await db.query(
      'select id from public.submission_assets where submission_id = $1',
      [tenant.submissionId],
    );
    expect(rows.rowCount).toBe(1);
  });

  it('shows what a blind re-insert would have done', async () => {
    const tenant = await seedTenant(db, 'assets-blind');
    const path = `${tenant.parentId}/${tenant.childId}/${tenant.submissionId}/0.jpg`;

    // The old code path: insert without clearing first. Recorded here so the
    // absence of a database constraint is a stated fact rather than an
    // assumption — this is exactly why replaceAssets must delete first.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const ins = await asParent(
        db,
        tenant.parentId,
        `insert into public.submission_assets (submission_id, storage_path, mime_type, size_bytes)
         values ($1, $2, 'image/jpeg', 20480)`,
        [tenant.submissionId, path],
      );
      expect(ins.error).toBeUndefined();
    }

    const rows = await db.query(
      'select id from public.submission_assets where submission_id = $1 and storage_path = $2',
      [tenant.submissionId, path],
    );
    expect(rows.rowCount).toBe(2);
  });
});
