/**
 * Defence in depth layer 3 — PRODUCT_SPEC.md §11.3.
 *
 * Every assertion here uses DIRECT SQL, deliberately bypassing zod, the
 * pipeline and assertAssignable. That is the point: layer 3 is what holds when
 * the application is not in the loop at all.
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

/** Unique per run: the integration database persists between runs. */
const RUN = randomUUID().slice(0, 8);

const describeDb = hasDatabase ? describe : describe.skip;

describeDb('AI content enforcement at the database level', () => {
  let db: Client;
  let A: Tenant;
  let B: Tenant;

  beforeAll(async () => {
    db = await connectAdmin();
    await applySchema(db);
    A = await seedTenant(db, 'p8a');
    B = await seedTenant(db, 'p8b');
  }, 60_000);

  afterAll(async () => {
    await db?.end();
  });

  async function insertTemplate(
    slug: string,
    over: Partial<{
      status: string;
      source: string;
      ownerId: string | null;
      approvedBy: string | null;
    }> = {},
  ) {
    return db.query<{ id: string }>(
      `insert into public.activity_templates
         (slug, type, title, instructions, min_age, max_age, grade_min, grade_max,
          difficulty, estimated_minutes, response_mode, payload, status, source,
          owner_id, approved_by_parent_id, policy_version)
       values ($1, 'reflection', 'Bản nháp', 'Nội dung thử nghiệm cho kiểm thử.',
               7, 8, 'grade_2', 'grade_3', 2, 10, 'text', '{}'::jsonb,
               $2, $3, $4, $5, 'age-policy@2026-08-25')
       returning id`,
      [
        `zz-probe-${slug}-${RUN}`,
        over.status ?? 'draft',
        over.source ?? 'ai',
        over.ownerId === undefined ? A.parentId : over.ownerId,
        over.approvedBy ?? null,
      ],
    );
  }

  describe('the check constraint (from Phase 2)', () => {
    it('refuses approved AI content with no approving parent', async () => {
      await expect(insertTemplate('ai-approved-no-parent', { status: 'approved' })).rejects.toThrow(
        /ai_requires_parent_approval/,
      );
    });

    it('allows an AI draft with no approving parent', async () => {
      const r = await insertTemplate('ai-draft-ok');
      expect(r.rowCount).toBe(1);
    });

    it('allows approved AI content that records its approver', async () => {
      const r = await insertTemplate('ai-approved-ok', {
        status: 'approved',
        approvedBy: A.parentId,
      });
      expect(r.rowCount).toBe(1);
    });
  });

  describe('the assignment trigger (Phase 8)', () => {
    it('refuses to assign an unapproved AI draft, via direct SQL', async () => {
      const draft = await insertTemplate('assign-draft');
      await expect(
        db.query(
          `insert into public.assignments
             (child_id, template_id, assigned_by, difficulty_at_assignment, content_snapshot)
           values ($1, $2, $3, 2, '{"x":1}'::jsonb)`,
          [A.childId, draft.rows[0]!.id, A.parentId],
        ),
      ).rejects.toThrow(/only approved content may be assigned/);
    });

    it('refuses AI content approved by a DIFFERENT parent', async () => {
      const foreign = await insertTemplate('assign-foreign', {
        status: 'approved',
        approvedBy: B.parentId,
        ownerId: B.parentId,
      });
      await expect(
        db.query(
          `insert into public.assignments
             (child_id, template_id, assigned_by, difficulty_at_assignment, content_snapshot)
           values ($1, $2, $3, 2, '{"x":1}'::jsonb)`,
          [A.childId, foreign.rows[0]!.id, A.parentId],
        ),
      ).rejects.toThrow(/only be assigned by the parent who approved it/);
    });

    it('allows AI content the assigning parent approved', async () => {
      const mine = await insertTemplate('assign-mine', {
        status: 'approved',
        approvedBy: A.parentId,
      });
      const r = await db.query(
        `insert into public.assignments
           (child_id, template_id, assigned_by, difficulty_at_assignment, content_snapshot)
         values ($1, $2, $3, 2, '{"x":1}'::jsonb) returning id`,
        [A.childId, mine.rows[0]!.id, A.parentId],
      );
      expect(r.rowCount).toBe(1);
    });

    it('still allows ordinary seed content', async () => {
      const r = await db.query(
        `insert into public.assignments
           (child_id, template_id, assigned_by, difficulty_at_assignment, content_snapshot)
         values ($1, $2, $3, 2, '{"x":1}'::jsonb) returning id`,
        [A.childId, A.templateId, A.parentId],
      );
      expect(r.rowCount).toBe(1);
    });

    it('refuses an archived template', async () => {
      const archived = await insertTemplate('assign-archived', {
        status: 'approved',
        approvedBy: A.parentId,
      });
      await db.query(`update public.activity_templates set status='archived' where id=$1`, [
        archived.rows[0]!.id,
      ]);
      await expect(
        db.query(
          `insert into public.assignments
             (child_id, template_id, assigned_by, difficulty_at_assignment, content_snapshot)
           values ($1, $2, $3, 2, '{"x":1}'::jsonb)`,
          [A.childId, archived.rows[0]!.id, A.parentId],
        ),
      ).rejects.toThrow(/only approved content may be assigned/);
    });
  });

  describe('draft ownership under RLS', () => {
    it('lets a parent create their own AI draft', async () => {
      const r = await asParent(
        db,
        A.parentId,
        `insert into public.activity_templates
           (slug, type, title, instructions, min_age, max_age, grade_min, grade_max,
            difficulty, estimated_minutes, response_mode, payload, status, source,
            owner_id, policy_version)
         values ('zz-probe-own-draft-' || substr(md5(random()::text),1,8), 'reflection',
                 'Bản nháp của tôi', 'Nội dung do AI tạo, chờ bố mẹ duyệt.',
                 7, 8, 'grade_2', 'grade_3', 2, 10, 'text', '{}'::jsonb,
                 'draft', 'ai', $1, 'age-policy@2026-08-25') returning id`,
        [A.parentId],
      );
      expect(r.error).toBeUndefined();
    });

    it('refuses a draft created as approved — approval is a separate act', async () => {
      const r = await asParent(
        db,
        A.parentId,
        `insert into public.activity_templates
           (slug, type, title, instructions, min_age, max_age, grade_min, grade_max,
            difficulty, estimated_minutes, response_mode, payload, status, source,
            owner_id, approved_by_parent_id, policy_version)
         values ('zz-probe-born-approved-' || $2, 'reflection', 'Tự duyệt', 'Nội dung tự nhận đã duyệt.',
                 7, 8, 'grade_2', 'grade_3', 2, 10, 'text', '{}'::jsonb,
                 'approved', 'ai', $1, $1, 'age-policy@2026-08-25')`,
        [A.parentId, RUN],
      );
      expect(r.error).toBeDefined();
    });

    it('refuses a parent forging a SEED template', async () => {
      const r = await asParent(
        db,
        A.parentId,
        `insert into public.activity_templates
           (slug, type, title, instructions, min_age, max_age, grade_min, grade_max,
            difficulty, estimated_minutes, response_mode, payload, status, source, policy_version)
         values ('zz-probe-forged-seed-' || $1, 'reflection', 'Giả mạo', 'Nội dung giả mạo là seed.',
                 7, 8, 'grade_2', 'grade_3', 2, 10, 'text', '{}'::jsonb,
                 'approved', 'seed', 'age-policy@2026-08-25')`,
        [RUN],
      );
      expect(r.error, 'clients must never be able to write catalog content').toBeDefined();
    });

    it('refuses a parent editing another parent draft', async () => {
      const draft = await insertTemplate('other-draft');
      const r = await asParent(
        db,
        B.parentId,
        `update public.activity_templates set title = 'chiếm quyền' where id = $1`,
        [draft.rows[0]!.id],
      );
      expect(r.rowCount).toBe(0);
    });

    it('refuses approving a draft in another parent name', async () => {
      const draft = await insertTemplate('approve-as-other');
      const r = await asParent(
        db,
        A.parentId,
        `update public.activity_templates
            set status = 'approved', approved_by_parent_id = $2 where id = $1`,
        [draft.rows[0]!.id, B.parentId],
      );
      expect(r.rowCount, 'the approver must be the acting parent').toBe(0);
    });

    it('lets a parent approve their own draft', async () => {
      const draft = await insertTemplate('approve-own');
      const r = await asParent(
        db,
        A.parentId,
        `update public.activity_templates
            set status = 'approved', approved_by_parent_id = $2 where id = $1 returning id`,
        [draft.rows[0]!.id, A.parentId],
      );
      expect(r.error).toBeUndefined();
      expect(r.rowCount).toBe(1);
    });

    it('keeps another parent draft invisible', async () => {
      const draft = await insertTemplate('private-draft');
      const r = await asParent(
        db,
        B.parentId,
        `select id from public.activity_templates where id = $1`,
        [draft.rows[0]!.id],
      );
      expect(r.rowCount).toBe(0);
    });
  });

  describe('generation audit', () => {
    it('records attempts scoped to the parent', async () => {
      const r = await asParent(
        db,
        A.parentId,
        `insert into public.ai_generation_events
           (parent_id, child_id, activity_type, age_band, prompt_template_id,
            prompt_template_version, model, outcome, failure_rules)
         values ($1, $2, 'reflection', 'lower_primary', 'reflection-vi', '1.0.0',
                 'test-model', 'safety_rejected', array['denylist:violence']) returning id`,
        [A.parentId, A.childId],
      );
      expect(r.error).toBeUndefined();

      const other = await asParent(
        db,
        B.parentId,
        `select id from public.ai_generation_events where parent_id = $1`,
        [A.parentId],
      );
      expect(other.rowCount).toBe(0);
    });

    it('stores rule ids, never generated content', async () => {
      const columns = await db.query<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_schema='public' and table_name='ai_generation_events'`,
      );
      const names = columns.rows.map((r) => r.column_name);
      expect(names).not.toContain('content');
      expect(names).not.toContain('payload');
      expect(names).not.toContain('prompt');
      expect(names).toContain('failure_rules');
    });
  });
});
