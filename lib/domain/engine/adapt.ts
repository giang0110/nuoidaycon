/**
 * Difficulty adaptation — PRODUCT_SPEC.md §7.
 *
 * A pure state transition over one child's per-type progress. Clamped to the
 * age band, so adaptation can raise or lower difficulty but can NEVER push a
 * child outside the content approved for their age (CHILD_SAFETY.md §4).
 *
 * Deliberately NOT a score of the child. This produces a content-selection
 * level, nothing more — no IQ, no EQ, no personality or clinical inference.
 */
import type { ChildTypeProgress, Difficulty, ReviewVerdict } from '@/lib/domain/entities';
import { clampDifficultyToBand, type AgeBand } from '@/lib/domain/policy/age';

/** Two consecutive "just right" before nudging up — one is not a trend. */
export const SUCCESS_STREAK_TO_ADVANCE = 2;
/** Two consecutive incompletes lower difficulty when no verdict is given. */
export const INCOMPLETE_STREAK_TO_EASE = 2;

export function applyReview(
  progress: ChildTypeProgress,
  verdict: ReviewVerdict,
  band: AgeBand,
): ChildTypeProgress {
  let { difficulty, streakSuccess, streakStruggle } = progress;

  switch (verdict) {
    case 'too_easy':
      difficulty += 1;
      streakSuccess = 0;
      streakStruggle = 0;
      break;

    case 'just_right':
      streakSuccess += 1;
      streakStruggle = 0;
      if (streakSuccess >= SUCCESS_STREAK_TO_ADVANCE) {
        difficulty += 1;
        streakSuccess = 0;
      }
      break;

    case 'too_hard':
      // Drops immediately: a struggling child should not wait for a trend.
      difficulty -= 1;
      streakSuccess = 0;
      streakStruggle = 0;
      break;
  }

  return {
    ...progress,
    difficulty: clampDifficultyToBand(difficulty, band) as Difficulty,
    streakSuccess,
    streakStruggle,
  };
}

/**
 * Graceful degradation when a parent never leaves a verdict: two consecutive
 * incomplete assignments ease the difficulty by one.
 */
export function applyCompletionSignal(
  progress: ChildTypeProgress,
  completed: boolean,
  band: AgeBand,
): ChildTypeProgress {
  if (completed) {
    return { ...progress, streakStruggle: 0 };
  }

  const streakStruggle = progress.streakStruggle + 1;
  if (streakStruggle < INCOMPLETE_STREAK_TO_EASE) {
    return { ...progress, streakStruggle };
  }

  return {
    ...progress,
    difficulty: clampDifficultyToBand(progress.difficulty - 1, band) as Difficulty,
    streakStruggle: 0,
    streakSuccess: 0,
  };
}
