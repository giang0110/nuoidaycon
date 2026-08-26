import Link from 'next/link';
import { createClient, requireParentId } from '@/lib/supabase/server';
import { createChildRepository, createParentRepository } from '@/lib/data/supabase/repositories';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default async function DashboardPage() {
  const t = getMessages(DEFAULT_LOCALE);
  const parentId = await requireParentId();
  const db = await createClient();

  const [parent, children] = await Promise.all([
    createParentRepository(db).findById(parentId),
    createChildRepository(db, parentId).listByParent(parentId),
  ]);

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
        <ul className="flex flex-col gap-3">
          {children.map((child) => (
            <li key={child.id}>
              <Link
                href={`/children/${child.id}`}
                className="border-parent-border bg-parent-surface flex min-h-14 items-center rounded-xl border px-4"
              >
                {child.displayName}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
