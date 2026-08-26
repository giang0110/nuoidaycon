'use client';

import { useActionState } from 'react';
import type { UnlockState } from '@/app/(child)/play/actions';

export function UnlockForm({
  action,
  label,
  submit,
}: {
  action: (prev: UnlockState, formData: FormData) => Promise<UnlockState>;
  label: string;
  submit: string;
}) {
  const [state, formAction, pending] = useActionState<UnlockState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span>{label}</span>
        <input
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          required
          autoFocus
          className="min-h-14 w-40 rounded-xl border border-black/10 px-4 text-center text-2xl tracking-[0.5em]"
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
        className="bg-child-accent min-h-14 w-fit rounded-xl px-8 text-lg font-medium text-white disabled:opacity-60"
      >
        {submit}
      </button>
    </form>
  );
}
