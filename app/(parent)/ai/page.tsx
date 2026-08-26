import { createClient, requireParentId } from '@/lib/supabase/server';
import { createChildRepository } from '@/lib/data/supabase/repositories';
import { validateActivity } from '@/lib/domain/activity/validate';
import { ActivityPreview } from '@/components/activity-preview';
import { isGenerationEnabled, isDraftExpired } from '@/lib/ai/limits';
import { getAiConfig } from '@/lib/ai/config';
import { approveDraftAction, discardDraftAction } from './actions';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

/**
 * Stage 7 — the parent preview gate (AI_CONTENT_RULES.md).
 *
 * The parent sees the draft rendered EXACTLY as the child would, because it
 * uses the same ActivityPreview component as the library and the assign flow —
 * one implementation, three call sites. There is no auto-approve control on
 * this page, and none anywhere else.
 */
export default async function AiDraftsPage() {
  const t = getMessages(DEFAULT_LOCALE);
  const parentId = await requireParentId();
  const enabled = isGenerationEnabled(getAiConfig().env);

  const db = await createClient();
  const children = await createChildRepository(db, parentId).listByParent(parentId);

  const { data: draftRows } = await db
    .from('activity_templates')
    .select('id, payload, created_at, status')
    .eq('owner_id', parentId)
    .eq('source', 'ai')
    .order('created_at', { ascending: false });

  const now = new Date();
  const drafts = (
    (draftRows ?? []) as { id: string; payload: unknown; created_at: string; status: string }[]
  )
    .filter((row) => row.status === 'draft' && !isDraftExpired(row.created_at, now))
    .map((row) => ({ id: row.id, validation: validateActivity(row.payload) }))
    .filter((d) => d.validation.ok);

  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t.ai.title}</h1>
        <p className="text-parent-muted text-sm text-pretty">{t.ai.subtitle}</p>
      </header>

      {!enabled && <p className="text-parent-muted">{t.ai.disabled}</p>}
      {enabled && children.length === 0 && (
        <p className="text-parent-muted">{t.assign.noChildren}</p>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium">{t.ai.drafts}</h2>

        {drafts.length === 0 ? (
          <p className="text-parent-muted text-sm">{t.ai.noDrafts}</p>
        ) : (
          <ul className="flex flex-col gap-6">
            {drafts.map(({ id, validation }) => {
              if (!validation.ok) return null;
              const activity = validation.activity;
              const provenance = activity.provenance;

              return (
                <li
                  key={id}
                  className="border-parent-border flex flex-col gap-4 rounded-xl border p-5"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium tracking-wide text-orange-700 uppercase">
                      {t.ai.aiLabel}
                    </span>
                    {provenance.source === 'ai' && (
                      <span className="text-parent-muted text-xs">
                        {t.ai.generatedBy}: {provenance.model} · {t.ai.promptVersion}:{' '}
                        {provenance.promptTemplateId}@{provenance.promptTemplateVersion}
                      </span>
                    )}
                    <span className="text-parent-muted text-xs">{t.ai.expiresIn}</span>
                  </div>

                  <ActivityPreview activity={activity} />

                  <div className="flex flex-wrap gap-3">
                    {/* The only approval control in the product. */}
                    <form action={approveDraftAction}>
                      <input type="hidden" name="draftId" value={id} />
                      <button
                        type="submit"
                        className="bg-parent-accent min-h-11 rounded-lg px-5 font-medium text-white"
                      >
                        {t.ai.approve}
                      </button>
                    </form>
                    <form action={discardDraftAction}>
                      <input type="hidden" name="draftId" value={id} />
                      <button
                        type="submit"
                        className="text-parent-muted min-h-11 text-sm underline"
                      >
                        {t.ai.discard}
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
