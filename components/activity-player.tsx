'use client';

import { useActionState } from 'react';
import type { ChildViewActivity } from '@/lib/domain/activity/child-view';
import type { SubmitState } from '@/app/(child)/play/[assignmentId]/actions';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

const t = getMessages(DEFAULT_LOCALE);

/**
 * The six activity renderers.
 *
 * Fed a `ChildViewActivity` — a DISTINCT type from `Activity` — so this
 * component cannot be handed the full activity and compile anyway. It has no
 * access to answer keys, rationales, exemplars or option feedback, because
 * those were stripped server-side before the props were serialised
 * (ACTIVITY_MODEL.md §7.1).
 *
 * No timer, no countdown, no score (principle P6).
 */
export function ActivityPlayer({
  activity,
  action,
  printHref,
}: {
  activity: ChildViewActivity;
  action: (prev: SubmitState, formData: FormData) => Promise<SubmitState>;
  printHref: string;
}) {
  const [state, formAction, pending] = useActionState<SubmitState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{activity.title}</h1>
        <p className="text-pretty">{activity.instructions}</p>
      </header>

      <Body activity={activity} printHref={printHref} />

      {state.error && (
        <p role="alert" className="text-base text-orange-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-child-accent min-h-14 rounded-xl px-8 text-lg font-medium text-white disabled:opacity-60"
      >
        {t.play.submit}
      </button>
    </form>
  );
}

function PhotoField() {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-medium">{t.play.takePhoto}</span>
      {/* Photograph the WORK, not the child. */}
      <span className="text-child-fg/60 text-sm text-pretty">{t.play.photoHint}</span>
      <input
        type="file"
        name="photos"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="min-h-14 rounded-xl border border-black/10 px-4 py-3"
      />
    </label>
  );
}

function TextField({ id, label, maxWords }: { id: string; label: string; maxWords: number }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-medium">{label}</span>
      <textarea
        name={`text.${id}`}
        rows={4}
        maxLength={maxWords * 12}
        className="min-h-32 rounded-xl border border-black/10 px-4 py-3 text-lg"
      />
    </label>
  );
}

function Body({ activity, printHref }: { activity: ChildViewActivity; printHref: string }) {
  switch (activity.type) {
    case 'handwriting':
      return (
        <div className="flex flex-col gap-5">
          <ul className="flex flex-wrap gap-3">
            {activity.payload.items.map((item) => (
              <li key={item} className="bg-child-surface rounded-xl px-5 py-3 text-2xl">
                {item}
              </li>
            ))}
          </ul>
          <a href={printHref} className="w-fit underline">
            {t.play.printThis}
          </a>
          <PhotoField />
        </div>
      );

    case 'drawing_prompt':
      return (
        <div className="flex flex-col gap-5">
          <p className="text-pretty">{activity.payload.prompt}</p>
          <ul className="flex list-disc flex-col gap-1 pl-6">
            {activity.payload.checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <a href={printHref} className="w-fit underline">
            {t.play.printThis}
          </a>
          <PhotoField />
        </div>
      );

    case 'story_comprehension':
      return (
        <div className="flex flex-col gap-6">
          <Story story={activity.payload.story} />
          <ol className="flex flex-col gap-6">
            {activity.payload.questions.map((q) => (
              <li key={q.id} className="flex flex-col gap-3">
                <p className="font-medium text-pretty">{q.prompt}</p>
                {q.kind === 'multiple_choice' ? (
                  <div className="flex flex-col gap-2">
                    {q.choices.map((choice) => (
                      <label
                        key={choice.id}
                        className="bg-child-surface flex min-h-14 cursor-pointer items-center gap-3 rounded-xl px-4"
                      >
                        <input type="radio" name={`choice.${q.id}`} value={choice.id} />
                        <span>{choice.text}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <TextField id={q.id} label={t.play.yourAnswer} maxWords={q.maxWords} />
                )}
              </li>
            ))}
          </ol>
        </div>
      );

    case 'story_summary':
      return (
        <div className="flex flex-col gap-6">
          <Story story={activity.payload.story} />
          <ul className="text-child-fg/70 flex list-disc flex-col gap-1 pl-6 text-base">
            {activity.payload.guidance.promptHints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
          <TextField
            id="summary"
            label={t.play.yourAnswer}
            maxWords={activity.payload.guidance.maxWords}
          />
        </div>
      );

    case 'reflection':
      return (
        <ol className="flex flex-col gap-6">
          {activity.payload.questions.map((q) => (
            <li key={q.id} className="flex flex-col gap-3">
              <p className="font-medium text-pretty">{q.prompt}</p>
              {q.sentenceStarters.length > 0 && (
                <ul className="text-child-fg/60 flex flex-col gap-0.5 text-base">
                  {q.sentenceStarters.map((starter) => (
                    <li key={starter}>{starter}</li>
                  ))}
                </ul>
              )}
              <TextField id={q.id} label={t.play.yourAnswer} maxWords={120} />
            </li>
          ))}
        </ol>
      );

    case 'situation_judgment':
      return (
        <div className="flex flex-col gap-5">
          <p className="text-pretty">{activity.payload.scenario}</p>
          <p className="font-medium">{activity.payload.question}</p>

          {activity.payload.options && (
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">{t.play.chooseOne}</legend>
              {activity.payload.options.map((option) => (
                <label
                  key={option.id}
                  className="bg-child-surface flex min-h-14 cursor-pointer items-center gap-3 rounded-xl px-4"
                >
                  <input type="radio" name="choice.situation" value={option.id} />
                  <span className="text-pretty">{option.text}</span>
                </label>
              ))}
            </fieldset>
          )}

          {/* Always present, always valid (CHILD_SAFETY.md §5.6). */}
          <p className="rounded-xl bg-black/5 px-4 py-3 text-base text-pretty">
            {t.play.trustedAdult}: {activity.payload.trustedAdultPath.text}
          </p>

          <TextField id="answer" label={t.play.yourAnswer} maxWords={150} />
        </div>
      );
  }
}

function Story({ story }: { story: { title: string; paragraphs: string[] } }) {
  return (
    <article className="bg-child-surface flex flex-col gap-3 rounded-2xl p-5">
      <h2 className="text-xl font-semibold">{story.title}</h2>
      {story.paragraphs.map((p) => (
        <p key={p} className="text-pretty">
          {p}
        </p>
      ))}
    </article>
  );
}
