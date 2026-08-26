import Link from 'next/link';
import { createClient, requireParentId } from '@/lib/supabase/server';
import {
  createAssignmentRepository,
  createChildRepository,
  createInterestRepository,
  createProgressRepository,
  createTemplateRepository,
} from '@/lib/data/supabase/repositories';
import {
  suggestActivities,
  explainSuggestion,
  type ChildContext,
} from '@/lib/domain/engine/recommend';
import { assignActivityAction } from './actions';
import { AssignButton } from '@/components/assign-button';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default async function AssignPage({
  searchParams,
}: {
  searchParams: Promise<{ childId?: string; shuffle?: string }>;
}) {
  const t = getMessages(DEFAULT_LOCALE);
  const parentId = await requireParentId();
  const { childId, shuffle } = await searchParams;

  const db = await createClient();
  const children = await createChildRepository(db, parentId).listByParent(parentId);

  if (children.length === 0) {
    return (
      <>
        <h1 className="text-2xl font-semibold">{t.assign.title}</h1>
        <p className="text-parent-muted">{t.assign.noChildren}</p>
        <Link href="/children/new" className="text-parent-accent underline">
          {t.child.addFirst}
        </Link>
      </>
    );
  }

  const selected = children.find((c) => c.id === childId) ?? children[0]!;

  const [interests, progress, recent, catalog] = await Promise.all([
    createInterestRepository(db).listForChild(selected.id),
    createProgressRepository(db).listForChild(selected.id),
    // 90 days covers the longest novelty horizon the engine uses.
    createAssignmentRepository(db).listRecentForChild(selected.id, 90),
    createTemplateRepository(db).listApproved({ locale: selected.locale }),
  ]);

  const ctx: ChildContext = {
    child: selected,
    interestSlugs: interests.map((i) => i.slug),
    difficultyByType: Object.fromEntries(progress.map((p) => [p.type, p.difficulty])),
    history: recent.map((a) => ({
      templateId: a.templateId,
      // The snapshot records the type; fall back to the template id lookup.
      type: (a.contentSnapshot as { type: ChildContext['history'][number]['type'] }).type,
      assignedAt: a.assignedAt,
    })),
  };

  const shuffleSeed = Number.isInteger(Number(shuffle)) ? Number(shuffle) : 0;
  const result = suggestActivities(ctx, catalog, { shuffleSeed });

  return (
    <>
      <h1 className="text-2xl font-semibold">{t.assign.title}</h1>

      {children.length > 1 && (
        <nav aria-label={t.assign.pickChild} className="flex flex-wrap gap-2">
          {children.map((child) => (
            <Link
              key={child.id}
              href={`/assign?childId=${child.id}`}
              aria-current={child.id === selected.id ? 'true' : undefined}
              className={`flex min-h-11 items-center rounded-full border px-4 text-sm ${
                child.id === selected.id
                  ? 'border-parent-accent bg-parent-accent/10'
                  : 'border-parent-border'
              }`}
            >
              {child.displayName}
            </Link>
          ))}
        </nav>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">{t.assign.suggestions}</h2>
          <Link
            href={`/assign?childId=${selected.id}&shuffle=${shuffleSeed + 1}`}
            className="text-parent-accent text-sm underline"
          >
            {t.assign.shuffle}
          </Link>
        </div>

        {result.exhausted ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-parent-muted text-pretty">{t.assign.exhausted}</p>
            <Link href="/library" className="text-parent-accent underline">
              {t.assign.fromLibrary}
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {result.suggestions.map((suggestion) => (
              <li
                key={suggestion.template.id}
                className="border-parent-border bg-parent-surface flex flex-col gap-2 rounded-xl border p-4"
              >
                <span className="text-parent-muted text-xs">
                  {t.activityType[suggestion.template.type]}
                </span>
                <span className="font-medium">{suggestion.template.title}</span>
                <span className="text-parent-muted text-sm">
                  {suggestion.template.estimatedMinutes} {t.library.minutes} ·{' '}
                  {t.library.difficulty} {suggestion.template.difficulty}/5
                </span>
                <span className="text-feedback-neutral text-sm">
                  {explainSuggestion(suggestion, ctx)}
                </span>
                <div className="mt-1 flex flex-wrap gap-3">
                  <Link
                    href={`/library/${suggestion.template.id}`}
                    className="text-parent-accent text-sm underline"
                  >
                    {t.library.preview}
                  </Link>
                  <AssignButton
                    action={assignActivityAction}
                    childId={selected.id}
                    templateId={suggestion.template.id}
                    label={t.assign.confirm}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
