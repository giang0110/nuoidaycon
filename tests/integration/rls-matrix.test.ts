/**
 * Cross-tenant RLS matrix — PRODUCT_SPEC.md §11.4.
 *
 * Three actors against a real database: parent A (owner), parent B (attacker),
 * and anon. Every operation is tested independently, because a table can be
 * readable-but-not-writable and a policy can be right for SELECT and wrong for
 * UPDATE.
 *
 * "Denied" means zero rows affected or an error — never a silent success on
 * someone else's data.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Client } from 'pg';
import { randomUUID } from 'node:crypto';

/** Unique per run: the test database persists between runs. */
const RUN = randomUUID().slice(0, 8);
import {
  hasDatabase,
  connectAdmin,
  applySchema,
  asParent,
  asAnon,
  seedTenant,
  type Tenant,
} from './helpers/db';
import { COVERED_TABLES, FORCED_TABLES } from './helpers/tenant-tables';

const describeDb = hasDatabase ? describe : describe.skip;

describeDb('cross-tenant RLS matrix', () => {
  let db: Client;
  let A: Tenant;
  let B: Tenant;

  beforeAll(async () => {
    db = await connectAdmin();
    await applySchema(db);
    A = await seedTenant(db, 'a');
    B = await seedTenant(db, 'b');
  }, 60_000);

  afterAll(async () => {
    await db?.end();
  });

  // ===========================================================================
  // Parent A on their OWN data — the policies must not be so tight that the
  // product cannot work.
  // ===========================================================================
  describe('parent A on own data', () => {
    it('reads own profile, child, assignment, submission, asset, review, report', async () => {
      const checks: [string, string, unknown[]][] = [
        ['profiles', 'select id from public.profiles where id = $1', [A.parentId]],
        ['children', 'select id from public.children where id = $1', [A.childId]],
        ['assignments', 'select id from public.assignments where id = $1', [A.assignmentId]],
        ['submissions', 'select id from public.submissions where id = $1', [A.submissionId]],
        ['submission_assets', 'select id from public.submission_assets where id = $1', [A.assetId]],
        [
          'assignment_reviews',
          'select id from public.assignment_reviews where id = $1',
          [A.reviewId],
        ],
        ['content_reports', 'select id from public.content_reports where id = $1', [A.reportId]],
        ['audit_events', 'select id from public.audit_events where id = $1', [A.auditId]],
        [
          'child_interests',
          'select child_id from public.child_interests where child_id = $1',
          [A.childId],
        ],
        [
          'child_type_progress',
          'select child_id from public.child_type_progress where child_id = $1',
          [A.childId],
        ],
      ];
      for (const [table, sql, params] of checks) {
        const r = await asParent(db, A.parentId, sql, params);
        expect(r.error, `${table}: ${r.error?.message}`).toBeUndefined();
        expect(r.rowCount, `${table} should be readable by its owner`).toBeGreaterThan(0);
      }
    });

    it('inserts a child of their own', async () => {
      const r = await asParent(
        db,
        A.parentId,
        `insert into public.children (parent_id, display_name, birth_year, birth_month, grade)
         values ($1, 'Bé mới', 2019, 3, 'grade_1') returning id`,
        [A.parentId],
      );
      expect(r.error).toBeUndefined();
      expect(r.rowCount).toBe(1);
    });

    it('updates own child', async () => {
      const r = await asParent(
        db,
        A.parentId,
        `update public.children set display_name = 'Bé A' where id = $1 returning id`,
        [A.childId],
      );
      expect(r.rowCount).toBe(1);
    });

    it('deletes own submission (approved parent capability)', async () => {
      const seeded = await seedTenant(db, 'a-del');
      const r = await asParent(
        db,
        seeded.parentId,
        'delete from public.submissions where id = $1 returning id',
        [seeded.submissionId],
      );
      expect(r.error).toBeUndefined();
      expect(r.rowCount).toBe(1);

      const gone = await db.query('select id from public.submissions where id = $1', [
        seeded.submissionId,
      ]);
      expect(gone.rowCount).toBe(0);
    });

    it('deleting a submission cascades to its assets', async () => {
      const seeded = await seedTenant(db, 'a-cascade');
      await asParent(db, seeded.parentId, 'delete from public.submissions where id = $1', [
        seeded.submissionId,
      ]);
      const assets = await db.query('select id from public.submission_assets where id = $1', [
        seeded.assetId,
      ]);
      expect(assets.rowCount).toBe(0);
    });

    it('reads approved global catalog templates', async () => {
      const r = await asParent(
        db,
        A.parentId,
        `select id from public.activity_templates where status = 'approved' and owner_id is null`,
      );
      expect(r.rowCount).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Parent B against parent A — every operation, independently.
  // ===========================================================================
  describe('parent B cannot reach parent A data', () => {
    it('SELECT is denied on every tenant table', async () => {
      const probes: [string, string, unknown[]][] = [
        ['profiles', 'select id from public.profiles where id = $1', [A.parentId]],
        ['children', 'select id from public.children where id = $1', [A.childId]],
        [
          'child_interests',
          'select child_id from public.child_interests where child_id = $1',
          [A.childId],
        ],
        [
          'child_type_progress',
          'select child_id from public.child_type_progress where child_id = $1',
          [A.childId],
        ],
        ['assignments', 'select id from public.assignments where id = $1', [A.assignmentId]],
        ['submissions', 'select id from public.submissions where id = $1', [A.submissionId]],
        ['submission_assets', 'select id from public.submission_assets where id = $1', [A.assetId]],
        [
          'assignment_reviews',
          'select id from public.assignment_reviews where id = $1',
          [A.reviewId],
        ],
        ['content_reports', 'select id from public.content_reports where id = $1', [A.reportId]],
        ['audit_events', 'select id from public.audit_events where id = $1', [A.auditId]],
      ];
      for (const [table, sql, params] of probes) {
        const r = await asParent(db, B.parentId, sql, params);
        expect(r.rowCount, `${table}: parent B must see zero of parent A's rows`).toBe(0);
      }
    });

    it('INSERT of a row owned by parent A is denied', async () => {
      const probes: [string, string, unknown[]][] = [
        [
          'children',
          `insert into public.children (parent_id, display_name, birth_year, birth_month, grade)
           values ($1, 'Chiếm quyền', 2018, 1, 'grade_1')`,
          [A.parentId],
        ],
        [
          'child_interests',
          `insert into public.child_interests (child_id, interest_id) values ($1, $2)`,
          [A.childId, B.interestId],
        ],
        [
          'assignments',
          `insert into public.assignments
             (child_id, template_id, assigned_by, difficulty_at_assignment, content_snapshot)
           values ($1, $2, $3, 1, '{"x":1}'::jsonb)`,
          [A.childId, A.templateId, B.parentId],
        ],
        [
          'submissions',
          `insert into public.submissions (assignment_id, answers) values ($1, '{}'::jsonb)`,
          [A.assignmentId],
        ],
        [
          'submission_assets',
          `insert into public.submission_assets (submission_id, storage_path, mime_type, size_bytes)
           values ($1, 'x/y/z.jpg', 'image/jpeg', 100)`,
          [A.submissionId],
        ],
        [
          'assignment_reviews',
          `insert into public.assignment_reviews (assignment_id, reviewer_id, verdict)
           values ($1, $2, 'too_easy')`,
          [A.assignmentId, B.parentId],
        ],
        [
          'content_reports',
          `insert into public.content_reports (reporter_id, template_id, reason)
           values ($1, $2, 'other')`,
          [A.parentId, A.templateId],
        ],
        [
          'audit_events',
          `insert into public.audit_events (actor_id, action, subject_type)
           values ($1, 'forged', 'assignment')`,
          [A.parentId],
        ],
        [
          'profiles',
          `insert into public.profiles (id, display_name) values ($1, 'Giả mạo')`,
          [randomUUID()],
        ],
      ];
      for (const [table, sql, params] of probes) {
        const r = await asParent(db, B.parentId, sql, params);
        expect(r.error, `${table}: insert on behalf of parent A must be rejected`).toBeDefined();
      }
    });

    it('UPDATE of parent A data is denied', async () => {
      const probes: [string, string, unknown[]][] = [
        [
          'profiles',
          `update public.profiles set display_name = 'hacked' where id = $1`,
          [A.parentId],
        ],
        [
          'children',
          `update public.children set display_name = 'hacked' where id = $1`,
          [A.childId],
        ],
        [
          'child_type_progress',
          `update public.child_type_progress set difficulty = 5 where child_id = $1`,
          [A.childId],
        ],
        [
          'assignments',
          `update public.assignments set status = 'skipped' where id = $1`,
          [A.assignmentId],
        ],
        [
          'submissions',
          `update public.submissions set answers = '{"x":1}'::jsonb where id = $1`,
          [A.submissionId],
        ],
        [
          'submission_assets',
          `update public.submission_assets set storage_path = 'evil' where id = $1`,
          [A.assetId],
        ],
        [
          'assignment_reviews',
          `update public.assignment_reviews set verdict = 'too_hard' where id = $1`,
          [A.reviewId],
        ],
        [
          'content_reports',
          `update public.content_reports set status = 'dismissed' where id = $1`,
          [A.reportId],
        ],
      ];
      for (const [table, sql, params] of probes) {
        const r = await asParent(db, B.parentId, sql, params);
        expect(r.rowCount, `${table}: parent B must update zero of parent A's rows`).toBe(0);
      }
    });

    it('DELETE of parent A data is denied', async () => {
      const probes: [string, string, unknown[]][] = [
        ['profiles', 'delete from public.profiles where id = $1', [A.parentId]],
        ['children', 'delete from public.children where id = $1', [A.childId]],
        ['child_interests', 'delete from public.child_interests where child_id = $1', [A.childId]],
        [
          'child_type_progress',
          'delete from public.child_type_progress where child_id = $1',
          [A.childId],
        ],
        ['assignments', 'delete from public.assignments where id = $1', [A.assignmentId]],
        ['submissions', 'delete from public.submissions where id = $1', [A.submissionId]],
        ['submission_assets', 'delete from public.submission_assets where id = $1', [A.assetId]],
        ['assignment_reviews', 'delete from public.assignment_reviews where id = $1', [A.reviewId]],
        ['content_reports', 'delete from public.content_reports where id = $1', [A.reportId]],
      ];
      for (const [table, sql, params] of probes) {
        const r = await asParent(db, B.parentId, sql, params);
        expect(r.rowCount, `${table}: parent B must delete zero of parent A's rows`).toBe(0);
      }

      // And parent A's data is genuinely still there.
      const still = await db.query('select id from public.children where id = $1', [A.childId]);
      expect(still.rowCount).toBe(1);
    });

    it('cannot see parent A private draft templates', async () => {
      await db.query(
        `insert into public.activity_templates
           (slug, type, title, instructions, min_age, max_age, grade_min, grade_max,
            difficulty, estimated_minutes, response_mode, payload, status, source,
            owner_id, approved_by_parent_id, policy_version)
         values ('a-private-draft-' || $2, 'reflection', 'Bản nháp', 'Nội dung đang chờ duyệt.',
                 7, 9, 'grade_2', 'grade_3', 2, 10, 'text', '{}'::jsonb, 'draft', 'ai',
                 $1, $1, 'age-policy@2026-08-25')
         on conflict (slug) do nothing`,
        [A.parentId, RUN],
      );
      const r = await asParent(
        db,
        B.parentId,
        `select id from public.activity_templates where slug = 'a-private-draft-' || $1`,
        [RUN],
      );
      expect(r.rowCount).toBe(0);
    });
  });

  // ===========================================================================
  // Anonymous
  // ===========================================================================
  describe('anonymous access', () => {
    it('is denied on every table covered by the matrix', async () => {
      for (const { table } of COVERED_TABLES) {
        const r = await asAnon(db, `select * from public.${table} limit 1`);
        const denied = r.error !== undefined || r.rowCount === 0;
        expect(denied, `anon must not read ${table} (got ${r.rowCount} rows)`).toBe(true);
      }
    });

    it('cannot insert anywhere', async () => {
      const r = await asAnon(
        db,
        `insert into public.children (parent_id, display_name, birth_year, birth_month, grade)
         values ($1, 'anon', 2018, 1, 'grade_1')`,
        [A.parentId],
      );
      expect(r.error).toBeDefined();
    });

    it('cannot read storage objects', async () => {
      const r = await asAnon(db, `select name from storage.objects limit 1`);
      const denied = r.error !== undefined || r.rowCount === 0;
      expect(denied).toBe(true);
    });
  });

  // ===========================================================================
  // Catalog write protection — requirement 5.
  // ===========================================================================
  describe('curated catalog is read-only for clients', () => {
    it('rejects INSERT, UPDATE and DELETE from an authenticated parent', async () => {
      const insert = await asParent(
        db,
        A.parentId,
        `insert into public.activity_templates
           (slug, type, title, instructions, min_age, max_age, grade_min, grade_max,
            difficulty, estimated_minutes, response_mode, payload, status, source, policy_version)
         values ('client-forged-' || $1, 'reflection', 'Tự tạo', 'Nội dung do client tạo ra.',
                 7, 9, 'grade_2', 'grade_3', 2, 10, 'text', '{}'::jsonb,
                 'approved', 'seed', 'age-policy@2026-08-25')`,
        [RUN],
      );
      expect(insert.error, 'client INSERT into the catalog must be refused').toBeDefined();

      const update = await asParent(
        db,
        A.parentId,
        `update public.activity_templates set title = 'tampered' where id = $1`,
        [A.templateId],
      );
      expect(update.error, 'client UPDATE of the catalog must be refused').toBeDefined();

      const del = await asParent(
        db,
        A.parentId,
        `delete from public.activity_templates where id = $1`,
        [A.templateId],
      );
      expect(del.error, 'client DELETE of the catalog must be refused').toBeDefined();
    });

    it('rejects client writes to the interests lookup', async () => {
      const r = await asParent(
        db,
        A.parentId,
        `insert into public.interests (slug, label_vi) values ('forged-' || $1, 'X')`,
        [RUN],
      );
      expect(r.error).toBeDefined();
    });

    it('audit_events cannot be rewritten or deleted by a client', async () => {
      const own = await db.query(
        `insert into public.audit_events (actor_id, action, subject_type)
         values ($1, 'probe', 'test') returning id`,
        [A.parentId],
      );
      const id = own.rows[0].id as string;

      const update = await asParent(
        db,
        A.parentId,
        `update public.audit_events set action = 'rewritten' where id = $1`,
        [id],
      );
      expect(update.error, 'audit trail must be append-only').toBeDefined();

      const del = await asParent(db, A.parentId, `delete from public.audit_events where id = $1`, [
        id,
      ]);
      expect(del.error, 'audit trail must be append-only').toBeDefined();
    });
  });

  // ===========================================================================
  // FORCE RLS placement
  // ===========================================================================
  describe('FORCE ROW LEVEL SECURITY placement', () => {
    it('is enabled on every table and forced only where justified', async () => {
      const result = await db.query<{
        relname: string;
        relrowsecurity: boolean;
        relforcerowsecurity: boolean;
      }>(
        `select c.relname, c.relrowsecurity, c.relforcerowsecurity
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r'`,
      );

      for (const row of result.rows) {
        expect(row.relrowsecurity, `${row.relname} must have RLS enabled`).toBe(true);
      }

      const forced = result.rows.filter((r) => r.relforcerowsecurity).map((r) => r.relname);
      expect(forced.sort()).toEqual([...FORCED_TABLES].sort());
    });
  });
});
