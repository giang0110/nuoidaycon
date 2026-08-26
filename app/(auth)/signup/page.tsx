import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';
import { signUpAction } from '../actions';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default function SignUpPage() {
  const t = getMessages(DEFAULT_LOCALE);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t.auth.signUpTitle}</h1>
        <p className="text-parent-muted text-sm">{t.auth.signUpSubtitle}</p>
      </div>
      <AuthForm
        action={signUpAction}
        submitLabel={t.auth.submitSignUp}
        fields={[
          { name: 'displayName', label: t.auth.displayName, type: 'text', autoComplete: 'name' },
          { name: 'email', label: t.auth.email, type: 'email', autoComplete: 'email' },
          {
            name: 'password',
            label: t.auth.password,
            type: 'password',
            autoComplete: 'new-password',
          },
        ]}
      />
      <p className="text-parent-muted text-sm">
        {t.auth.haveAccount}{' '}
        <Link href="/login" className="underline">
          {t.auth.submitLogIn}
        </Link>
      </p>
    </div>
  );
}
