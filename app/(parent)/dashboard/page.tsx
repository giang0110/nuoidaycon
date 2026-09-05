import Link from 'next/link';
import { createClient, requireParentId } from '@/lib/supabase/server';
import {
  createAssignmentRepository,
  createChildRepository,
  createParentRepository,
} from '@/lib/data/supabase/repositories';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default async function DashboardPage() {
  const t = getMessages(DEFAULT_LOCALE);
  const parentId = await requireParentId();
  const db = await createClient();

  const [parent, children] = await Promise.all([
    createParentRepository(db).findById(parentId),
    createChildRepository(db, parentId).listByParent(parentId),
  ]);

  const assignmentRepo = createAssignmentRepository(db);
  const perChild = await Promise.all(
    children.map(async (child) => ({
      child,
      awaiting: await assignmentRepo.listForChild(child.id, { statuses: ['submitted'] }),
      open: await assignmentRepo.listForChild(child.id, { statuses: ['assigned', 'in_progress'] }),
    })),
  );

  const awaiting = perChild.flatMap(({ child, awaiting: list }) =>
    list.map((assignment) => ({ child, assignment })),
  );

  return (
    <>
      <h1 className="text-2xl font-semibold">
        {t.dashboard.greeting}
        {parent ? `, ${parent.displayName}` : ''}
      </h1>

      {children.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-parent-muted">{t.dashboard.noChildren}</p>
          <Link href="/children/new" className="text-parent-accent underline">
            {t.child.addFirst}
          </Link>
        </div>
      ) : (
        <>
          {/* The strongest call to action on the screen (UX_FLOW.md §5). */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">
              {t.review.awaiting}
              {awaiting.length > 0 ? ` (${awaiting.length})` : ''}
            </h2>
            {awaiting.length === 0 ? (
              <p className="text-parent-muted text-sm">{t.review.none}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {awaiting.map(({ child, assignment }) => {
                  const snapshot = assignment.contentSnapshot as { title: string };
                  return (
                    <li key={assignment.id}>
                      <Link
                        href={`/assignments/${assignment.id}`}
                        className="border-parent-accent bg-parent-accent/5 flex min-h-14 flex-col justify-center rounded-xl border px-4 py-2"
                      >
                        <span className="font-medium">{snapshot.title}</span>
                        <span className="text-parent-muted text-sm">{child.displayName}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">{t.child.listTitle}</h2>
            <ul className="flex flex-col gap-2">
              {perChild.map(({ child, open }) => (
                <li
                  key={child.id}
                  className="border-parent-border bg-parent-surface flex flex-col rounded-xl border"
                >
                  <Link
                    href={`/children/${child.id}`}
                    className="flex min-h-14 items-center justify-between px-4"
                  >
                    <span>{child.displayName}</span>
                    <span className="text-parent-muted text-sm">
                      {open.length > 0 ? `${open.length} ${t.play.activities}` : ''}
                    </span>
                  </Link>
                  <Link
                    href={`/children/${child.id}/history`}
                    className="border-parent-border text-parent-accent border-t px-4 py-2 text-sm underline"
                  >
                    {t.history.progressLink}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}
