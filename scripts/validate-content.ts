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
import {
  assessCoverage,
  DEVELOPMENT_FLOOR,
  LAUNCH_FLOOR,
  type CoverageInput,
} from '../lib/domain/content/coverage';

/**
 * `--launch` turns the launch floor from a warning into a failure. Run it as
 * the release gate; the default run keeps the build usable while the catalogue
 * is still being written.
 */
const LAUNCH_GATE = process.argv.includes('--launch');

const BANDS = ['early', 'lower_primary', 'upper_primary', 'preteen'] as const;
const LAUNCH_CATALOG_TARGET = LAUNCH_FLOOR * BANDS.length;

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
  console.log(
    `\n  total activities : ${total}   (launch catalog target: ${LAUNCH_CATALOG_TARGET})`,
  );
  console.log(`  activity types   : ${typesCovered}/6`);

  /**
   * The headline total above is the number that misleads: the bands are
   * disjoint, so no child ever draws from more than one of them. What follows
   * is what a child of each age actually gets.
   */
  const report = assessCoverage(
    ALL_SEEDS.map((s) => ({ ageBand: s.safety.ageBand, type: s.type }) as CoverageInput),
  );

  console.log('\n  Depth per age band — what ONE child of that age actually gets');
  console.log('  ' + '─'.repeat(74));
  console.log(
    '  ' +
      'band'.padEnd(16) +
      'activities'.padEnd(13) +
      'types'.padEnd(9) +
      'days of supply'.padEnd(17) +
      'to launch floor',
  );
  for (const [ageBand, cov] of Object.entries(report.bands)) {
    const gap = Math.max(0, LAUNCH_FLOOR - cov.count);
    console.log(
      '  ' +
        ageBand.padEnd(16) +
        String(cov.count).padEnd(13) +
        `${cov.typeCount}/6`.padEnd(9) +
        `~${cov.daysOfSupply} ngày`.padEnd(17) +
        (gap === 0 ? '✓ ready' : `+${gap}`),
    );
  }
  console.log('  ' + '─'.repeat(74));
  console.log(
    `\n  launch floor     : ${LAUNCH_FLOOR} per band   ` +
      `(still to author: ${report.totalMissingForLaunch})`,
  );
  console.log(
    `  launch-ready     : ${report.launchReadyBands.length > 0 ? report.launchReadyBands.join(', ') : 'none yet'}`,
  );

  const problems: string[] = [];
  if (failed > 0) problems.push(`${failed} activities failed validation`);
  if (typesCovered < 6) problems.push(`only ${typesCovered}/6 activity types have content`);
  for (const s of report.developmentShortfalls) {
    problems.push(
      `band ${s.ageBand} has ${s.have} activities, below the development floor of ${DEVELOPMENT_FLOOR}`,
    );
  }
  if (LAUNCH_GATE) {
    for (const s of report.launchShortfalls) {
      problems.push(
        `band ${s.ageBand} has ${s.have} activities; the launch floor is ${s.need} (needs ${s.missing} more)`,
      );
    }
  } else if (!report.meetsLaunchFloor) {
    console.warn(
      `\n  ⚠ ${report.launchShortfalls.length} band(s) are below the launch floor. ` +
        `A child in the thinnest band runs out in ~${Math.min(...report.launchShortfalls.map((s) => s.have))} days.`,
    );
    console.warn('    Run `pnpm validate:content:launch` to gate on this before opening up.');
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
