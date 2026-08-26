/**
 * Age bands and age derivation — the policy that decides what content a child
 * may be shown (CHILD_SAFETY.md §4).
 *
 * Two things here are load-bearing:
 *
 *  1. Age is DERIVED, never stored. There is no `age` column in the database
 *     and no cached age anywhere; it is computed from birth_year + birth_month
 *     at the moment it is needed (principle P5).
 *
 *  2. This lives in code, not in a table. A runtime-editable safety policy is a
 *     safety policy that can be edited at runtime.
 *
 * Pure module: no Supabase, no Next.js, no React (decision A1).
 */
import { GRADE_LEVELS, type GradeLevel } from '@/lib/domain/entities';

export const POLICY_VERSION = 'age-policy@2026-08-25';

export type AgeBandKey = 'early' | 'lower_primary' | 'upper_primary' | 'preteen';

export type ResponseModeKey = 'none' | 'text' | 'choice' | 'photo' | 'mixed';

export interface AgeBand {
  readonly key: AgeBandKey;
  readonly minAge: number;
  readonly maxAge: number;
  readonly grades: readonly GradeLevel[];
  readonly minDifficulty: number;
  readonly maxDifficulty: number;
  readonly maxStoryWords: number;
  readonly maxSentenceWords: number;
  readonly allowedResponseModes: readonly ResponseModeKey[];
  /** Cap on a free-text answer. 0 means text answers are not offered at all. */
  readonly maxAnswerWords: number;
}

/** CHILD_SAFETY.md §4. Contiguous and non-overlapping, asserted by tests. */
export const AGE_BANDS: readonly AgeBand[] = [
  {
    key: 'early',
    minAge: 3,
    maxAge: 6,
    grades: ['preschool', 'grade_1'],
    minDifficulty: 1,
    maxDifficulty: 2,
    maxStoryWords: 120,
    maxSentenceWords: 12,
    allowedResponseModes: ['none', 'choice', 'photo'],
    maxAnswerWords: 0,
  },
  {
    key: 'lower_primary',
    minAge: 7,
    maxAge: 8,
    grades: ['grade_2', 'grade_3'],
    minDifficulty: 1,
    maxDifficulty: 3,
    maxStoryWords: 250,
    maxSentenceWords: 15,
    allowedResponseModes: ['none', 'choice', 'photo', 'text', 'mixed'],
    maxAnswerWords: 40,
  },
  {
    key: 'upper_primary',
    minAge: 9,
    maxAge: 10,
    grades: ['grade_4', 'grade_5'],
    minDifficulty: 2,
    maxDifficulty: 4,
    maxStoryWords: 450,
    maxSentenceWords: 18,
    allowedResponseModes: ['none', 'choice', 'photo', 'text', 'mixed'],
    maxAnswerWords: 100,
  },
  {
    key: 'preteen',
    minAge: 11,
    maxAge: 18,
    grades: ['grade_6'],
    minDifficulty: 3,
    maxDifficulty: 5,
    maxStoryWords: 700,
    maxSentenceWords: 22,
    allowedResponseModes: ['none', 'choice', 'photo', 'text', 'mixed'],
    maxAnswerWords: 200,
  },
];

/**
 * Deliberately NOT named after a date: there is no date here. Month and year
 * are the whole of what this product knows about when a child was born, and
 * the name should not suggest otherwise (principle P5).
 */
export interface BirthMonthYear {
  birthYear: number;
  /** 1–12. Month precision only — the exact day is never collected. */
  birthMonth: number;
}

/**
 * Age in whole years at `now`.
 *
 * Because only month precision is stored, the birthday is treated as falling on
 * the first of the birth month: a child born in August is 8 throughout August.
 * That errs on the side of the *older* band boundary by at most a few weeks,
 * which matters only at a band edge and is the same direction a parent would
 * expect when they say "cháu 8 tuổi".
 */
export function deriveAgeInYears(birth: BirthMonthYear, now: Date = new Date()): number {
  const years = now.getUTCFullYear() - birth.birthYear;
  const monthsIntoYear = now.getUTCMonth() + 1 - birth.birthMonth;
  const age = monthsIntoYear >= 0 ? years : years - 1;
  return Math.max(0, age);
}

/** Resolve the band for an age, clamping outside the defined range. */
export function resolveAgeBand(age: number): AgeBandKey {
  const first = AGE_BANDS[0]!;
  const last = AGE_BANDS[AGE_BANDS.length - 1]!;
  if (age <= first.maxAge) return first.key;
  if (age >= last.minAge) return last.key;
  const match = AGE_BANDS.find((band) => age >= band.minAge && age <= band.maxAge);
  return (match ?? last).key;
}

export function getAgeBand(key: AgeBandKey): AgeBand {
  const band = AGE_BANDS.find((b) => b.key === key);
  if (!band) throw new Error(`Unknown age band: ${key}`);
  return band;
}

/** Convenience: birth date straight to band, without persisting an age. */
export function resolveBandForChild(birth: BirthMonthYear, now: Date = new Date()): AgeBand {
  return getAgeBand(resolveAgeBand(deriveAgeInYears(birth, now)));
}

/**
 * Adaptation may move a child's difficulty up or down, but never outside the
 * range approved for their age (PRODUCT_SPEC.md §7).
 */
export function clampDifficultyToBand(difficulty: number, band: AgeBand): number {
  return Math.min(band.maxDifficulty, Math.max(band.minDifficulty, Math.round(difficulty)));
}

export function isResponseModeAllowed(mode: ResponseModeKey, band: AgeBand): boolean {
  return band.allowedResponseModes.includes(mode);
}

const GRADE_ORDER: readonly GradeLevel[] = GRADE_LEVELS;

export function gradeToIndex(grade: GradeLevel): number {
  return GRADE_ORDER.indexOf(grade);
}

export const GRADES = GRADE_ORDER;
