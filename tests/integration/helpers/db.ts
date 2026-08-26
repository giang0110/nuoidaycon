/**
 * Integration-test harness for the database security model.
 *
 * Talks to a DISPOSABLE local PostgreSQL, never a hosted project. Set
 * TEST_DATABASE_URL to enable; without it the database suites skip loudly
 * rather than reporting a false pass.
 *
 *   scripts/local-db.sh up      # start a throwaway cluster and apply migrations
 *   pnpm test:integration
 */
import { Client, type QueryResult } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? '';
export const hasDatabase = TEST_DATABASE_URL.length > 0;

const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase/migrations');
const BOOTSTRAP = resolve(process.cwd(), 'supabase/tests/bootstrap.sql');
const SEED_DIR = resolve(process.cwd(), 'supabase/seed');

export async function connectAdmin(): Promise<Client> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  return client;
}

/**
 * Apply the local shim and every migration, in filename order.
 *
 * Test files run in separate workers against the same database, so this takes
 * a session-level advisory lock: concurrent DDL would otherwise fail with
 * "tuple concurrently updated". The migrations are idempotent, so whoever
 * arrives second simply re-applies them harmlessly.
 */
const SCHEMA_LOCK_KEY = 20260826;

export async function applySchema(client: Client): Promise<string[]> {
  await client.query('select pg_advisory_lock($1)', [SCHEMA_LOCK_KEY]);
  try {
    await client.query(readFileSync(BOOTSTRAP, 'utf8'));
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      await client.query(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'));
    }
    // Reference data the application expects to exist.
    for (const seed of readdirSync(SEED_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      await client.query(readFileSync(resolve(SEED_DIR, seed), 'utf8'));
    }
    return files;
  } finally {
    await client.query('select pg_advisory_unlock($1)', [SCHEMA_LOCK_KEY]);
  }
}

export interface ActorResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
  error?: { message: string; code?: string };
}

/**
 * Run SQL exactly as a Supabase client would: as the `authenticated` role with
 * the request's JWT claims set, or as `anon` with none. RLS therefore applies
 * the same way it does in production — the superuser connection is only the
 * transport.
 */
async function runAs(
  client: Client,
  role: 'authenticated' | 'anon',
  uid: string | null,
  sql: string,
  params: unknown[] = [],
  commit = true,
): Promise<ActorResult> {
  try {
    await client.query('begin');
    await client.query(`set local role ${role}`);
    if (uid) {
      await client.query('select set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify({ sub: uid, role }),
      ]);
    } else {
      await client.query('select set_config($1, $2, true)', ['request.jwt.claims', '']);
    }
    const result: QueryResult = await client.query(sql, params);
    await client.query(commit ? 'commit' : 'rollback');
    return { rows: result.rows, rowCount: result.rowCount ?? 0 };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    const err = error as { message: string; code?: string };
    return { rows: [], rowCount: 0, error: { message: err.message, code: err.code } };
  }
}

export const asParent = (client: Client, uid: string, sql: string, params?: unknown[]) =>
  runAs(client, 'authenticated', uid, sql, params);

export const asAnon = (client: Client, sql: string, params?: unknown[]) =>
  runAs(client, 'anon', null, sql, params);

/** A fully populated tenant: parent → child → assignment → submission → asset. */
export interface Tenant {
  parentId: string;
  childId: string;
  templateId: string;
  assignmentId: string;
  submissionId: string;
  assetId: string;
  reviewId: string;
  reportId: string;
  auditId: string;
  interestId: string;
  storagePath: string;
}

let templateCounter = 0;

/** Seed one tenant using the admin connection (as the seed loader would). */
export async function seedTenant(client: Client, label: string): Promise<Tenant> {
  const parentId = randomUUID();
  await client.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, $2, jsonb_build_object('display_name', $3::text))`,
    [parentId, `${label}-${parentId}@example.test`, `Parent ${label}`],
  );

  const child = await client.query(
    `insert into public.children (parent_id, display_name, birth_year, birth_month, grade)
     values ($1, $2, 2018, 6, 'grade_2') returning id`,
    [parentId, `Bé ${label}`],
  );
  const childId = child.rows[0].id as string;

  const slug = `probe-activity-${(templateCounter += 1)}-${Date.now()}`;
  const template = await client.query(
    `insert into public.activity_templates
       (slug, type, title, instructions, min_age, max_age, grade_min, grade_max,
        difficulty, estimated_minutes, response_mode, payload, status, source, policy_version)
     values ($1, 'reflection', 'Câu hỏi suy ngẫm', 'Con hãy trả lời câu hỏi sau nhé.',
             7, 9, 'grade_2', 'grade_3', 2, 10, 'text',
             '{"theme":"kindness"}'::jsonb, 'approved', 'seed', 'age-policy@2026-08-25')
     returning id`,
    [slug],
  );
  const templateId = template.rows[0].id as string;

  const assignment = await client.query(
    `insert into public.assignments
       (child_id, template_id, assigned_by, difficulty_at_assignment, content_snapshot)
     values ($1, $2, $3, 2, '{"title":"snapshot","schemaVersion":1}'::jsonb)
     returning id`,
    [childId, templateId, parentId],
  );
  const assignmentId = assignment.rows[0].id as string;

  const submission = await client.query(
    `insert into public.submissions (assignment_id, answers)
     values ($1, '{"text":{"q1":"con nghĩ là..."}}'::jsonb) returning id`,
    [assignmentId],
  );
  const submissionId = submission.rows[0].id as string;

  const storagePath = `${parentId}/${childId}/${submissionId}/work.jpg`;
  const asset = await client.query(
    `insert into public.submission_assets (submission_id, storage_path, mime_type, size_bytes)
     values ($1, $2, 'image/jpeg', 20480) returning id`,
    [submissionId, storagePath],
  );

  const review = await client.query(
    `insert into public.assignment_reviews (assignment_id, reviewer_id, verdict)
     values ($1, $2, 'just_right') returning id`,
    [assignmentId, parentId],
  );

  const report = await client.query(
    `insert into public.content_reports (reporter_id, template_id, reason)
     values ($1, $2, 'confusing') returning id`,
    [parentId, templateId],
  );

  const audit = await client.query(
    `insert into public.audit_events (actor_id, action, subject_type, subject_id)
     values ($1, 'assign', 'assignment', $2) returning id`,
    [parentId, assignmentId],
  );

  const interest = await client.query(
    `insert into public.interests (slug, label_vi)
     values ($1, 'Động vật') on conflict (slug) do update set label_vi = excluded.label_vi
     returning id`,
    [`animals-${label}`],
  );
  const interestId = interest.rows[0].id as string;
  await client.query(
    `insert into public.child_interests (child_id, interest_id) values ($1, $2)
     on conflict do nothing`,
    [childId, interestId],
  );

  await client.query(
    `insert into storage.objects (bucket_id, name, owner) values ('submissions', $1, $2)
     on conflict do nothing`,
    [storagePath, parentId],
  );

  return {
    parentId,
    childId,
    templateId,
    assignmentId,
    submissionId,
    assetId: asset.rows[0].id as string,
    reviewId: review.rows[0].id as string,
    reportId: report.rows[0].id as string,
    auditId: audit.rows[0].id as string,
    interestId,
    storagePath,
  };
}
