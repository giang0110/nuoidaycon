/**
 * Runs the L1–L3 validation layers over every seeded activity and reports the
 * coverage matrix (docs/product/ACTIVITY_MODEL.md §6, §10).
 *
 * Phase 1 placeholder: the canonical schema and the validators land in Phase 4.
 * This script exists now so the CI job, the pnpm script, and the verify chain
 * are wired from the start rather than bolted on later.
 */
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SEED_ROOT = resolve(process.cwd(), 'content/seeds/vi');

const ACTIVITY_TYPES = [
  'handwriting',
  'drawing_prompt',
  'story_comprehension',
  'story_summary',
  'reflection',
  'situation_judgment',
] as const;

function main(): void {
  if (!existsSync(SEED_ROOT)) {
    console.error(`✗ seed root missing: ${SEED_ROOT}`);
    process.exit(1);
  }

  let total = 0;
  const counts = new Map<string, number>();

  for (const type of ACTIVITY_TYPES) {
    const dir = resolve(SEED_ROOT, type);
    const files = existsSync(dir)
      ? readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.startsWith('index'))
      : [];
    counts.set(type, files.length);
    total += files.length;
  }

  console.log('\n  Seed coverage by activity type');
  console.log('  ──────────────────────────────────────');
  for (const type of ACTIVITY_TYPES) {
    console.log(`  ${type.padEnd(22)} ${String(counts.get(type) ?? 0).padStart(3)}`);
  }
  console.log('  ──────────────────────────────────────');
  console.log(`  ${'total'.padEnd(22)} ${String(total).padStart(3)}   (MVP target: 20–25)\n`);

  if (total === 0) {
    console.log('✓ validate:content: no seeds yet — schema validation lands in Phase 4.\n');
    return;
  }

  console.error(
    '✗ Seed files exist but the canonical schema is not implemented yet.\n' +
      '  Implement lib/domain/activity before adding content (Phase 4a precedes 4c).\n',
  );
  process.exit(1);
}

main();
