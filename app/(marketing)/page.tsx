import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default function LandingPage() {
  const t = getMessages(DEFAULT_LOCALE);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-balance">{t.common.appName}</h1>
      <p className="text-parent-muted text-lg text-pretty">{t.marketing.tagline}</p>
      <p className="text-parent-muted text-sm">
        Phase 1 — technical foundation. Xây dựng theo{' '}
        <code className="rounded bg-black/5 px-1 py-0.5">docs/product/PRODUCT_SPEC.md</code>.
      </p>
    </main>
  );
}
