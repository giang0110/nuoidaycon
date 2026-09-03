/**
 * Product metrics — the answer to "is anybody coming back, and do they run out?"
 *
 * A SCRIPT, not a page, and deliberately so:
 *
 *  * RLS confines a parent to their own rows, so an in-app screen could only
 *    ever show one family their own numbers. Product-wide aggregates need
 *    administrative credentials.
 *  * Decision A3 bars those credentials from every request path. `scripts/` is
 *    where they are allowed to live, alongside the migration and seed loaders.
 *
 * Run it against staging or production from a laptop:
 *
 *   METRICS_DATABASE_URL=<connection string> pnpm metrics
 *   METRICS_DATABASE_URL=<connection string> pnpm metrics --json
 *
 * The aggregation itself is in lib/domain/metrics/product.ts and is unit
 * tested; this file only fetches rows and prints. It reads ids, timestamps and
 * statuses — never a name, an email, a birth month, or a child's answer — so
 * the output is safe to paste into a planning document.
 */
import { Client } from 'pg';
import {
  summariseProduct,
  type MetricsInput,
  type BandSupply,
} from '../lib/domain/metrics/product';
import { assessCoverage, BANDS, type AgeBand } from '../lib/domain/content/coverage';
import { ALL_SEEDS } from '../content/seeds';

const DATABASE_URL = process.env.METRICS_DATABASE_URL ?? '';
const AS_JSON = process.argv.includes('--json');

/** How many activities each band currently offers, straight from the catalogue. */
function bandSupply(): BandSupply {
  const report = assessCoverage(
    ALL_SEEDS.map((s) => ({ ageBand: s.safety.ageBand as AgeBand, type: s.type })),
  );
  return {
    early: report.bands.early.count,
    lower_primary: report.bands.lower_primary.count,
    upper_primary: report.bands.upper_primary.count,
    preteen: report.bands.preteen.count,
  };
}

async function fetchRows(db: Client): Promise<MetricsInput> {
  const families = await db.query<{ parentId: string; createdAt: string }>(
    `select id as "parentId", created_at as "createdAt" from public.profiles`,
  );
  const children = await db.query<{ childId: string; parentId: string; ageBand: AgeBand }>(
    `select c.id as "childId",
            c.parent_id as "parentId",
            case
              when date_part('year', age(make_date(c.birth_year, c.birth_month, 1))) <= 6 then 'early'
              when date_part('year', age(make_date(c.birth_year, c.birth_month, 1))) <= 8 then 'lower_primary'
              when date_part('year', age(make_date(c.birth_year, c.birth_month, 1))) <= 10 then 'upper_primary'
              else 'preteen'
            end as "ageBand"
       from public.children c
      where c.archived_at is null`,
  );
  const assignments = await db.query<MetricsInput['assignments'][number]>(
    `select child_id as "childId", assigned_at as "assignedAt", status::text as status
       from public.assignments`,
  );

  return {
    families: families.rows,
    children: children.rows,
    assignments: assignments.rows,
  };
}

function pct(value: number | null): string {
  return value === null ? 'chưa có dữ liệu' : `${(value * 100).toFixed(0)}%`;
}

async function main(): Promise<void> {
  if (!DATABASE_URL) {
    console.error(
      '✗ METRICS_DATABASE_URL is not set.\n' +
        '  Point it at the staging or production connection string, from a laptop.\n' +
        '  This value must never be set in Vercel (decision A3).',
    );
    process.exit(1);
  }

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  try {
    const report = summariseProduct(await fetchRows(db), new Date(), bandSupply());

    if (AS_JSON) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log('\n  Product metrics');
    console.log('  ' + '─'.repeat(66));
    console.log(`  gia đình              : ${report.familiesTotal}`);
    console.log(`  trẻ                   : ${report.childrenTotal}`);
    console.log(`  hoạt động đã giao     : ${report.assignmentsTotal}`);
    console.log('  ' + '─'.repeat(66));
    console.log(`  hoạt động 7 ngày      : ${report.activeFamilies7d} gia đình`);
    console.log(`  hoạt động 28 ngày     : ${report.activeFamilies28d} gia đình`);
    console.log(`  tỷ lệ hoàn thành      : ${pct(report.completionRate)}`);
    console.log(
      `  quay lại sau tuần 1   : ${pct(report.returnedAfterFirstWeek)}   ← chỉ số quyết định`,
    );
    console.log('  ' + '─'.repeat(66));

    const supply = bandSupply();
    console.log('\n  Cạn thư viện — trẻ đã xem bao nhiêu phần nhóm tuổi của mình');
    for (const band of BANDS) {
      const inBand = report.exhaustion.filter((r) => r.ageBand === band);
      if (inBand.length === 0) continue;
      const worst = inBand[0];
      console.log(
        `  ${band.padEnd(16)} ${String(supply[band]).padStart(2)} hoạt động   ` +
          `cao nhất: ${worst?.share === null ? 'n/a' : pct(worst?.share ?? null)}`,
      );
    }
    console.log(
      `\n  trẻ đã xem ≥80% nhóm tuổi của mình: ${report.childrenNearingExhaustion}` +
        (report.childrenNearingExhaustion > 0 ? '   ⚠ những em này sắp thấy bài lặp lại' : ''),
    );
    console.log('');
  } finally {
    await db.end();
  }
}

main().catch((error: unknown) => {
  console.error(`✗ metrics failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exit(1);
});
