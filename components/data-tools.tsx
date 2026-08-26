'use client';

import { useActionState, useState } from 'react';
import type { DataState } from '@/app/(parent)/settings/data/actions';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

const t = getMessages(DEFAULT_LOCALE);

export function ExportTool({ action }: { action: () => Promise<DataState> }) {
  const [state, formAction, pending] = useActionState<DataState, FormData>(
    async () => action(),
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <button
        type="submit"
        disabled={pending}
        className="border-parent-border min-h-11 w-fit rounded-lg border px-5 font-medium disabled:opacity-60"
      >
        {t.data.exportButton}
      </button>
      {state.exportJson && (
        <>
          <p role="status" className="text-feedback-positive text-sm">
            {t.data.exportReady}
          </p>
          <textarea
            readOnly
            value={state.exportJson}
            rows={12}
            aria-label={t.data.exportTitle}
            className="border-parent-border rounded-lg border p-3 font-mono text-xs"
          />
        </>
      )}
    </form>
  );
}

/**
 * Deletion is irreversible, so the button stays disabled until the parent types
 * the confirmation word. The server re-checks it — this is a speed bump, not
 * the gate.
 */
export function DeleteAccountTool({ action }: { action: (formData: FormData) => Promise<void> }) {
  const [confirm, setConfirm] = useState('');

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t.data.deleteConfirmLabel}</span>
        <input
          name="confirm"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="off"
          className="border-parent-border min-h-11 w-32 rounded-lg border px-3"
        />
      </label>
      <button
        type="submit"
        disabled={confirm !== 'XOA'}
        className="min-h-11 w-fit rounded-lg bg-orange-700 px-5 font-medium text-white disabled:opacity-40"
      >
        {t.data.deleteButton}
      </button>
    </form>
  );
}
