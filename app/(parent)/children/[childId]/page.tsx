import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient, requireParentId } from '@/lib/supabase/server';
import {
  createChildRepository,
  createInterestRepository,
  createProgressRepository,
} from '@/lib/data/supabase/repositories';
import { deriveAgeInYears, resolveBandForChild } from '@/lib/domain/policy/age';
import { ACTIVITY_TYPES } from '@/lib/domain/entities';
import { archiveChildAction } from '../actions';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default async function ChildPage({ params }: { params: Promise<{ childId: string }> }) {
  const t = getMessages(DEFAULT_LOCALE);
  const { childId } = await params;
  const parentId = await requireParentId();
  const db = await createClient();

  const child = await createChildRepository(db, parentId).findById(childId);
  if (!child) notFound();

  const [interests, progress] = await Promise.all([
    createInterestRepository(db).listForChild(childId),
    createProgressRepository(db).listForChild(childId),
  ]);

  const age = deriveAgeInYears(child);
  const band = resolveBandForChild(child);
  const byType = new Map(progress.map((p) => [p.type, p.difficulty]));

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{child.displayName}</h1>
          <p className="text-parent-muted text-sm">
            {age} {t.child.yearsOld} · {t.grade[child.grade]} · {t.ageBand[band.key]}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Link
            href={`/children/${child.id}/edit`}
            className="text-parent-accent text-sm underline"
          >
            {t.child.edit}
          </Link>
          <Link
            href={`/children/${child.id}/history`}
            className="text-parent-accent text-sm underline"
          >
            {t.history.title}
          </Link>
        </div>
      </header>

      {interests.length > 0 && (
        <section className="flex flex-wrap gap-2">
          {interests.map((i) => (
            <span key={i.id} className="border-parent-border rounded-full border px-3 py-1 text-sm">
              {i.labelVi}
            </span>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{t.child.difficultyByType}</h2>
        <ul className="flex flex-col gap-2">
          {ACTIVITY_TYPES.map((type) => {
            const level = byType.get(type) ?? 1;
            return (
              <li key={type} className="flex items-center justify-between text-sm">
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

      <form action={archiveChildAction}>
        <input type="hidden" name="childId" value={child.id} />
        <button type="submit" className="text-parent-muted text-sm underline">
          {t.child.archive}
        </button>
      </form>
    </>
  );
}
