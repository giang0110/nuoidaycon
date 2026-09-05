import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient, requireParentId } from '@/lib/supabase/server';
import {
  createAssignmentRepository,
  createChildRepository,
  createProgressRepository,
  createReviewRepository,
} from '@/lib/data/supabase/repositories';
import {
  buildProgressSummary,
  type ProgressInsight,
  type ProgressWindowDays,
  type SummaryInput,
} from '@/lib/domain/engine/summary';
import { ACTIVITY_TYPES } from '@/lib/domain/entities';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

type HistoryPageProps = {
  params: Promise<{ childId: string }>;
  searchParams: Promise<{ window?: string | string[] }>;
};

const DAY_MS = 86_400_000;

export default async function HistoryPage({ params, searchParams }: HistoryPageProps) {
  const t = getMessages(DEFAULT_LOCALE);
  const [{ childId }, query] = await Promise.all([params, searchParams]);
  const rawWindow = Array.isArray(query.window) ? query.window[0] : query.window;
  const windowDays: ProgressWindowDays = rawWindow === '30' ? 30 : 7;
  const parentId = await requireParentId();

  const db = await createClient();
  const child = await createChildRepository(db, parentId).findById(childId);
  if (!child) notFound();

  const assignmentRepo = createAssignmentRepository(db);
  const reviewRepo = createReviewRepository(db);
  const progressRepo = createProgressRepository(db);

  const [assignments, progress] = await Promise.all([
    assignmentRepo.listForChild(childId),
    progressRepo.listForChild(childId),
  ]);
  const reviews = await reviewRepo.listForAssignments(assignments.map((assignment) => assignment.id));
  const reviewByAssignment = new Map(reviews.map((review) => [review.assignmentId, review]));

  const entries: SummaryInput[] = assignments.map((assignment) => ({
    assignedAt: assignment.assignedAt,
    type: (assignment.contentSnapshot as { type: SummaryInput['type'] }).type,
    status: assignment.status,
    verdict: reviewByAssignment.get(assignment.id)?.verdict ?? null,
  }));

  const progressByType = new Map(progress.map((row) => [row.type, row.difficulty]));
  const typeDifficulty = ACTIVITY_TYPES.map((type) => ({
    type,
    difficulty: progressByType.get(type) ?? 1,
  }));
  const now = new Date();
  const summary = buildProgressSummary({
    entries,
    allTypes: ACTIVITY_TYPES,
    typeDifficulty,
    now,
    windowDays,
  });

  const since = now.getTime() - windowDays * DAY_MS;
  const recentAssignments = assignments.filter((assignment) => {
    const assignedAt = Date.parse(assignment.assignedAt);
    return !Number.isNaN(assignedAt) && assignedAt >= since;
  });

  const formatInsight = (insight: ProgressInsight): string => {
    switch (insight.id) {
      case 'awaiting_review':
        return `${insight.count} ${t.history.insightAwaitingReview}`;
      case 'untouched_type':
        return `${insight.windowDays} ${t.history.insightUntouchedType} ${t.activityType[insight.type]}.`;
      case 'dominant_type':
        return `${t.history.insightDominantType} ${t.activityType[insight.type]} (${insight.count}).`;
      case 'current_difficulty':
        return `${t.history.insightDifficulty} ${t.activityType[insight.type]}: ${insight.difficulty}/5.`;
    }
  };

  return (
    <>
      <Link href={`/children/${child.id}`} className="text-parent-muted text-sm">
        ← {child.displayName}
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t.history.title}</h1>
        <div className="flex gap-2" aria-label={t.history.title}>
          <Link
            href={`/children/${child.id}/history?window=7`}
            className={`rounded-full border px-3 py-1 text-sm ${
              windowDays === 7
                ? 'border-parent-accent bg-parent-accent/10 text-parent-accent'
                : 'border-parent-border text-parent-muted'
            }`}
          >
            {t.history.window7}
          </Link>
          <Link
            href={`/children/${child.id}/history?window=30`}
            className={`rounded-full border px-3 py-1 text-sm ${
              windowDays === 30
                ? 'border-parent-accent bg-parent-accent/10 text-parent-accent'
                : 'border-parent-border text-parent-muted'
            }`}
          >
            {t.history.window30}
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label={t.history.assigned} value={String(summary.assigned)} />
        <MetricCard label={t.history.completed} value={String(summary.completed)} />
        <MetricCard
          label={t.history.completionRate}
          value={
            summary.completionRate === null ? '—' : `${Math.round(summary.completionRate * 100)}%`
          }
        />
        <MetricCard label={t.history.awaitingReview} value={String(summary.awaitingReview)} />
      </section>

      <section className="border-parent-border bg-parent-surface flex flex-col gap-3 rounded-xl border p-5">
        <h2 className="text-sm font-medium">{t.history.distribution}</h2>
        <ul className="flex flex-col gap-2">
          {ACTIVITY_TYPES.map((type) => (
            <li key={type} className="flex items-center justify-between gap-4 text-sm">
              <span>{t.activityType[type]}</span>
              <span className="font-medium">{summary.byType[type]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-parent-border bg-parent-surface flex flex-col gap-3 rounded-xl border p-5">
        <h2 className="text-sm font-medium">{t.history.difficulty}</h2>
        <ul className="flex flex-col gap-2">
          {ACTIVITY_TYPES.map((type) => {
            const level = summary.difficultyByType[type];
            return (
              <li key={type} className="flex items-center justify-between gap-4 text-sm">
                <span>{t.activityType[type]}</span>
                <span aria-label={`${level}/5`} className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((dot) => (
                    <span
                      key={dot}
                      className={`h-2.5 w-2.5 rounded-full ${
                        dot <= level ? 'bg-parent-accent' : 'bg-parent-border'
                      }`}
                    />
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {summary.insights.length > 0 && (
        <section className="border-parent-border bg-parent-surface flex flex-col gap-3 rounded-xl border p-5">
          <h2 className="text-sm font-medium">{t.history.insights}</h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
            {summary.insights.map((insight) => (
              <li key={insight.id}>{formatInsight(insight)}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{t.history.recent}</h2>
        {recentAssignments.length === 0 ? (
          <p className="text-parent-muted">
            {assignments.length === 0 ? t.history.empty : t.history.noWindowActivity}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentAssignments.map((assignment) => {
              const snapshot = assignment.contentSnapshot as { title: string; type: SummaryInput['type'] };
              const verdict = reviewByAssignment.get(assignment.id)?.verdict;
              return (
                <li key={assignment.id}>
                  <Link
                    href={`/assignments/${assignment.id}`}
                    className="border-parent-border flex flex-col gap-0.5 rounded-xl border px-4 py-3"
                  >
                    <span className="text-parent-muted text-xs">{t.activityType[snapshot.type]}</span>
                    <span className="font-medium">{snapshot.title}</span>
                    <span className="text-parent-muted text-sm">
                      {new Date(assignment.assignedAt).toLocaleDateString('vi-VN')}
                      {verdict ? ` · ${t.review[verdictKey(verdict)]}` : ''}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-parent-border bg-parent-surface flex flex-col gap-1 rounded-xl border p-4">
      <span className="text-parent-muted text-xs">{label}</span>
      <span className="text-xl font-semibold">{value}</span>
    </div>
  );
}

function verdictKey(verdict: string): 'tooEasy' | 'justRight' | 'tooHard' {
  if (verdict === 'too_easy') return 'tooEasy';
  if (verdict === 'too_hard') return 'tooHard';
  return 'justRight';
}
