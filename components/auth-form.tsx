'use client';

import { useActionState } from 'react';
import type { AuthState } from '@/app/(auth)/actions';

export interface Field {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password';
  autoComplete?: string;
  required?: boolean;
}

interface Props {
  action: (prev: AuthState, formData: FormData) => Promise<AuthState>;
  fields: Field[];
  submitLabel: string;
  hidden?: Record<string, string>;
}

export function AuthForm({ action, fields, submitLabel, hidden }: Props) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {hidden &&
        Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

      {fields.map((field) => (
        <label key={field.name} className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{field.label}</span>
          <input
            name={field.name}
            type={field.type}
            autoComplete={field.autoComplete}
            required={field.required ?? true}
            minLength={field.type === 'password' ? 8 : undefined}
            className="border-parent-border focus:border-parent-accent focus:ring-parent-accent/30 min-h-11 rounded-lg border px-3 py-2 text-base outline-none focus:ring-2"
          />
        </label>
      ))}

      {state.error && (
        <p role="alert" className="text-sm font-medium text-orange-700">
          {state.error}
        </p>
      )}
      {state.notice && (
        <p role="status" className="text-feedback-positive text-sm font-medium">
          {state.notice}
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
