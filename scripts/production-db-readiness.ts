import { pathToFileURL } from 'node:url';
import { Client } from 'pg';
import { ALL_SEEDS } from '../content/seeds';
import {
  evaluateDatabaseReadiness,
  type DatabaseReadinessSnapshot,
  type ExpectedCatalogRow,
} from '../lib/domain/readiness/database';
import { buildReadinessReport } from '../lib/domain/readiness/report';

export const READINESS_SELECT_QUERIES = {
  migrationTableExists: `select to_regclass('supabase_migrations.schema_migrations') is not null as "exists"`,
  migrations: `select version::text as version from supabase_migrations.schema_migrations order by version`,
  tables: `select c.relname as name,
                  c.relrowsecurity as rls,
                  c.relforcerowsecurity as "forceRls"
             from pg_class c
             join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relkind = 'r'
            order by c.relname`,
  grants: `select grantee,
                  table_name as "table",
                  privilege_type as privilege
             from information_schema.role_table_grants
            where table_schema = 'public'
              and grantee in ('anon', 'authenticated')
            order by grantee, table_name, privilege_type`,
  functions: `select n.nspname as schema,
                     p.proname as name,
                     p.prosecdef as "securityDefiner",
                     has_function_privilege('anon', p.oid, 'EXECUTE') as "anonExecute",
                     has_function_privilege('authenticated', p.oid, 'EXECUTE') as "authenticatedExecute"
                from pg_proc p
                join pg_namespace n on n.oid = p.pronamespace
               where n.nspname in ('public', 'private')
                 and p.proname in (
                   'assert_template_assignable',
                   'handle_new_user',
                   'init_child_type_progress',
                   'owns_assignment',
                   'owns_child',
                   'owns_submission'
                 )
               order by n.nspname, p.proname`,
  bucket: `select id,
                  public,
                  file_size_limit as "fileSizeLimit",
                  allowed_mime_types as "allowedMimeTypes"
             from storage.buckets
            where id = 'submissions'`,
  catalog: `select slug,
                   type::text as type,
                   status::text as status,
                   source::text as source,
                   min_age as "minAge",
                   max_age as "maxAge",
                   response_mode::text as "responseMode"
              from public.activity_templates
             where source = 'seed'
             order by slug`,
  counts: `select (select count(*) from auth.users)::int as "authUsers",
                  (select count(*) from public.profiles)::int as profiles,
                  (select count(*) from public.children)::int as children`,
} as const;

function expectedCatalog(): ExpectedCatalogRow[] {
  return ALL_SEEDS.map((seed) => ({
    slug: seed.slug,
    type: seed.type,
    status: seed.status,
    source: seed.provenance.source,
    minAge: seed.audience.minAge,
    maxAge: seed.audience.maxAge,
    responseMode: seed.response.mode,
    ageBand: seed.safety.ageBand,
  }));
}

export async function collectDatabaseSnapshot(db: Client): Promise<DatabaseReadinessSnapshot> {
  const migrationTable = await db.query<{ exists: boolean }>(
    READINESS_SELECT_QUERIES.migrationTableExists,
  );
  const migrationTableExists = migrationTable.rows[0]?.exists === true;
  const migrations = migrationTableExists
    ? await db.query<{ version: string }>(READINESS_SELECT_QUERIES.migrations)
    : { rows: [] as { version: string }[] };

  const [tables, grants, functions, bucket, catalog, counts] = await Promise.all([
    db.query<DatabaseReadinessSnapshot['tables'][number]>(READINESS_SELECT_QUERIES.tables),
    db.query<DatabaseReadinessSnapshot['grants'][number]>(READINESS_SELECT_QUERIES.grants),
    db.query<DatabaseReadinessSnapshot['functions'][number]>(READINESS_SELECT_QUERIES.functions),
    db.query<{
      id: string;
      public: boolean;
      fileSizeLimit: number | string | null;
      allowedMimeTypes: string[] | null;
    }>(READINESS_SELECT_QUERIES.bucket),
    db.query<DatabaseReadinessSnapshot['catalog'][number]>(READINESS_SELECT_QUERIES.catalog),
    db.query<DatabaseReadinessSnapshot['counts']>(READINESS_SELECT_QUERIES.counts),
  ]);

  const bucketRow = bucket.rows[0];
  return {
    migrationTableExists,
    migrationVersions: migrations.rows.map((row) => row.version),
    tables: tables.rows,
    grants: grants.rows,
    functions: functions.rows,
    bucket: bucketRow
      ? {
          id: bucketRow.id,
          public: bucketRow.public,
          fileSizeLimit: bucketRow.fileSizeLimit === null ? null : Number(bucketRow.fileSizeLimit),
          allowedMimeTypes: bucketRow.allowedMimeTypes,
        }
      : null,
    catalog: catalog.rows,
    counts: counts.rows[0] ?? { authUsers: 0, profiles: 0, children: 0 },
  };
}

export async function runDatabaseReadiness(connectionString: string) {
  const db = new Client({ connectionString });
  await db.connect();

  try {
    await db.query('begin transaction read only');
    const snapshot = await collectDatabaseSnapshot(db);
    return buildReadinessReport(
      evaluateDatabaseReadiness(snapshot, expectedCatalog()),
      new Date().toISOString(),
    );
  } finally {
    await db.query('rollback').catch(() => undefined);
    await db.end();
  }
}

function printHuman(report: Awaited<ReturnType<typeof runDatabaseReadiness>>): void {
  console.log('\n  Production database readiness');
  console.log('  ' + '─'.repeat(66));
  for (const check of report.checks) {
    const icon = check.status === 'pass' ? '✓' : '✗';
    console.log(`  ${icon} ${check.label}${check.detail ? ` — ${check.detail}` : ''}`);
  }
  console.log('  ' + '─'.repeat(66));
  console.log(`  machine ready: ${report.machineReady ? 'yes' : 'no'}\n`);
}

async function main(): Promise<void> {
  const connectionString = process.env.PRODUCTION_DATABASE_URL ?? '';
  const asJson = process.argv.includes('--json');

  if (!connectionString) {
    console.error('PRODUCTION_DATABASE_URL is required');
    process.exitCode = 1;
    return;
  }

  try {
    const report = await runDatabaseReadiness(connectionString);
    if (asJson) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
    if (!report.machineReady) process.exitCode = 1;
  } catch {
    console.error('database readiness failed');
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  void main();
}
