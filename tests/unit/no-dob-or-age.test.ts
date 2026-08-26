/**
 * Phase 3 "done when": no date-of-birth field and no persisted age exist
 * anywhere in the codebase (principle P5, CHILD_SAFETY.md §3).
 *
 * A grep test rather than a type test, because the risk is someone ADDING a
 * field in a migration, a form, or an entity — none of which the compiler
 * would object to.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOTS = ['app', 'lib', 'components', 'supabase/migrations', 'content', 'scripts'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.sql']);

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(walk(full));
    else if (EXTENSIONS.has(extname(full))) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap((root) => {
  try {
    return walk(root);
  } catch {
    return [];
  }
});

/** Identifier-shaped matches only, so prose in a comment does not trip this. */
const BANNED_IDENTIFIERS = [
  /\bdate_of_birth\b/,
  /\bdateOfBirth\b/,
  /\bbirth_date\b/,
  /\bbirthDate\b/,
  /\bbirthdate\b/i,
  /\bdob\b/i,
];

/** An `age` COLUMN or a persisted `age` field — not a derived local. */
const PERSISTED_AGE = [
  /\bage\s+(int|integer|smallint|numeric)\b/i, // SQL column definition
  /^\s*age\s*:\s*number;?\s*$/m, // an `age` field on an interface
  /\bage:\s*z\.(coerce\.)?number/, // an `age` field in a schema
];

describe('no exact date of birth anywhere', () => {
  it('scans a non-trivial number of files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(BANNED_IDENTIFIERS.map((r) => [r.source, r] as const))(
    'has no identifier matching %s',
    (_label, pattern) => {
      const hits = files.filter((f) => pattern.test(readFileSync(f, 'utf8')));
      expect(hits, `date-of-birth identifier found in: ${hits.join(', ')}`).toEqual([]);
    },
  );
});

describe('age is never persisted', () => {
  it.each(PERSISTED_AGE.map((r) => [r.source, r] as const))(
    'has no persisted age matching %s',
    (_label, pattern) => {
      const hits = files.filter((f) => pattern.test(readFileSync(f, 'utf8')));
      expect(hits, `persisted age found in: ${hits.join(', ')}`).toEqual([]);
    },
  );

  it('keeps min_age/max_age on templates, which describe CONTENT not a child', () => {
    // These are the audience range of an activity, not a stored child age.
    const initSql = readFileSync('supabase/migrations/20260826000001_init.sql', 'utf8');
    expect(initSql).toMatch(/min_age\s+int/);
    expect(initSql).not.toMatch(/create table[\s\S]*children[\s\S]*?\bage\s+int/i);
  });
});

describe('no child credentials anywhere', () => {
  it.each([/child_password/i, /childPassword/, /child_email/i, /childEmail/, /child_token/i])(
    'has no identifier matching %s',
    (pattern) => {
      const hits = files.filter((f) => pattern.test(readFileSync(f, 'utf8')));
      expect(hits, `child credential found in: ${hits.join(', ')}`).toEqual([]);
    },
  );
});
