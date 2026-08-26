import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';
import { logInAction } from '../actions';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const t = getMessages(DEFAULT_LOCALE);
  const { next } = await searchParams;
  // Only same-site paths are ever echoed back into the form.
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '';

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t.auth.logInTitle}</h1>
      <AuthForm
        action={logInAction}
        submitLabel={t.auth.submitLogIn}
        hidden={safeNext ? { next: safeNext } : undefined}
        fields={[
          { name: 'email', label: t.auth.email, type: 'email', autoComplete: 'email' },
          {
            name: 'password',
            label: t.auth.password,
            type: 'password',
            autoComplete: 'current-password',
          },
        ]}
      />
      <div className="text-parent-muted flex flex-col gap-2 text-sm">
        <Link href="/forgot-password" className="underline">
          {t.auth.forgotPassword}
        </Link>
        <p>
          {t.auth.noAccount}{' '}
          <Link href="/signup" className="underline">
            {t.auth.submitSignUp}
          </Link>
        </p>
      </div>
    </div>
  );
}
