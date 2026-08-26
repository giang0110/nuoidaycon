'use client';

import { useActionState } from 'react';
import type { PinState } from '@/app/(parent)/settings/safety/actions';

export function PinForm({
  action,
  label,
  submit,
}: {
  action: (prev: PinState, formData: FormData) => Promise<PinState>;
  label: string;
  submit: string;
}) {
  const [state, formAction, pending] = useActionState<PinState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="\d{4}"
          maxLength={4}
          required
          className="border-parent-border min-h-11 w-32 rounded-lg border px-3 text-center text-lg tracking-[0.5em]"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-orange-700">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="text-feedback-positive text-sm">
          {state.notice}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="bg-parent-accent min-h-11 w-fit rounded-lg px-4 font-medium text-white disabled:opacity-60"
      >
        {submit}
      </button>
    </form>
  );
}
