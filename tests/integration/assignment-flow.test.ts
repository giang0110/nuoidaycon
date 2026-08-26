/**
 * Phase 5: assignment lifecycle and submissions, exercised through real SQL as
 * the `authenticated` role.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Client } from 'pg';
import {
  hasDatabase,
  connectAdmin,
  applySchema,
  asParent,
  seedTenant,
  type Tenant,
} from './helpers/db';
import { activitySchema } from '@/lib/domain/activity/schema';
import { validateActivity } from '@/lib/domain/activity/validate';
import { toChildView } from '@/lib/domain/activity/child-view';
import { autoScore } from '@/lib/domain/activity/submission';
import { comprehensionFixture } from '@/tests/fixtures/activities';

const describeDb = hasDatabase ? describe : describe.skip;

describeDb('assignment lifecycle', () => {
  let db: Client;
  let A: Tenant;
  let B: Tenant;

  beforeAll(async () => {
    db = await connectAdmin();
    await applySchema(db);
    A = await seedTenant(db, 'p5a');
    B = await seedTenant(db, 'p5b');
  }, 60_000);

  afterAll(async () => {
    await db?.end();
  });

  /**
   * Insert an assignment carrying a specific snapshot.
   *
   * Written this way because the snapshot is immutable on UPDATE — the trigger
   * refuses to let a test do what production code cannot.
   */
  async function assignmentWithSnapshot(tenant: Tenant, snapshot: unknown): Promise<string> {
    const r = await db.query<{ id: string }>(
      `insert into public.assignments
         (child_id, template_id, assigned_by, difficulty_at_assignment, content_snapshot)
       values ($1, $2, $3, 2, $4) returning id`,
      [tenant.childId, tenant.templateId, tenant.parentId, JSON.stringify(snapshot)],
    );
    return r.rows[0]!.id;
  }

  it('stores a snapshot that survives editing the source template', async () => {
    const before = await asParent(
      db,
      A.parentId,
      'select content_snapshot from public.assignments where id = $1',
      [A.assignmentId],
    );

    await db.query(
      `update public.activity_templates
          set title = 'Đã đổi tiêu đề', payload = '{"changed":true}'::jsonb, version = version + 1
        where id = $1`,
      [A.templateId],
    );

    const after = await asParent(
      db,
      A.parentId,
      'select content_snapshot from public.assignments where id = $1',
      [A.assignmentId],
    );

    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('refuses to rewrite a snapshot even as the owner', async () => {
    await expect(
      db.query(`update public.assignments set content_snapshot = '{"x":1}'::jsonb where id = $1`, [
        A.assignmentId,
      ]),
    ).rejects.toThrow(/immutable/i);
  });

  it('lets the lifecycle advance without touching the snapshot', async () => {
    const r = await asParent(
      db,
      A.parentId,
      `update public.assignments set status = 'in_progress', started_at = now()
        where id = $1 returning status`,
      [A.assignmentId],
    );
    expect(r.rowCount).toBe(1);
  });

  it('refuses an assignment attributed to another parent', async () => {
    const r = await asParent(
      db,
      B.parentId,
      `insert into public.assignments
         (child_id, template_id, assigned_by, difficulty_at_assignment, content_snapshot)
       values ($1, $2, $3, 1, '{"t":1}'::jsonb)`,
      [B.childId, B.templateId, A.parentId],
    );
    expect(r.error, 'assigned_by must be the acting parent').toBeDefined();
  });

  it('scores a real submission server-side against the stored snapshot', async () => {
    const tenant = await seedTenant(db, 'p5-score');
    const activity = activitySchema.parse(comprehensionFixture);
    const assignmentId = await assignmentWithSnapshot(tenant, activity);

    const stored = await db.query<{ content_snapshot: unknown }>(
      'select content_snapshot from public.assignments where id = $1',
      [assignmentId],
    );
    const result = validateActivity(stored.rows[0]!.content_snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const score = autoScore(result.activity, { text: {}, choice: { q1: 'a' } });
    expect(score).toEqual({ correct: 1, total: 1, perQuestion: { q1: true } });
  });

  it('never sends an answer key to the child view of a stored snapshot', async () => {
    const tenant = await seedTenant(db, 'p5-leak');
    const activity = activitySchema.parse(comprehensionFixture);
    const assignmentId = await assignmentWithSnapshot(tenant, activity);

    const stored = await db.query<{ content_snapshot: unknown }>(
      'select content_snapshot from public.assignments where id = $1',
      [assignmentId],
    );

    // The stored row DOES contain the key — that is correct, the parent and the
    // scorer need it.
    expect(JSON.stringify(stored.rows[0]!.content_snapshot)).toContain('answerKey');

    // What the child receives must not.
    const result = validateActivity(stored.rows[0]!.content_snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const childBytes = JSON.stringify(toChildView(result.activity));
    for (const forbidden of ['answerKey', 'rationale', 'exemplarAnswer']) {
      expect(childBytes).not.toContain(forbidden);
    }
  });

  it('allows exactly one submission per assignment', async () => {
    const tenant = await seedTenant(db, 'p5-dup');
    const r = await asParent(
      db,
      tenant.parentId,
      `insert into public.submissions (assignment_id, answers) values ($1, '{}'::jsonb)`,
      [tenant.assignmentId],
    );
    expect(r.error).toBeDefined();
  });

  it('lets a parent delete their child submission and its assets', async () => {
    const tenant = await seedTenant(db, 'p5-del');
    const r = await asParent(db, tenant.parentId, 'delete from public.submissions where id = $1', [
      tenant.submissionId,
    ]);
    expect(r.rowCount).toBe(1);

    const assets = await db.query('select id from public.submission_assets where id = $1', [
      tenant.assetId,
    ]);
    expect(assets.rowCount).toBe(0);
  });

  it('keeps another parent out of every step of the chain', async () => {
    const probes: [string, string][] = [
      ['assignment', 'select id from public.assignments where id = $1'],
      ['submission', 'select id from public.submissions where assignment_id = $1'],
    ];
    for (const [label, sql] of probes) {
      const r = await asParent(db, B.parentId, sql, [A.assignmentId]);
      expect(r.rowCount, `${label} must be invisible to parent B`).toBe(0);
    }
  });
});
