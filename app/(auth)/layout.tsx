import Link from 'next/link';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = getMessages(DEFAULT_LOCALE);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-6 py-12">
      <Link href="/" className="text-parent-muted text-sm">
        ← {t.common.appName}
      </Link>
      {children}
    </main>
  );
}
