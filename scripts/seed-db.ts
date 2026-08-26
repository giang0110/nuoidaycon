/**
 * Loads the validated catalog into `activity_templates`.
 *
 * Runs as the table OWNER (or service_role) — this is one of the only two
 * places allowed to use administrative credentials, and it is a script, never a
 * request path (decision A3). Clients hold no INSERT privilege on the catalog
 * at all, which is what makes it read-only for them.
 *
 * Every activity is re-validated through L1–L3 before it is written, so a bad
 * seed cannot reach the database even if CI were skipped.
 */
import { Client } from 'pg';
import { ALL_SEEDS } from '../content/seeds';
import { validateActivity } from '../lib/domain/activity/validate';
import type { Activity } from '../lib/domain/activity/schema';

const DATABASE_URL = process.env.SEED_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? '';

function responseModeOf(activity: Activity): string {
  return activity.response.mode;
}

async function main(): Promise<void> {
  if (!DATABASE_URL) {
    console.error(
      '✗ SEED_DATABASE_URL is not set.\n' +
        '  Point it at a local database (pnpm db:up prints one). Never a production project.',
    );
    process.exit(1);
  }

  const validated: Activity[] = [];
  for (const seed of ALL_SEEDS) {
    const result = validateActivity(seed);
    if (!result.ok) {
      console.error(`✗ ${seed.slug} failed validation — refusing to seed.`);
      for (const f of result.failures) console.error(`    [${f.layer}] ${f.rule}: ${f.detail}`);
      process.exit(1);
    }
    validated.push(result.activity);
  }

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  let inserted = 0;
  try {
    for (const a of validated) {
      await client.query(
        `insert into public.activity_templates
           (id, slug, type, locale, title, instructions, min_age, max_age,
            grade_min, grade_max, difficulty, estimated_minutes, interest_tags,
            response_mode, payload, status, source, owner_id, approved_by_parent_id,
            schema_version, policy_version, provenance, version)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'seed',null,null,$17,$18,$19,$20)
         on conflict (slug) do update set
           title = excluded.title,
           instructions = excluded.instructions,
           payload = excluded.payload,
           difficulty = excluded.difficulty,
           interest_tags = excluded.interest_tags,
           version = excluded.version`,
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
          responseModeOf(a),
          // The complete validated Activity document. The denormalised columns
          // above exist for indexing and database constraints; this is the
          // source of truth, so nothing has to be reconstructed on read.
          JSON.stringify(a),
          a.status,
          a.schemaVersion,
          a.safety.policyVersion,
          JSON.stringify(a.provenance),
          a.version,
        ],
      );
      inserted += 1;
    }
    console.log(`✓ seeded ${inserted} activities into activity_templates`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
