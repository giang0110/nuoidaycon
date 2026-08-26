'use client';

import { useActionState } from 'react';
import type { AssignState } from '@/app/(parent)/assign/actions';

export function AssignButton({
  action,
  childId,
  templateId,
  label,
}: {
  action: (prev: AssignState, formData: FormData) => Promise<AssignState>;
  childId: string;
  templateId: string;
  label: string;
}) {
  const [state, formAction, pending] = useActionState<AssignState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="childId" value={childId} />
      <input type="hidden" name="templateId" value={templateId} />
      <button
        type="submit"
        disabled={pending}
        className="bg-parent-accent min-h-11 rounded-lg px-4 text-sm font-medium text-white disabled:opacity-60"
      >
        {label}
      </button>
      {state.error && (
        <span role="alert" className="text-xs text-orange-700">
          {state.error}
        </span>
      )}
    </form>
  );
}
