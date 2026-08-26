/**
 * Runs the L1–L3 validation layers over every seeded activity and prints the
 * coverage matrix (ACTIVITY_MODEL.md §6, §10).
 *
 * Same code path as the database write path and the Phase 8 AI pipeline — one
 * implementation, not three. Fails closed: any failure at any layer exits
 * non-zero, and CI blocks the merge.
 */
import { ALL_SEEDS } from '../content/seeds';
import { validateActivity } from '../lib/domain/activity/validate';
import { ACTIVITY_TYPES } from '../lib/domain/entities';

const BANDS = ['early', 'lower_primary', 'upper_primary', 'preteen'] as const;
const MVP_TARGET_MIN = 20;

function main(): void {
  let failed = 0;
  const seen = new Set<string>();
  const matrix = new Map<string, number>();

  for (const seed of ALL_SEEDS) {
    const label = `${seed.type}/${seed.slug}`;

    if (seen.has(seed.slug)) {
      console.error(`✗ ${label}: duplicate slug`);
      failed += 1;
      continue;
    }
    seen.add(seed.slug);

    const result = validateActivity(seed);
    if (!result.ok) {
      failed += 1;
      console.error(`\n✗ ${label}`);
      for (const failure of result.failures) {
        console.error(`    [${failure.layer}] ${failure.rule} @ ${failure.path}`);
        console.error(`        ${failure.detail}`);
      }
      continue;
    }

    const key = `${result.activity.type}|${result.activity.safety.ageBand}|${result.activity.difficulty}`;
    matrix.set(key, (matrix.get(key) ?? 0) + 1);
  }

  console.log('\n  Coverage — activity type × age band (difficulty in cells)');
  console.log('  ' + '─'.repeat(74));
  console.log('  ' + 'type'.padEnd(22) + BANDS.map((b) => b.padEnd(14)).join(''));
  console.log('  ' + '─'.repeat(74));

  for (const type of ACTIVITY_TYPES) {
    const cells = BANDS.map((band) => {
      const levels = [1, 2, 3, 4, 5]
        .filter((d) => matrix.has(`${type}|${band}|${d}`))
        .map((d) => `d${d}`);
      return (levels.length > 0 ? levels.join(' ') : '·').padEnd(14);
    });
    console.log('  ' + type.padEnd(22) + cells.join(''));
  }

  console.log('  ' + '─'.repeat(74));

  const total = ALL_SEEDS.length;
  const typesCovered = new Set(ALL_SEEDS.map((s) => s.type)).size;
  console.log(`\n  total activities : ${total}   (MVP target: ${MVP_TARGET_MIN}–25)`);
  console.log(`  activity types   : ${typesCovered}/6`);

  const problems: string[] = [];
  if (failed > 0) problems.push(`${failed} activities failed validation`);
  if (typesCovered < 6) problems.push(`only ${typesCovered}/6 activity types have content`);
  if (total < MVP_TARGET_MIN) {
    problems.push(`${total} activities is below the MVP target of ${MVP_TARGET_MIN}`);
  }

  if (problems.length > 0) {
    console.error('\n✗ validate:content failed:');
    for (const problem of problems) console.error(`    - ${problem}`);
    console.error('');
    process.exit(1);
  }

  console.log('\n✓ validate:content: all activities pass L1–L3\n');
}

main();
