import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient, requireParentId } from '@/lib/supabase/server';
import {
  createAssignmentRepository,
  createChildRepository,
} from '@/lib/data/supabase/repositories';
import { buildWeeklySummary, describeWeek, type SummaryInput } from '@/lib/domain/engine/summary';
import { ACTIVITY_TYPES } from '@/lib/domain/entities';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default async function HistoryPage({ params }: { params: Promise<{ childId: string }> }) {
  const t = getMessages(DEFAULT_LOCALE);
  const { childId } = await params;
  const parentId = await requireParentId();

  const db = await createClient();
  const child = await createChildRepository(db, parentId).findById(childId);
  if (!child) notFound();

  const assignments = await createAssignmentRepository(db).listForChild(childId);

  const { data: reviewRows } = await db
    .from('assignment_reviews')
    .select('assignment_id, verdict')
    .in('assignment_id', assignments.map((a) => a.id).slice(0, 200));

  const verdictByAssignment = new Map(
    ((reviewRows ?? []) as { assignment_id: string; verdict: string }[]).map((r) => [
      r.assignment_id,
      r.verdict,
    ]),
  );

  const entries: SummaryInput[] = assignments.map((a) => ({
    assignedAt: a.assignedAt,
    type: (a.contentSnapshot as { type: SummaryInput['type'] }).type,
    status: a.status,
    verdict: (verdictByAssignment.get(a.id) as SummaryInput['verdict']) ?? null,
  }));

  const summary = buildWeeklySummary(entries, ACTIVITY_TYPES, new Date());

  return (
    <>
      <Link href={`/children/${child.id}`} className="text-parent-muted text-sm">
        ← {child.displayName}
      </Link>
      <h1 className="text-2xl font-semibold">{t.history.title}</h1>

      {/*
        A description of the WEEK, never an assessment of the child: counts and
        the parent's own verdicts, nothing inferred (principle P6).
      */}
      <section className="border-parent-border bg-parent-surface flex flex-col gap-3 rounded-xl border p-5">
        <h2 className="text-sm font-medium">{t.history.weekTitle}</h2>
        <p className="text-pretty">{describeWeek(summary)}</p>

        {summary.untouchedTypes.length > 0 && summary.assigned > 0 && (
          <p className="text-parent-muted text-sm">
            {t.history.untouched}:{' '}
            {summary.untouchedTypes.map((x) => t.activityType[x]).join(' · ')}
          </p>
        )}
      </section>

      {assignments.length === 0 ? (
        <p className="text-parent-muted">{t.history.empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {assignments.map((assignment) => {
            const snapshot = assignment.contentSnapshot as { title: string; type: string };
            const verdict = verdictByAssignment.get(assignment.id);
            return (
              <li key={assignment.id}>
                <Link
                  href={`/assignments/${assignment.id}`}
                  className="border-parent-border flex flex-col gap-0.5 rounded-xl border px-4 py-3"
                >
                  <span className="text-parent-muted text-xs">
                    {t.activityType[snapshot.type as keyof typeof t.activityType]}
                  </span>
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
    </>
  );
}

function verdictKey(verdict: string): 'tooEasy' | 'justRight' | 'tooHard' {
  if (verdict === 'too_easy') return 'tooEasy';
  if (verdict === 'too_hard') return 'tooHard';
  return 'justRight';
}
