import Link from 'next/link';
import { createClient, requireParentId } from '@/lib/supabase/server';
import { createChildRepository } from '@/lib/data/supabase/repositories';
import { deriveAgeInYears, resolveBandForChild } from '@/lib/domain/policy/age';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default async function ChildrenPage() {
  const t = getMessages(DEFAULT_LOCALE);
  const parentId = await requireParentId();
  const db = await createClient();
  const children = await createChildRepository(db, parentId).listByParent(parentId);

  return (
    <>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t.child.listTitle}</h1>
        <Link href="/children/new" className="text-parent-accent text-sm underline">
          {children.length === 0 ? t.child.addFirst : t.child.addAnother}
        </Link>
      </header>

      {children.length === 0 ? (
        <p className="text-parent-muted">{t.child.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {children.map((child) => {
            // Age is computed here, for display only. It is never stored.
            const age = deriveAgeInYears(child);
            const band = resolveBandForChild(child);
            return (
              <li key={child.id}>
                <Link
                  href={`/children/${child.id}`}
                  className="border-parent-border bg-parent-surface flex min-h-16 flex-col justify-center rounded-xl border px-4 py-3"
                >
                  <span className="font-medium">{child.displayName}</span>
                  <span className="text-parent-muted text-sm">
                    {age} {t.child.yearsOld} · {t.grade[child.grade]} · {t.ageBand[band.key]}
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
