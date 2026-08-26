/**
 * Weekly parent summary — a description of ACTIVITY, not an assessment of a CHILD.
 *
 * ⚠️ HARD CONSTRAINT: this module must never produce an IQ, EQ, clinical,
 * developmental, personality or aptitude score, ranking, percentile, or
 * comparison between children (PRODUCT_SPEC.md principle P6, CHILD_SAFETY.md
 * §6). Nothing here infers anything about who a child *is*.
 *
 * What it may say: what was assigned, what was finished, which types came up,
 * and what the parent themselves said about difficulty. Those are observations
 * a parent already made — this only counts them back.
 *
 * Pure module (decision A1).
 */
import type { ActivityType, ReviewVerdict } from '@/lib/domain/entities';

export interface SummaryInput {
  assignedAt: string;
  type: ActivityType;
  status: 'assigned' | 'in_progress' | 'submitted' | 'reviewed' | 'skipped';
  verdict: ReviewVerdict | null;
}

export interface WeeklySummary {
  windowDays: number;
  assigned: number;
  completed: number;
  awaitingReview: number;
  /** Counts per activity type — what the week contained, not how well it went. */
  byType: Partial<Record<ActivityType, number>>;
  /** The parent's own verdicts, counted back. Not a grade. */
  verdicts: Record<ReviewVerdict, number>;
  /** Types not touched in the window, so a parent can vary the next week. */
  untouchedTypes: ActivityType[];
}

const DAY_MS = 86_400_000;

export function buildWeeklySummary(
  entries: readonly SummaryInput[],
  allTypes: readonly ActivityType[],
  now: Date,
  windowDays = 7,
): WeeklySummary {
  const since = now.getTime() - windowDays * DAY_MS;
  const recent = entries.filter((e) => {
    const t = Date.parse(e.assignedAt);
    return !Number.isNaN(t) && t >= since;
  });

  const byType: Partial<Record<ActivityType, number>> = {};
  const verdicts: Record<ReviewVerdict, number> = {
    too_easy: 0,
    just_right: 0,
    too_hard: 0,
  };

  let completed = 0;
  let awaitingReview = 0;

  for (const entry of recent) {
    byType[entry.type] = (byType[entry.type] ?? 0) + 1;
    if (entry.status === 'submitted' || entry.status === 'reviewed') completed += 1;
    if (entry.status === 'submitted') awaitingReview += 1;
    if (entry.verdict) verdicts[entry.verdict] += 1;
  }

  return {
    windowDays,
    assigned: recent.length,
    completed,
    awaitingReview,
    byType,
    verdicts,
    untouchedTypes: allTypes.filter((type) => !byType[type]),
  };
}

/**
 * A short, factual line for the parent.
 *
 * Deliberately describes the WEEK, never the child. "Con đã làm 4 hoạt động",
 * not "con tiến bộ" or "con gặp khó khăn với đọc hiểu" — the second kind of
 * sentence is an assessment, and this product does not make them.
 */
export function describeWeek(summary: WeeklySummary): string {
  if (summary.assigned === 0) {
    return 'Tuần này chưa có hoạt động nào được giao.';
  }
  const parts = [`Tuần này bố mẹ đã giao ${summary.assigned} hoạt động`];
  parts.push(`con hoàn thành ${summary.completed}`);
  if (summary.awaitingReview > 0) {
    parts.push(`${summary.awaitingReview} bài đang chờ bố mẹ xem`);
  }
  return `${parts.join(', ')}.`;
}
