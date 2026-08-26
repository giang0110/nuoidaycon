import { AuthForm } from '@/components/auth-form';
import { updatePasswordAction } from '../actions';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default function ResetPasswordPage() {
  const t = getMessages(DEFAULT_LOCALE);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t.auth.resetTitle}</h1>
      <AuthForm
        action={updatePasswordAction}
        submitLabel={t.auth.savePassword}
        fields={[
          {
            name: 'password',
            label: t.auth.newPassword,
            type: 'password',
            autoComplete: 'new-password',
          },
        ]}
      />
    </div>
  );
}
