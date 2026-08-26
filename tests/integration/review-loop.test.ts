/**
 * Phase 6: the loop closes — a parent's verdict changes what gets suggested next.
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
import { applyReview } from '@/lib/domain/engine/adapt';
import { getAgeBand } from '@/lib/domain/policy/age';
import type { ChildTypeProgress } from '@/lib/domain/entities';

const describeDb = hasDatabase ? describe : describe.skip;

describeDb('parent review and adaptation', () => {
  let db: Client;
  let A: Tenant;
  let B: Tenant;

  beforeAll(async () => {
    db = await connectAdmin();
    await applySchema(db);
    A = await seedTenant(db, 'p6a');
    B = await seedTenant(db, 'p6b');
  }, 60_000);

  afterAll(async () => {
    await db?.end();
  });

  /**
   * A fresh assignment with no review yet.
   *
   * seedTenant already reviews its default assignment, and there is exactly one
   * review per assignment — so a test that wants to review something needs its
   * own.
   */
  async function unreviewedAssignment(tenant: Tenant): Promise<string> {
    const r = await db.query<{ id: string }>(
      `insert into public.assignments
         (child_id, template_id, assigned_by, difficulty_at_assignment, content_snapshot)
       values ($1, $2, $3, 2, '{"title":"probe","type":"reflection","schemaVersion":1}'::jsonb)
       returning id`,
      [tenant.childId, tenant.templateId, tenant.parentId],
    );
    return r.rows[0]!.id;
  }

  async function progressFor(childId: string, type: string): Promise<ChildTypeProgress> {
    const r = await db.query(
      'select * from public.child_type_progress where child_id = $1 and type = $2',
      [childId, type],
    );
    const row = r.rows[0] as Record<string, unknown>;
    return {
      childId: row.child_id as string,
      type: row.type as ChildTypeProgress['type'],
      difficulty: row.difficulty as ChildTypeProgress['difficulty'],
      streakSuccess: row.streak_success as number,
      streakStruggle: row.streak_struggle as number,
      lastAssignedAt: (row.last_assigned_at as string | null) ?? null,
    };
  }

  it('records a verdict against the assignment', async () => {
    const tenant = await seedTenant(db, 'p6-verdict');
    const assignmentId = await unreviewedAssignment(tenant);
    const r = await asParent(
      db,
      tenant.parentId,
      `insert into public.assignment_reviews (assignment_id, reviewer_id, verdict, note)
       values ($1, $2, 'too_hard', 'Con thấy hơi khó') returning id`,
      [assignmentId, tenant.parentId],
    );
    expect(r.error).toBeUndefined();
    expect(r.rowCount).toBe(1);
  });

  it('refuses a review attributed to another parent', async () => {
    const r = await asParent(
      db,
      B.parentId,
      `insert into public.assignment_reviews (assignment_id, reviewer_id, verdict)
       values ($1, $2, 'too_easy')`,
      [A.assignmentId, A.parentId],
    );
    expect(r.error).toBeDefined();
  });

  it('closes the loop: a "too hard" verdict lowers the stored difficulty', async () => {
    const tenant = await seedTenant(db, 'p6-loop');
    const band = getAgeBand('lower_primary');

    await db.query(
      `update public.child_type_progress set difficulty = 3
        where child_id = $1 and type = 'reflection'`,
      [tenant.childId],
    );

    const before = await progressFor(tenant.childId, 'reflection');
    expect(before.difficulty).toBe(3);

    const adapted = applyReview(before, 'too_hard', band);

    const r = await asParent(
      db,
      tenant.parentId,
      `update public.child_type_progress
          set difficulty = $3, streak_success = $4, streak_struggle = $5
        where child_id = $1 and type = $2 returning difficulty`,
      [
        tenant.childId,
        'reflection',
        adapted.difficulty,
        adapted.streakSuccess,
        adapted.streakStruggle,
      ],
    );
    expect(r.error).toBeUndefined();

    const after = await progressFor(tenant.childId, 'reflection');
    expect(after.difficulty).toBe(2);
  });

  it('never lets adaptation escape the age band, over a long verdict sequence', async () => {
    const tenant = await seedTenant(db, 'p6-clamp');
    const band = getAgeBand('lower_primary'); // 1–3
    let progress = await progressFor(tenant.childId, 'reflection');

    const verdicts = ['too_easy', 'too_easy', 'too_easy', 'just_right', 'just_right'] as const;
    for (const verdict of verdicts) {
      progress = applyReview(progress, verdict, band);
      await db.query(
        `update public.child_type_progress set difficulty = $3
          where child_id = $1 and type = $2`,
        [tenant.childId, 'reflection', progress.difficulty],
      );
      const stored = await progressFor(tenant.childId, 'reflection');
      expect(stored.difficulty).toBeGreaterThanOrEqual(band.minDifficulty);
      expect(stored.difficulty).toBeLessThanOrEqual(band.maxDifficulty);
    }
  });

  it('keeps a parent note private to that parent', async () => {
    const tenant = await seedTenant(db, 'p6-note');
    const assignmentId = await unreviewedAssignment(tenant);
    await db.query(
      `insert into public.assignment_reviews (assignment_id, reviewer_id, verdict, note)
       values ($1, $2, 'just_right', 'Ghi chú riêng của bố mẹ')`,
      [assignmentId, tenant.parentId],
    );

    const own = await asParent(
      db,
      tenant.parentId,
      'select note from public.assignment_reviews where assignment_id = $1',
      [assignmentId],
    );
    expect(own.rowCount).toBe(1);

    const other = await asParent(
      db,
      B.parentId,
      'select note from public.assignment_reviews where assignment_id = $1',
      [assignmentId],
    );
    expect(other.rowCount, 'another parent must not read the note').toBe(0);
  });

  it('allows only one review per assignment', async () => {
    const tenant = await seedTenant(db, 'p6-dup');
    const second = await asParent(
      db,
      tenant.parentId,
      `insert into public.assignment_reviews (assignment_id, reviewer_id, verdict)
       values ($1, $2, 'too_easy')`,
      [tenant.assignmentId, tenant.parentId],
    );
    expect(second.error).toBeDefined();
  });

  it('lets a parent report content without touching the template', async () => {
    const tenant = await seedTenant(db, 'p6-report');
    const r = await asParent(
      db,
      tenant.parentId,
      `insert into public.content_reports (reporter_id, template_id, assignment_id, reason, details)
       values ($1, $2, $3, 'age_inappropriate', 'Hơi khó với bé') returning id`,
      [tenant.parentId, tenant.templateId, tenant.assignmentId],
    );
    expect(r.error).toBeUndefined();

    const template = await db.query('select status from public.activity_templates where id = $1', [
      tenant.templateId,
    ]);
    expect((template.rows[0] as { status: string }).status).toBe('approved');
  });

  it('archiving a reported template does not alter existing snapshots', async () => {
    const tenant = await seedTenant(db, 'p6-archive');
    const before = await db.query('select content_snapshot from public.assignments where id = $1', [
      tenant.assignmentId,
    ]);

    await db.query(`update public.activity_templates set status = 'archived' where id = $1`, [
      tenant.templateId,
    ]);

    const after = await db.query('select content_snapshot from public.assignments where id = $1', [
      tenant.assignmentId,
    ]);
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('writes an audit trail a parent can read but not rewrite', async () => {
    const tenant = await seedTenant(db, 'p6-audit');
    const insert = await asParent(
      db,
      tenant.parentId,
      `insert into public.audit_events (actor_id, action, subject_type, subject_id)
       values ($1, 'review', 'assignment', $2) returning id`,
      [tenant.parentId, tenant.assignmentId],
    );
    expect(insert.error).toBeUndefined();

    const update = await asParent(
      db,
      tenant.parentId,
      `update public.audit_events set action = 'tampered' where actor_id = $1`,
      [tenant.parentId],
    );
    expect(update.error, 'the audit trail must be append-only').toBeDefined();
  });
});
