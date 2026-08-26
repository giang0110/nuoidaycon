import { describe, it, expect } from 'vitest';
import {
  childProfileSchema,
  childProfileSchemaWithTime,
  isBirthMonthYearInFuture,
  AVATAR_KEYS,
  MAX_INTERESTS,
} from '@/lib/domain/child-profile';
import { randomUUID } from 'node:crypto';

const valid = {
  displayName: 'Bé Bi',
  birthYear: 2018,
  birthMonth: 6,
  grade: 'grade_2',
  avatarKey: 'cat' as const,
  interestIds: [randomUUID(), randomUUID(), randomUUID()],
};

describe('childProfileSchema', () => {
  it('accepts a complete profile', () => {
    expect(childProfileSchema.parse(valid).displayName).toBe('Bé Bi');
  });

  it('trims the nickname', () => {
    expect(childProfileSchema.parse({ ...valid, displayName: '  Bé Bi  ' }).displayName).toBe(
      'Bé Bi',
    );
  });

  it('rejects an empty nickname', () => {
    expect(childProfileSchema.safeParse({ ...valid, displayName: '   ' }).success).toBe(false);
  });

  it('rejects a birth month outside 1–12', () => {
    for (const m of [0, 13, -1]) {
      expect(childProfileSchema.safeParse({ ...valid, birthMonth: m }).success).toBe(false);
    }
  });

  it('accepts the boundary months', () => {
    for (const m of [1, 12]) {
      expect(childProfileSchema.safeParse({ ...valid, birthMonth: m }).success).toBe(true);
    }
  });

  it('has no date-of-birth or age field at all', () => {
    const parsed = childProfileSchema.parse(valid);
    expect(Object.keys(parsed)).not.toContain('age');
    expect(Object.keys(parsed)).not.toContain('dateOfBirth');
    expect(Object.keys(parsed)).not.toContain('birthDate');
    // And an attempt to smuggle one in is stripped, not persisted.
    const smuggled = childProfileSchema.parse({ ...valid, age: 8, dateOfBirth: '2018-06-15' });
    expect(smuggled).not.toHaveProperty('age');
    expect(smuggled).not.toHaveProperty('dateOfBirth');
  });

  it('allows interests to be skipped', () => {
    const withoutInterests = { ...valid, interestIds: undefined };
    delete (withoutInterests as { interestIds?: unknown }).interestIds;
    expect(childProfileSchema.parse(withoutInterests).interestIds).toEqual([]);
  });

  it(`rejects more than ${MAX_INTERESTS} interests`, () => {
    const tooMany = Array.from({ length: MAX_INTERESTS + 1 }, () => randomUUID());
    expect(childProfileSchema.safeParse({ ...valid, interestIds: tooMany }).success).toBe(false);
  });

  it('rejects an unknown avatar key — no arbitrary image reference', () => {
    expect(
      childProfileSchema.safeParse({ ...valid, avatarKey: 'https://example.com/face.jpg' }).success,
    ).toBe(false);
    expect(AVATAR_KEYS).not.toHaveLength(0);
  });

  it('rejects an unknown grade', () => {
    expect(childProfileSchema.safeParse({ ...valid, grade: 'university' }).success).toBe(false);
  });
});

describe('isBirthMonthYearInFuture', () => {
  const now = new Date('2026-08-26');

  it('rejects a future year', () => {
    expect(isBirthMonthYearInFuture({ birthYear: 2027, birthMonth: 1 }, now)).toBe(true);
  });

  it('rejects a later month in the current year', () => {
    expect(isBirthMonthYearInFuture({ birthYear: 2026, birthMonth: 9 }, now)).toBe(true);
  });

  it('accepts the current month', () => {
    expect(isBirthMonthYearInFuture({ birthYear: 2026, birthMonth: 8 }, now)).toBe(false);
  });

  it('accepts a past year', () => {
    expect(isBirthMonthYearInFuture({ birthYear: 2018, birthMonth: 12 }, now)).toBe(false);
  });

  it('is wired into the schema', () => {
    const schema = childProfileSchemaWithTime(now);
    expect(schema.safeParse({ ...valid, birthYear: 2026, birthMonth: 12 }).success).toBe(false);
    expect(schema.safeParse(valid).success).toBe(true);
  });
});
