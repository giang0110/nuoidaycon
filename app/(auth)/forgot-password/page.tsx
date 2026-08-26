import { AuthForm } from '@/components/auth-form';
import { requestPasswordResetAction } from '../actions';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default function ForgotPasswordPage() {
  const t = getMessages(DEFAULT_LOCALE);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t.auth.forgotTitle}</h1>
        <p className="text-parent-muted text-sm">{t.auth.forgotSubtitle}</p>
      </div>
      <AuthForm
        action={requestPasswordResetAction}
        submitLabel={t.auth.sendResetLink}
        fields={[{ name: 'email', label: t.auth.email, type: 'email', autoComplete: 'email' }]}
      />
    </div>
  );
}
