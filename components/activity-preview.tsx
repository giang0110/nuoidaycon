import type { Activity } from '@/lib/domain/activity/schema';
import { toChildView } from '@/lib/domain/activity/child-view';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

const t = getMessages(DEFAULT_LOCALE);

/**
 * The shared activity preview.
 *
 * ONE implementation with three call sites: the library, the assign flow, and
 * (from Phase 8) the AI approval gate. What the parent previews here is
 * literally what the child sees, because the child section renders the same
 * `toChildView()` projection the child player is given.
 *
 * The parent-only section is rendered from the FULL activity and is clearly
 * marked. It is a server component, so answer keys never reach a client bundle
 * unless a parent is actually looking at this page.
 */
export function ActivityPreview({ activity }: { activity: Activity }) {
  const childView = toChildView(activity);

  return (
    <article className="flex flex-col gap-6">
      <section className="border-parent-border bg-parent-surface flex flex-col gap-4 rounded-xl border p-5">
        <p className="text-parent-muted text-xs font-medium tracking-wide uppercase">
          {t.library.childSees}
        </p>
        <h2 className="text-xl font-semibold">{childView.title}</h2>
        <p className="text-pretty">{childView.instructions}</p>
        <ChildPayload view={childView} />
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-dashed p-5">
        <p className="text-parent-muted text-xs font-medium tracking-wide uppercase">
          {t.library.parentOnly}
        </p>
        <ParentOnly activity={activity} />
      </section>
    </article>
  );
}

function ChildPayload({ view }: { view: ReturnType<typeof toChildView> }) {
  switch (view.type) {
    case 'handwriting':
      return (
        <ul className="flex flex-wrap gap-2">
          {view.payload.items.map((item) => (
            <li key={item} className="border-parent-border rounded-lg border px-3 py-1.5 text-lg">
              {item}
            </li>
          ))}
        </ul>
      );

    case 'drawing_prompt':
      return (
        <div className="flex flex-col gap-3">
          <p className="text-pretty">{view.payload.prompt}</p>
          <ul className="list-disc pl-5 text-sm">
            {view.payload.checklist.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      );

    case 'story_comprehension':
    case 'story_summary':
      return (
        <div className="flex flex-col gap-3">
          <h3 className="font-medium">{view.payload.story.title}</h3>
          {view.payload.story.paragraphs.map((p) => (
            <p key={p} className="text-pretty">
              {p}
            </p>
          ))}
          {view.type === 'story_comprehension' && (
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
              {view.payload.questions.map((q) => (
                <li key={q.id}>
                  {q.prompt}
                  {q.kind === 'multiple_choice' && (
                    <ul className="text-parent-muted mt-1 flex flex-col gap-0.5 pl-2">
                      {q.choices.map((c) => (
                        <li key={c.id}>· {c.text}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      );

    case 'reflection':
      return (
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          {view.payload.questions.map((q) => (
            <li key={q.id} className="text-pretty">
              {q.prompt}
            </li>
          ))}
        </ol>
      );

    case 'situation_judgment':
      return (
        <div className="flex flex-col gap-3">
          <p className="text-pretty">{view.payload.scenario}</p>
          <p className="font-medium">{view.payload.question}</p>
          {view.payload.options && (
            <ul className="flex flex-col gap-1.5 text-sm">
              {view.payload.options.map((o) => (
                <li key={o.id} className="border-parent-border rounded-lg border px-3 py-2">
                  {o.text}
                </li>
              ))}
            </ul>
          )}
          <p className="text-feedback-neutral text-sm">{view.payload.trustedAdultPath.text}</p>
        </div>
      );
  }
}

function ParentOnly({ activity }: { activity: Activity }) {
  return (
    <div className="text-parent-muted flex flex-col gap-3 text-sm">
      {activity.parentNote && <p className="text-pretty">{activity.parentNote}</p>}

      {activity.type === 'story_comprehension' &&
        activity.payload.questions.map((q) => (
          <div key={q.id} className="flex flex-col gap-1">
            <p className="text-parent-fg font-medium">{q.prompt}</p>
            {q.kind === 'multiple_choice' ? (
              <>
                <p>
                  {t.library.answerKey}: {q.choices.find((c) => c.id === q.answerKey)?.text}
                </p>
                <p>
                  {t.library.rationale}: {q.rationale}
                </p>
              </>
            ) : (
              <p>
                {t.library.exemplar}: {q.exemplarAnswer}
              </p>
            )}
          </div>
        ))}

      {activity.type === 'story_summary' && (
        <p>
          {t.library.mustMention}: {activity.payload.guidance.mustMention.join(' · ')}
        </p>
      )}

      {activity.type === 'situation_judgment' && activity.payload.options && (
        <ul className="flex flex-col gap-1">
          {activity.payload.options.map((o) => (
            <li key={o.id}>
              {o.isConstructive ? '✓' : '·'} {o.text} — {o.feedback}
            </li>
          ))}
        </ul>
      )}

      {activity.type === 'reflection' && activity.payload.conversationStarter && (
        <p className="text-pretty">{activity.payload.conversationStarter}</p>
      )}
    </div>
  );
}
