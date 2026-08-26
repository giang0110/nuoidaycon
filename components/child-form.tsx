'use client';

import { useActionState } from 'react';
import type { ChildFormState } from '@/app/(parent)/children/actions';
import { AVATAR_KEYS, MAX_INTERESTS, MIN_INTERESTS } from '@/lib/domain/child-profile';
import { GRADE_LEVELS } from '@/lib/domain/entities';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

const t = getMessages(DEFAULT_LOCALE);

export interface InterestOption {
  id: string;
  label: string;
}

interface Props {
  action: (prev: ChildFormState, formData: FormData) => Promise<ChildFormState>;
  submitLabel: string;
  interests: InterestOption[];
  defaults?: {
    displayName?: string;
    birthYear?: number;
    birthMonth?: number;
    grade?: string;
    avatarKey?: string;
    interestIds?: string[];
  };
}

const CURRENT_YEAR = new Date().getUTCFullYear();
const YEARS = Array.from({ length: 15 }, (_, i) => CURRENT_YEAR - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function ChildForm({ action, submitLabel, interests, defaults }: Props) {
  const [state, formAction, pending] = useActionState<ChildFormState, FormData>(action, {});
  const err = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t.child.nickname}</span>
        <span className="text-parent-muted text-xs">{t.child.nicknameHint}</span>
        <input
          name="displayName"
          defaultValue={defaults?.displayName}
          maxLength={40}
          required
          className="border-parent-border min-h-11 rounded-lg border px-3 py-2 text-base"
        />
        {err('displayName') && (
          <span role="alert" className="text-xs text-orange-700">
            {err('displayName')}
          </span>
        )}
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">
          {t.child.birthMonth} / {t.child.birthYear}
        </legend>
        {/* Month + year only. There is no day field anywhere (principle P5). */}
        <span className="text-parent-muted text-xs">{t.child.birthHint}</span>
        <div className="flex gap-3">
          <select
            name="birthMonth"
            defaultValue={defaults?.birthMonth ?? ''}
            required
            aria-label={t.child.birthMonth}
            className="border-parent-border min-h-11 flex-1 rounded-lg border px-3"
          >
            <option value="" disabled>
              {t.child.birthMonth}
            </option>
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            name="birthYear"
            defaultValue={defaults?.birthYear ?? ''}
            required
            aria-label={t.child.birthYear}
            className="border-parent-border min-h-11 flex-1 rounded-lg border px-3"
          >
            <option value="" disabled>
              {t.child.birthYear}
            </option>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        {(err('birthMonth') || err('birthYear')) && (
          <span role="alert" className="text-xs text-orange-700">
            {err('birthMonth') ?? err('birthYear')}
          </span>
        )}
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t.child.grade}</span>
        <select
          name="grade"
          defaultValue={defaults?.grade ?? 'grade_1'}
          required
          className="border-parent-border min-h-11 rounded-lg border px-3"
        >
          {GRADE_LEVELS.map((g) => (
            <option key={g} value={g}>
              {t.grade[g]}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t.child.avatar}</legend>
        {/* Preset illustrations only — a child's photo is never uploaded. */}
        <span className="text-parent-muted text-xs">{t.child.avatarHint}</span>
        <div className="flex flex-wrap gap-2">
          {AVATAR_KEYS.map((key) => (
            <label key={key} className="cursor-pointer">
              <input
                type="radio"
                name="avatarKey"
                value={key}
                defaultChecked={(defaults?.avatarKey ?? 'cat') === key}
                className="peer sr-only"
              />
              <span className="border-parent-border peer-checked:border-parent-accent peer-checked:bg-parent-accent/10 flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-sm">
                {key}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t.child.interests}</legend>
        <span className="text-parent-muted text-xs">{t.child.interestsHint}</span>
        <div className="flex flex-wrap gap-2">
          {interests.map((interest) => (
            <label key={interest.id} className="cursor-pointer">
              <input
                type="checkbox"
                name="interestIds"
                value={interest.id}
                defaultChecked={defaults?.interestIds?.includes(interest.id)}
                className="peer sr-only"
              />
              <span className="border-parent-border peer-checked:border-parent-accent peer-checked:bg-parent-accent/10 flex min-h-11 items-center rounded-full border px-4 text-sm">
                {interest.label}
              </span>
            </label>
          ))}
        </div>
        {err('interestIds') && (
          <span role="alert" className="text-xs text-orange-700">
            {err('interestIds')}
          </span>
        )}
        <span className="text-parent-muted text-xs">
          {MIN_INTERESTS}–{MAX_INTERESTS}
        </span>
      </fieldset>

      {state.error && (
        <p role="alert" className="text-sm font-medium text-orange-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-parent-accent min-h-11 rounded-lg px-4 py-2.5 font-medium text-white disabled:opacity-60"
      >
        {submitLabel}
      </button>
    </form>
  );
}
