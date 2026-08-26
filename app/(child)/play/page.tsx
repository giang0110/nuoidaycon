import Link from 'next/link';
import { createClient, requireParentId } from '@/lib/supabase/server';
import {
  createAssignmentRepository,
  createChildRepository,
} from '@/lib/data/supabase/repositories';
import { isChildModeUnlocked, unlockChildModeAction, lockChildModeAction } from './actions';
import { UnlockForm } from '@/components/unlock-form';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default async function PlayPage({
  searchParams,
}: {
  searchParams: Promise<{ childId?: string }>;
}) {
  const t = getMessages(DEFAULT_LOCALE);
  const parentId = await requireParentId();

  if (!(await isChildModeUnlocked())) {
    return (
      <section className="flex flex-1 flex-col justify-center gap-6">
        <h1 className="text-2xl font-semibold">{t.play.lockTitle}</h1>
        <UnlockForm action={unlockChildModeAction} label={t.play.enterPin} submit={t.play.unlock} />
      </section>
    );
  }

  const { childId } = await searchParams;
  const db = await createClient();
  const children = await createChildRepository(db, parentId).listByParent(parentId);

  if (children.length === 0) {
    return <p>{t.play.nothingToday}</p>;
  }

  // Child mode is locked to ONE child at a time (CHILD_SAFETY.md §6).
  const selected = children.find((c) => c.id === childId);
  if (!selected) {
    return (
      <section className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">{t.play.pickChild}</h1>
        <ul className="flex flex-col gap-4">
          {children.map((child) => (
            <li key={child.id}>
              <Link
                href={`/play?childId=${child.id}`}
                className="bg-child-surface flex min-h-20 items-center rounded-2xl px-6 text-xl font-medium shadow-sm"
              >
                {child.displayName}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const assignments = await createAssignmentRepository(db).listForChild(selected.id, {
    statuses: ['assigned', 'in_progress', 'submitted', 'reviewed'],
  });
  const open = assignments.filter((a) => a.status === 'assigned' || a.status === 'in_progress');
  const done = assignments.filter((a) => a.status === 'submitted' || a.status === 'reviewed');

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t.play.greeting} {selected.displayName}!
        </h1>
        {open.length > 0 && (
          <p>
            {t.play.todayCount} {open.length} {t.play.activities}
          </p>
        )}
      </header>

      {open.length === 0 && done.length === 0 && <p>{t.play.nothingToday}</p>}

      <ul className="flex flex-col gap-4">
        {open.map((assignment) => {
          const snapshot = assignment.contentSnapshot as { title: string; type: string };
          return (
            <li key={assignment.id}>
              <Link
                href={`/play/${assignment.id}`}
                className="bg-child-surface flex min-h-24 flex-col justify-center gap-1 rounded-2xl px-6 py-4 shadow-sm"
              >
                <span className="text-child-muted text-sm">
                  {t.activityType[snapshot.type as keyof typeof t.activityType]}
                </span>
                <span className="text-xl font-medium">{snapshot.title}</span>
              </Link>
            </li>
          );
        })}

        {done.map((assignment) => {
          const snapshot = assignment.contentSnapshot as { title: string };
          return (
            <li
              key={assignment.id}
              className="flex min-h-20 items-center gap-3 rounded-2xl px-6 opacity-60"
            >
              <span aria-hidden>✓</span>
              <span>{snapshot.title}</span>
              <span className="sr-only">{t.play.doneLabel}</span>
            </li>
          );
        })}
      </ul>

      {/* The only route out of child mode. */}
      <form action={lockChildModeAction} className="mt-auto pt-8">
        <button type="submit" className="text-child-muted min-h-11 text-sm underline">
          {t.play.exit}
        </button>
        <p className="text-child-muted mt-1 text-xs">{t.play.exitHint}</p>
      </form>
    </section>
  );
}
