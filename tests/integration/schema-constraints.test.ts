/**
 * Schema invariants that the product depends on — enforced by the database, so
 * an application bug cannot violate them.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { hasDatabase, connectAdmin, applySchema, seedTenant, type Tenant } from './helpers/db';

/** Unique per run: the test database persists between runs. */
const RUN = randomUUID().slice(0, 8);

const describeDb = hasDatabase ? describe : describe.skip;

describeDb('schema constraints', () => {
  let db: Client;
  let T: Tenant;

  beforeAll(async () => {
    db = await connectAdmin();
    await applySchema(db);
    T = await seedTenant(db, 'schema');
  }, 60_000);

  afterAll(async () => {
    await db?.end();
  });

  // ===========================================================================
  // Child birth data — principle P5.
  // ===========================================================================
  describe('child birth data', () => {
    it('has no date-of-birth or age column anywhere in the schema', async () => {
      const result = await db.query<{ table_name: string; column_name: string }>(
        `select table_name, column_name from information_schema.columns
          where table_schema = 'public'
            and (column_name in ('age', 'dob', 'date_of_birth', 'birth_date', 'birthdate')
                 or column_name like '%date_of_birth%')`,
      );
      expect(result.rows, 'age and exact DOB must never be persisted (P5)').toEqual([]);
    });

    it('stores birth_year and birth_month', async () => {
      const result = await db.query<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'children'
            and column_name in ('birth_year', 'birth_month')`,
      );
      expect(result.rows.map((r) => r.column_name).sort()).toEqual(['birth_month', 'birth_year']);
    });

    it('rejects birth_month outside 1–12', async () => {
      for (const month of [0, 13, -1, 99]) {
        await expect(
          db.query(
            `insert into public.children (parent_id, display_name, birth_year, birth_month, grade)
             values ($1, 'x', 2018, $2, 'grade_1')`,
            [T.parentId, month],
          ),
        ).rejects.toThrow(/birth_month/);
      }
    });

    it('accepts the boundary months', async () => {
      for (const month of [1, 12]) {
        const r = await db.query(
          `insert into public.children (parent_id, display_name, birth_year, birth_month, grade)
           values ($1, 'boundary', 2018, $2, 'grade_1') returning id`,
          [T.parentId, month],
        );
        expect(r.rowCount).toBe(1);
      }
    });
  });

  // ===========================================================================
  // Assignment snapshot immutability — decision A5.
  // ===========================================================================
  describe('assignment content_snapshot immutability', () => {
    it('rejects an UPDATE of content_snapshot', async () => {
      await expect(
        db.query(
          `update public.assignments set content_snapshot = '{"tampered":true}'::jsonb
                   where id = $1`,
          [T.assignmentId],
        ),
      ).rejects.toThrow(/immutable/i);
    });

    it('rejects repointing template_id', async () => {
      await expect(
        db.query('update public.assignments set template_id = $2 where id = $1', [
          T.assignmentId,
          T.templateId,
        ]),
      ).resolves.toBeTruthy(); // same value is a no-op and allowed

      const other = await seedTenant(db, 'schema-other');
      await expect(
        db.query('update public.assignments set template_id = $2 where id = $1', [
          T.assignmentId,
          other.templateId,
        ]),
      ).rejects.toThrow(/immutable/i);
    });

    it('still allows the assignment lifecycle to progress', async () => {
      const r = await db.query(
        `update public.assignments set status = 'submitted', submitted_at = now()
          where id = $1 returning status`,
        [T.assignmentId],
      );
      expect(r.rows[0].status).toBe('submitted');
    });

    it('keeps assigned work unchanged when the source template is edited', async () => {
      const before = await db.query(
        'select content_snapshot from public.assignments where id = $1',
        [T.assignmentId],
      );

      await db.query(
        `update public.activity_templates
            set title = 'Tiêu đề đã đổi', payload = '{"theme":"effort"}'::jsonb, version = version + 1
          where id = $1`,
        [T.templateId],
      );

      const after = await db.query(
        'select content_snapshot from public.assignments where id = $1',
        [T.assignmentId],
      );
      expect(after.rows[0].content_snapshot).toEqual(before.rows[0].content_snapshot);
    });

    it('requires a non-empty snapshot object', async () => {
      await expect(
        db.query(
          `insert into public.assignments
             (child_id, template_id, assigned_by, difficulty_at_assignment, content_snapshot)
           values ($1, $2, $3, 1, '{}'::jsonb)`,
          [T.childId, T.templateId, T.parentId],
        ),
      ).rejects.toThrow(/snapshot/i);
    });
  });

  // ===========================================================================
  // Provenance — defence in depth layer 3 (PRODUCT_SPEC.md §11.3).
  // ===========================================================================
  describe('activity provenance constraints', () => {
    it('keeps source and approved_by_parent_id as real columns, not jsonb fields', async () => {
      const result = await db.query<{ column_name: string; data_type: string }>(
        `select column_name, data_type from information_schema.columns
          where table_schema = 'public' and table_name = 'activity_templates'
            and column_name in ('source', 'approved_by_parent_id')`,
      );
      expect(result.rows).toHaveLength(2);
      for (const row of result.rows) {
        expect(row.data_type).not.toBe('jsonb');
      }
    });

    it('refuses to approve AI content with no approving parent — via direct SQL', async () => {
      // Deliberately bypasses every layer of application code. This is the
      // point of layer 3: it holds even when nothing else runs.
      await expect(
        db.query(
          `insert into public.activity_templates
             (slug, type, title, instructions, min_age, max_age, grade_min, grade_max,
              difficulty, estimated_minutes, response_mode, payload, status, source,
              approved_by_parent_id, owner_id, policy_version)
           values ('ai-unapproved-' || $2, 'reflection', 'Chưa duyệt', 'Nội dung AI chưa được duyệt.',
                   7, 9, 'grade_2', 'grade_3', 2, 10, 'text', '{}'::jsonb,
                   'approved', 'ai', null, $1, 'age-policy@2026-08-25')`,
          [T.parentId, RUN],
        ),
      ).rejects.toThrow(/ai_requires_parent_approval/);
    });

    it('allows an AI draft with no approving parent', async () => {
      const r = await db.query(
        `insert into public.activity_templates
           (slug, type, title, instructions, min_age, max_age, grade_min, grade_max,
            difficulty, estimated_minutes, response_mode, payload, status, source,
            owner_id, policy_version)
         values ('ai-draft-ok-' || $2, 'reflection', 'Bản nháp', 'Nội dung AI đang chờ duyệt.',
                 7, 9, 'grade_2', 'grade_3', 2, 10, 'text', '{}'::jsonb,
                 'draft', 'ai', $1, 'age-policy@2026-08-25')
         returning id`,
        [T.parentId, RUN],
      );
      expect(r.rowCount).toBe(1);
    });

    it('allows approved AI content when a parent approved it', async () => {
      const r = await db.query(
        `insert into public.activity_templates
           (slug, type, title, instructions, min_age, max_age, grade_min, grade_max,
            difficulty, estimated_minutes, response_mode, payload, status, source,
            approved_by_parent_id, owner_id, policy_version)
         values ('ai-approved-ok-' || $2, 'reflection', 'Đã duyệt', 'Nội dung AI đã được duyệt.',
                 7, 9, 'grade_2', 'grade_3', 2, 10, 'text', '{}'::jsonb,
                 'approved', 'ai', $1, $1, 'age-policy@2026-08-25')
         returning id`,
        [T.parentId, RUN],
      );
      expect(r.rowCount).toBe(1);
    });

    it('refuses seed content that claims a parent approver', async () => {
      await expect(
        db.query(
          `insert into public.activity_templates
             (slug, type, title, instructions, min_age, max_age, grade_min, grade_max,
              difficulty, estimated_minutes, response_mode, payload, status, source,
              approved_by_parent_id, policy_version)
           values ('seed-with-approver-' || $2, 'reflection', 'Sai', 'Seed không có người duyệt.',
                   7, 9, 'grade_2', 'grade_3', 2, 10, 'text', '{}'::jsonb,
                   'approved', 'seed', $1, 'age-policy@2026-08-25')`,
          [T.parentId, RUN],
        ),
      ).rejects.toThrow(/seed_has_no_parent_approval/);
    });

    it('refuses seed content owned by a parent', async () => {
      await expect(
        db.query(
          `insert into public.activity_templates
             (slug, type, title, instructions, min_age, max_age, grade_min, grade_max,
              difficulty, estimated_minutes, response_mode, payload, status, source,
              owner_id, policy_version)
           values ('seed-owned-' || $2, 'reflection', 'Sai', 'Seed phải là nội dung toàn cục.',
                   7, 9, 'grade_2', 'grade_3', 2, 10, 'text', '{}'::jsonb,
                   'approved', 'seed', $1, 'age-policy@2026-08-25')`,
          [T.parentId, RUN],
        ),
      ).rejects.toThrow(/seed_is_global/);
    });
  });

  // ===========================================================================
  // Triggers and cascades
  // ===========================================================================
  describe('triggers', () => {
    it('creates a profile when an auth user is created', async () => {
      const id = randomUUID();
      await db.query(
        `insert into auth.users (id, email, raw_user_meta_data)
         values ($1, $2, '{"display_name":"Mẹ Lan"}'::jsonb)`,
        [id, `${id}@example.test`],
      );
      const r = await db.query('select display_name from public.profiles where id = $1', [id]);
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].display_name).toBe('Mẹ Lan');
    });

    it('initialises exactly six progress rows per child, one per activity type', async () => {
      const r = await db.query(
        'select type from public.child_type_progress where child_id = $1 order by type',
        [T.childId],
      );
      expect(r.rowCount).toBe(6);
      expect(r.rows.map((x) => x.type)).toEqual([
        'handwriting',
        'drawing_prompt',
        'story_comprehension',
        'story_summary',
        'reflection',
        'situation_judgment',
      ]);
    });

    it('cascades account deletion through the whole ownership chain', async () => {
      const doomed = await seedTenant(db, 'doomed');
      await db.query('delete from auth.users where id = $1', [doomed.parentId]);

      for (const [table, column, value] of [
        ['profiles', 'id', doomed.parentId],
        ['children', 'id', doomed.childId],
        ['assignments', 'id', doomed.assignmentId],
        ['submissions', 'id', doomed.submissionId],
        ['submission_assets', 'id', doomed.assetId],
        ['assignment_reviews', 'id', doomed.reviewId],
        ['content_reports', 'id', doomed.reportId],
      ] as const) {
        const r = await db.query(`select 1 from public.${table} where ${column} = $1`, [value]);
        expect(r.rowCount, `${table} should be gone after account deletion`).toBe(0);
      }
    });
  });

  describe('miscellaneous constraints', () => {
    it('rejects difficulty outside 1–5', async () => {
      await expect(
        db.query('update public.child_type_progress set difficulty = 9 where child_id = $1', [
          T.childId,
        ]),
      ).rejects.toThrow(/difficulty/);
    });

    it('allows only one submission per assignment', async () => {
      const t = await seedTenant(db, 'dup');
      await expect(
        db.query(`insert into public.submissions (assignment_id) values ($1)`, [t.assignmentId]),
      ).rejects.toThrow(/unique|duplicate/i);
    });

    it('rejects a disallowed asset mime type', async () => {
      const t = await seedTenant(db, 'mime');
      await expect(
        db.query(
          `insert into public.submission_assets (submission_id, storage_path, mime_type, size_bytes)
           values ($1, 'p/q/r.svg', 'image/svg+xml', 100)`,
          [t.submissionId],
        ),
      ).rejects.toThrow(/mime_type/);
    });
  });
});
