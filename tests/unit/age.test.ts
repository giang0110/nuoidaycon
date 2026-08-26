import { describe, it, expect } from 'vitest';
import { deriveAgeInYears, resolveAgeBand, AGE_BANDS, gradeToIndex } from '@/lib/domain/policy/age';

describe('deriveAgeInYears', () => {
  it('counts a birthday that has already passed this year', () => {
    // Born 2018-03, asked in 2026-08 → turned 8 in March.
    expect(deriveAgeInYears({ birthYear: 2018, birthMonth: 3 }, new Date('2026-08-26'))).toBe(8);
  });

  it('does not count a birthday still to come this year', () => {
    // Born 2018-11, asked in 2026-08 → still 7 until November.
    expect(deriveAgeInYears({ birthYear: 2018, birthMonth: 11 }, new Date('2026-08-26'))).toBe(7);
  });

  it('treats the birth month itself as already turned', () => {
    // Only month precision is stored, so the whole month counts as the birthday.
    expect(deriveAgeInYears({ birthYear: 2018, birthMonth: 8 }, new Date('2026-08-01'))).toBe(8);
    expect(deriveAgeInYears({ birthYear: 2018, birthMonth: 8 }, new Date('2026-08-31'))).toBe(8);
  });

  it('handles the December/January boundary', () => {
    expect(deriveAgeInYears({ birthYear: 2018, birthMonth: 12 }, new Date('2026-12-01'))).toBe(8);
    expect(deriveAgeInYears({ birthYear: 2018, birthMonth: 12 }, new Date('2026-11-30'))).toBe(7);
    expect(deriveAgeInYears({ birthYear: 2018, birthMonth: 1 }, new Date('2027-01-01'))).toBe(9);
  });

  it('returns 0 for a child born this month', () => {
    expect(deriveAgeInYears({ birthYear: 2026, birthMonth: 8 }, new Date('2026-08-26'))).toBe(0);
  });

  it('never returns a negative age for a future birth date', () => {
    expect(deriveAgeInYears({ birthYear: 2027, birthMonth: 1 }, new Date('2026-08-26'))).toBe(0);
  });
});

describe('resolveAgeBand', () => {
  it.each([
    [4, 'early'],
    [6, 'early'],
    [7, 'lower_primary'],
    [8, 'lower_primary'],
    [9, 'upper_primary'],
    [10, 'upper_primary'],
    [11, 'preteen'],
    [12, 'preteen'],
  ])('maps age %i to band %s', (age, band) => {
    expect(resolveAgeBand(age)).toBe(band);
  });

  it('clamps below the youngest band', () => {
    expect(resolveAgeBand(2)).toBe('early');
  });

  it('clamps above the oldest band', () => {
    expect(resolveAgeBand(17)).toBe('preteen');
  });

  it('covers every age from 3 to 18 with no gaps', () => {
    for (let age = 3; age <= 18; age += 1) {
      expect(AGE_BANDS.some((b) => b.key === resolveAgeBand(age))).toBe(true);
    }
  });
});

describe('AGE_BANDS', () => {
  it('has contiguous, non-overlapping age ranges', () => {
    const sorted = [...AGE_BANDS].sort((a, b) => a.minAge - b.minAge);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]!.minAge).toBe(sorted[i - 1]!.maxAge + 1);
    }
  });

  it('keeps every difficulty range inside 1–5', () => {
    for (const band of AGE_BANDS) {
      expect(band.minDifficulty).toBeGreaterThanOrEqual(1);
      expect(band.maxDifficulty).toBeLessThanOrEqual(5);
      expect(band.minDifficulty).toBeLessThanOrEqual(band.maxDifficulty);
    }
  });

  it('allows longer text and harder content as the bands rise', () => {
    const sorted = [...AGE_BANDS].sort((a, b) => a.minAge - b.minAge);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]!.maxStoryWords).toBeGreaterThan(sorted[i - 1]!.maxStoryWords);
      expect(sorted[i]!.maxDifficulty).toBeGreaterThanOrEqual(sorted[i - 1]!.maxDifficulty);
    }
  });
});

describe('gradeToIndex', () => {
  it('orders grades from preschool upward', () => {
    expect(gradeToIndex('preschool')).toBe(0);
    expect(gradeToIndex('grade_1')).toBe(1);
    expect(gradeToIndex('grade_6')).toBe(6);
  });
});
