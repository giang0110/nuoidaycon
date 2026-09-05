/**
 * Phase 4: the seeded catalog as it actually lands in the database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Client } from 'pg';
import {
  hasDatabase,
  connectAdmin,
  applySchema,
  asParent,
  asAnon,
  seedTenant,
  PROBE_TEMPLATE_PREFIX,
} from './helpers/db';
import { validateActivity } from '@/lib/domain/activity/validate';
import { toChildView } from '@/lib/domain/activity/child-view';
import { ALL_SEEDS } from '@/content/seeds';

const describeDb = hasDatabase ? describe : describe.skip;

describeDb('seeded catalog', () => {
  /**
   * The integration suites share one database, so other tests leave probe
   * templates behind. Every assertion here is scoped to real catalog content.
   */
  const REAL = `slug not like '${PROBE_TEMPLATE_PREFIX}%'`;

  let db: Client;
  let parentId: string;

  beforeAll(async () => {
    db = await connectAdmin();
    await applySchema(db);
    const tenant = await seedTenant(db, 'catalog');
    parentId = tenant.parentId;

    // Load the real catalog exactly as scripts/seed-db.ts does.
    for (const seed of ALL_SEEDS) {
      const result = validateActivity(seed);
      if (!result.ok) throw new Error(`seed ${seed.slug} failed validation`);
      const a = result.activity;
      await db.query(
        `insert into public.activity_templates
           (id, slug, type, locale, title, instructions, min_age, max_age, grade_min, grade_max,
            difficulty, estimated_minutes, interest_tags, response_mode, payload, status, source,
            schema_version, policy_version, provenance, version)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'seed',$17,$18,$19,$20)
         on conflict (slug) do update set payload = excluded.payload`,
        [
          a.id,
          a.slug,
          a.type,
          a.locale,
          a.title,
          a.instructions,
          a.audience.minAge,
          a.audience.maxAge,
          a.audience.gradeMin,
          a.audience.gradeMax,
          a.difficulty,
          a.estimatedMinutes,
          a.interestTags,
          a.response.mode,
          JSON.stringify(a),
          a.status,
          a.schemaVersion,
          a.safety.policyVersion,
          JSON.stringify(a.provenance),
          a.version,
        ],
      );
    }
  }, 90_000);

  afterAll(async () => {
    await db?.end();
  });

  it('seeds exactly 60 original launch activities', async () => {
    const r = await db.query<{ n: string }>(
      `select count(*)::text as n from public.activity_templates where source = 'seed' and ${REAL}`,
    );
    expect(Number(r.rows[0]!.n)).toBe(60);
  });

  it('covers all six activity types', async () => {
    const r = await db.query<{ type: string }>(
      `select distinct type from public.activity_templates where source = 'seed' and ${REAL}`,
    );
    expect(r.rows).toHaveLength(6);
  });

  it('is entirely seed-sourced, global and approved — no AI, no owner', async () => {
    const r = await db.query<{ n: string }>(
      `select count(*)::text as n from public.activity_templates
        where ${REAL}
          and (source <> 'seed' or owner_id is not null or status <> 'approved'
               or approved_by_parent_id is not null)`,
    );
    expect(Number(r.rows[0]!.n)).toBe(0);
  });

  it('stores the complete validated Activity document, not a reconstruction', async () => {
    const r = await db.query<{ payload: unknown }>(
      `select payload from public.activity_templates where source = 'seed' and ${REAL}`,
    );
    for (const row of r.rows) {
      const result = validateActivity(row.payload);
      expect(result.ok, `stored document failed re-validation`).toBe(true);
    }
  });

  it('every stored activity survives the child-view projection with no answer keys', async () => {
    const r = await db.query<{ payload: unknown }>(
      `select payload from public.activity_templates where source = 'seed' and ${REAL}`,
    );
    for (const row of r.rows) {
      const result = validateActivity(row.payload);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;

      const serialised = JSON.stringify(toChildView(result.activity));
      for (const forbidden of [
        'answerKey',
        'rationale',
        'exemplarAnswer',
        'mustMention',
        'isConstructive',
      ]) {
        expect(serialised, `${forbidden} leaked for ${result.activity.slug}`).not.toContain(
          forbidden,
        );
      }
    }
  });

  it('is readable by any authenticated parent', async () => {
    const r = await asParent(
      db,
      parentId,
      `select id from public.activity_templates where ${REAL}`,
    );
    expect(r.rowCount).toBe(60);
  });

  it('is not readable by anon', async () => {
    const r = await asAnon(db, `select id from public.activity_templates where ${REAL}`);
    expect(r.error !== undefined || r.rowCount === 0).toBe(true);
  });

  it('cannot be modified by a parent', async () => {
    // Phase 8 grants DML on this table so parents can own AI drafts, so seed
    // rows are refused by POLICY (owner_id is null, source is not 'ai') rather
    // than by privilege. Zero rows affected is the refusal.
    const update = await asParent(
      db,
      parentId,
      `update public.activity_templates set title = 'x' where source = 'seed' and ${REAL}`,
    );
    expect(update.error ?? update.rowCount).toBe(0);

    const untouched = await db.query<{ n: string }>(
      `select count(*)::text as n from public.activity_templates
        where source = 'seed' and title = 'x'`,
    );
    expect(Number(untouched.rows[0]!.n)).toBe(0);
  });

  it('every situation_judgment carries a trusted-adult path', async () => {
    const r = await db.query<{ payload: { payload: { trustedAdultPath?: unknown } } }>(
      `select payload from public.activity_templates where type = 'situation_judgment' and ${REAL}`,
    );
    expect(r.rowCount).toBeGreaterThan(0);
    for (const row of r.rows) {
      expect(row.payload.payload.trustedAdultPath).toBeDefined();
    }
  });
});
