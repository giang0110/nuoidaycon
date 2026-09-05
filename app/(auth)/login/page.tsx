import Link from 'next/link';
import { AuthForm } from '@/components/auth-form';
import { logInAction } from '../actions';
import { safeNextPath, DEFAULT_DESTINATION } from '@/lib/auth/redirects';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; notice?: string }>;
}) {
  const t = getMessages(DEFAULT_LOCALE);
  const { next, notice } = await searchParams;
  // Only same-site paths are ever echoed back into the form.
  const resolved = safeNextPath(next);
  const safeNext = resolved === DEFAULT_DESTINATION ? '' : resolved;

  /**
   * The callback route sends a failed email link here with a short code. The
   * code is a fixed member of this map — never text from the provider, which
   * could disclose whether an address is registered.
   */
  const linkNotice =
    notice === 'link_expired'
      ? t.auth.linkExpired
      : notice === 'link_invalid'
        ? t.auth.linkInvalid
        : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t.auth.logInTitle}</h1>
      {linkNotice && (
        <p role="status" className="text-sm font-medium text-orange-700">
          {linkNotice}
        </p>
      )}
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
        {/* Recovery is a full auth navigation. A plain anchor keeps it reliable
            even if client-side routing is unavailable or delayed. */}
        <a href="/forgot-password" className="underline">
          {t.auth.forgotPassword}
        </a>
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
