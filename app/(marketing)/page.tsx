import Link from 'next/link';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default function LandingPage() {
  const t = getMessages(DEFAULT_LOCALE);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-balance">{t.common.appName}</h1>
      <p className="text-parent-muted text-lg text-pretty">{t.marketing.tagline}</p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/signup"
          className="bg-parent-accent min-h-11 rounded-lg px-5 py-2.5 font-medium text-white"
        >
          {t.marketing.ctaSignUp}
        </Link>
        <Link
          href="/login"
          className="border-parent-border min-h-11 rounded-lg border px-5 py-2.5 font-medium"
        >
          {t.marketing.ctaLogIn}
        </Link>
      </div>
      <nav className="text-parent-muted flex gap-4 text-sm">
        <Link href="/safety" className="underline">
          {t.marketing.safety}
        </Link>
        <Link href="/privacy" className="underline">
          {t.marketing.privacy}
        </Link>
      </nav>
    </main>
  );
}
