import Link from 'next/link';
import { createClient, requireParentId } from '@/lib/supabase/server';
import { createTemplateRepository } from '@/lib/data/supabase/repositories';
import { ACTIVITY_TYPES, type ActivityType } from '@/lib/domain/entities';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

function isActivityType(value: string | undefined): value is ActivityType {
  return value !== undefined && (ACTIVITY_TYPES as readonly string[]).includes(value);
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; difficulty?: string }>;
}) {
  const t = getMessages(DEFAULT_LOCALE);
  await requireParentId();
  const { type, difficulty } = await searchParams;

  const db = await createClient();
  const parsedDifficulty = Number(difficulty);
  const templates = await createTemplateRepository(db).listApproved({
    ...(isActivityType(type) ? { type } : {}),
    ...(Number.isInteger(parsedDifficulty) && parsedDifficulty >= 1 && parsedDifficulty <= 5
      ? { minDifficulty: parsedDifficulty, maxDifficulty: parsedDifficulty }
      : {}),
  });

  const href = (params: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries({ type, difficulty, ...params })) {
      if (v) search.set(k, v);
    }
    const query = search.toString();
    return query ? `/library?${query}` : '/library';
  };

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t.library.title}</h1>
        <p className="text-parent-muted text-sm">
          {templates.length} {t.library.count}
        </p>
      </header>

      <nav aria-label={t.library.filterType} className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <FilterChip href={href({ type: undefined })} active={!isActivityType(type)}>
            {t.library.filterAll}
          </FilterChip>
          {ACTIVITY_TYPES.map((activityType) => (
            <FilterChip
              key={activityType}
              href={href({ type: activityType })}
              active={type === activityType}
            >
              {t.activityType[activityType]}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterChip href={href({ difficulty: undefined })} active={!difficulty}>
            {t.library.filterDifficulty}: {t.library.filterAll}
          </FilterChip>
          {[1, 2, 3, 4, 5].map((level) => (
            <FilterChip
              key={level}
              href={href({ difficulty: String(level) })}
              active={difficulty === String(level)}
            >
              {level}
            </FilterChip>
          ))}
        </div>
      </nav>

      {templates.length === 0 ? (
        <p className="text-parent-muted">{t.library.empty}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {templates.map((template) => (
            <li key={template.id}>
              <Link
                href={`/library/${template.id}`}
                className="border-parent-border bg-parent-surface flex flex-col gap-1 rounded-xl border px-4 py-3"
              >
                <span className="text-parent-muted text-xs">{t.activityType[template.type]}</span>
                <span className="font-medium">{template.title}</span>
                <span className="text-parent-muted text-sm">
                  {template.estimatedMinutes} {t.library.minutes} · {t.library.difficulty}{' '}
                  {template.difficulty}/5
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`flex min-h-11 items-center rounded-full border px-4 text-sm ${
        active ? 'border-parent-accent bg-parent-accent/10' : 'border-parent-border'
      }`}
    >
      {children}
    </Link>
  );
}
