'use client';

import { useActionState } from 'react';
import type { ReviewState } from '@/app/(parent)/assignments/actions';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

const t = getMessages(DEFAULT_LOCALE);

/** Three one-tap verdicts (UX_FLOW.md §4.4). No stars, no numeric rating. */
const VERDICTS = [
  { value: 'too_easy', label: t.review.tooEasy },
  { value: 'just_right', label: t.review.justRight },
  { value: 'too_hard', label: t.review.tooHard },
] as const;

export function ReviewForm({
  action,
  existingVerdict,
}: {
  action: (prev: ReviewState, formData: FormData) => Promise<ReviewState>;
  existingVerdict: string | null;
}) {
  const [state, formAction, pending] = useActionState<ReviewState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-3">
        <legend className="font-medium">{t.review.verdictQuestion}</legend>
        <div className="flex flex-wrap gap-2">
          {VERDICTS.map((verdict) => (
            <label key={verdict.value} className="cursor-pointer">
              <input
                type="radio"
                name="verdict"
                value={verdict.value}
                defaultChecked={existingVerdict === verdict.value}
                required
                className="peer sr-only"
              />
              <span className="border-parent-border peer-checked:border-parent-accent peer-checked:bg-parent-accent/10 flex min-h-12 items-center rounded-xl border px-5">
                {verdict.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t.review.note}</span>
        <span className="text-parent-muted text-xs">{t.review.noteHint}</span>
        <textarea
          name="note"
          rows={3}
          maxLength={2000}
          className="border-parent-border rounded-lg border px-3 py-2"
        />
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-orange-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-parent-accent min-h-11 w-fit rounded-lg px-5 font-medium text-white disabled:opacity-60"
      >
        {t.review.save}
      </button>
    </form>
  );
}
