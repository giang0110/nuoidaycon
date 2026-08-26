/**
 * Keeps the locale catalogues structurally identical.
 *
 * The English catalogue ships with empty strings on purpose (non-goal #13), so
 * this checks SHAPE, not translation completeness: a key added to Vietnamese
 * and forgotten in English is an error; an untranslated English value is not.
 */
import { vi } from '../lib/i18n/messages.vi';
import { en } from '../lib/i18n/messages.en';

function flatten(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

function main(): void {
  const viKeys = new Set(flatten(vi));
  const enKeys = new Set(flatten(en));

  const missingInEn = [...viKeys].filter((k) => !enKeys.has(k)).sort();
  const orphanedInEn = [...enKeys].filter((k) => !viKeys.has(k)).sort();

  if (missingInEn.length > 0 || orphanedInEn.length > 0) {
    console.error('\n✗ i18n catalogues are out of shape.\n');
    for (const k of missingInEn) console.error(`    missing in en:  ${k}`);
    for (const k of orphanedInEn) console.error(`    orphaned in en: ${k}`);
    console.error('');
    process.exit(1);
  }

  console.log(`✓ i18n: ${viKeys.size} keys aligned across vi/en`);
}

main();
