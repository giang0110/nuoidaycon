/**
 * Parent activity summary — a description of ACTIVITY, not an assessment of a CHILD.
 *
 * ⚠️ HARD CONSTRAINT: this module must never produce an IQ, EQ, clinical,
 * developmental, personality or aptitude score, ranking, percentile, or
 * comparison between children (PRODUCT_SPEC.md principle P6, CHILD_SAFETY.md
 * §6). Nothing here infers anything about who a child *is*.
 *
 * What it may expose: what was assigned, what was finished, which activity
 * types came up, and what the parent themselves said about difficulty. Those
 * are persisted facts a parent already owns — this module only counts them.
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

export type ProgressWindowDays = 7 | 30;

export interface TypeDifficulty {
  type: ActivityType;
  difficulty: number;
}

export type ProgressInsight =
  | { id: 'awaiting_review'; count: number }
  | { id: 'untouched_type'; type: ActivityType; windowDays: ProgressWindowDays }
  | { id: 'dominant_type'; type: ActivityType; count: number }
  | { id: 'current_difficulty'; type: ActivityType; difficulty: number };

export interface ProgressSummary {
  windowDays: ProgressWindowDays;
  assigned: number;
  completed: number;
  completionRate: number | null;
  awaitingReview: number;
  byType: Record<ActivityType, number>;
  verdicts: Record<ReviewVerdict, number>;
  untouchedTypes: ActivityType[];
  difficultyByType: Record<ActivityType, number>;
  insights: ProgressInsight[];
}

const DAY_MS = 86_400_000;

function filterWindow(
  entries: readonly SummaryInput[],
  now: Date,
  windowDays: number,
): SummaryInput[] {
  const since = now.getTime() - windowDays * DAY_MS;
  return entries.filter((entry) => {
    const assignedAt = Date.parse(entry.assignedAt);
    return !Number.isNaN(assignedAt) && assignedAt >= since;
  });
}

function emptyTypeCounts(allTypes: readonly ActivityType[]): Record<ActivityType, number> {
  return Object.fromEntries(allTypes.map((type) => [type, 0])) as Record<ActivityType, number>;
}

function buildDifficultyMap(
  allTypes: readonly ActivityType[],
  rows: readonly TypeDifficulty[],
): Record<ActivityType, number> {
  const seen = new Set<ActivityType>();
  const values = new Map<ActivityType, number>();

  for (const row of rows) {
    if (seen.has(row.type)) {
      throw new Error(`Invalid difficulty rows: duplicate type ${row.type}`);
    }
    seen.add(row.type);
    values.set(row.type, row.difficulty);
  }

  if (rows.length !== allTypes.length || allTypes.some((type) => !values.has(type))) {
    throw new Error('Invalid difficulty rows: expected exactly one row for every activity type');
  }

  return Object.fromEntries(allTypes.map((type) => [type, values.get(type)!])) as Record<
    ActivityType,
    number
  >;
}

function buildInsights(input: {
  assigned: number;
  awaitingReview: number;
  byType: Record<ActivityType, number>;
  untouchedTypes: readonly ActivityType[];
  difficultyByType: Record<ActivityType, number>;
  allTypes: readonly ActivityType[];
  windowDays: ProgressWindowDays;
}): ProgressInsight[] {
  if (input.assigned === 0) return [];

  const insights: ProgressInsight[] = [];

  if (input.awaitingReview > 0) {
    insights.push({ id: 'awaiting_review', count: input.awaitingReview });
  }

  const firstUntouched = input.untouchedTypes[0];
  if (firstUntouched) {
    insights.push({ id: 'untouched_type', type: firstUntouched, windowDays: input.windowDays });
  }

  const maxCount = Math.max(...input.allTypes.map((type) => input.byType[type]));
  if (maxCount > 1) {
    const leaders = input.allTypes.filter((type) => input.byType[type] === maxCount);
    if (leaders.length === 1) {
      insights.push({ id: 'dominant_type', type: leaders[0]!, count: maxCount });
    }
  }

  const firstType = input.allTypes[0];
  if (firstType) {
    insights.push({
      id: 'current_difficulty',
      type: firstType,
      difficulty: input.difficultyByType[firstType],
    });
  }

  return insights.slice(0, 3);
}

export function buildProgressSummary(input: {
  entries: readonly SummaryInput[];
  allTypes: readonly ActivityType[];
  typeDifficulty: readonly TypeDifficulty[];
  now: Date;
  windowDays: ProgressWindowDays;
}): ProgressSummary {
  const difficultyByType = buildDifficultyMap(input.allTypes, input.typeDifficulty);
  const recent = filterWindow(input.entries, input.now, input.windowDays);
  const byType = emptyTypeCounts(input.allTypes);
  const verdicts: Record<ReviewVerdict, number> = {
    too_easy: 0,
    just_right: 0,
    too_hard: 0,
  };

  let completed = 0;
  let awaitingReview = 0;

  for (const entry of recent) {
    byType[entry.type] += 1;
    if (entry.status === 'submitted' || entry.status === 'reviewed') completed += 1;
    if (entry.status === 'submitted') awaitingReview += 1;
    if (entry.verdict) verdicts[entry.verdict] += 1;
  }

  const untouchedTypes = input.allTypes.filter((type) => byType[type] === 0);
  const assigned = recent.length;

  return {
    windowDays: input.windowDays,
    assigned,
    completed,
    completionRate: assigned === 0 ? null : completed / assigned,
    awaitingReview,
    byType,
    verdicts,
    untouchedTypes,
    difficultyByType,
    insights: buildInsights({
      assigned,
      awaitingReview,
      byType,
      untouchedTypes,
      difficultyByType,
      allTypes: input.allTypes,
      windowDays: input.windowDays,
    }),
  };
}

export function buildWeeklySummary(
  entries: readonly SummaryInput[],
  allTypes: readonly ActivityType[],
  now: Date,
  windowDays = 7,
): WeeklySummary {
  const recent = filterWindow(entries, now, windowDays);
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
