/**
 * Child profile validation — pure, shared by the client form and the server
 * action so the two can never disagree about what is acceptable.
 *
 * What is NOT here matters as much as what is: no date of birth, no age, no
 * email, no phone, no school, no photo upload. Principle P5 and
 * CHILD_SAFETY.md §3.
 */
import { z } from 'zod';
import { GRADE_LEVELS } from '@/lib/domain/entities';

/** Preset illustrations only — a child's face is never uploaded. */
export const AVATAR_KEYS = [
  'cat',
  'bear',
  'rabbit',
  'fox',
  'panda',
  'owl',
  'turtle',
  'dolphin',
] as const;

export type AvatarKey = (typeof AVATAR_KEYS)[number];

export const MIN_INTERESTS = 3;
export const MAX_INTERESTS = 6;

const currentYear = () => new Date().getUTCFullYear();

export const childProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Bố mẹ nhập tên gọi ở nhà của con nhé.')
    .max(40, 'Tên gọi tối đa 40 ký tự.'),

  birthYear: z.coerce
    .number()
    .int()
    .min(currentYear() - 18, 'Năm sinh chưa hợp lệ.')
    .max(currentYear(), 'Năm sinh không thể ở tương lai.'),

  birthMonth: z.coerce
    .number()
    .int()
    .min(1, 'Tháng sinh từ 1 đến 12.')
    .max(12, 'Tháng sinh từ 1 đến 12.'),

  grade: z.enum(GRADE_LEVELS),

  avatarKey: z.enum(AVATAR_KEYS).default('cat'),

  /** Optional at creation: the engine falls back to age + grade scoring. */
  interestIds: z
    .array(z.string().uuid())
    .max(MAX_INTERESTS, `Chọn tối đa ${MAX_INTERESTS} sở thích.`)
    .default([]),
});

export type ChildProfileInput = z.input<typeof childProfileSchema>;
export type ChildProfile = z.output<typeof childProfileSchema>;

/**
 * A birth month/year pair must not be in the future. Expressed separately from
 * the field rules because it is a cross-field check.
 */
export function isBirthMonthYearInFuture(
  input: { birthYear: number; birthMonth: number },
  now: Date = new Date(),
): boolean {
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth() + 1;
  return input.birthYear > nowYear || (input.birthYear === nowYear && input.birthMonth > nowMonth);
}

export const childProfileSchemaWithTime = (now: Date = new Date()) =>
  childProfileSchema.refine((v) => !isBirthMonthYearInFuture(v, now), {
    message: 'Ngày sinh không thể ở tương lai.',
    path: ['birthMonth'],
  });
