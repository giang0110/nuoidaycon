import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthenticatedParentId } from '@/lib/supabase/server';
import { logOutAction } from '@/app/(auth)/actions';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

const t = getMessages(DEFAULT_LOCALE);

/** Four destinations, no more (UX_FLOW.md §3). */
const NAV = [
  { href: '/dashboard', label: t.nav.home },
  { href: '/children', label: t.nav.children },
  { href: '/library', label: t.nav.library },
  { href: '/settings', label: t.nav.settings },
] as const;

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  // Middleware already redirects, but a layout must not assume it ran: this is
  // the server-side check that actually gates rendering.
  const parentId = await getAuthenticatedParentId();
  if (!parentId) redirect('/login');

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <nav
        aria-label={t.nav.home}
        className="border-parent-border bg-parent-surface order-2 border-t md:order-1 md:w-56 md:shrink-0 md:border-t-0 md:border-r"
      >
        <div className="hidden px-5 py-6 md:block">
          <span className="font-semibold">{t.common.appName}</span>
        </div>
        <ul className="flex md:flex-col">
          {NAV.map((item) => (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className="hover:bg-parent-bg flex min-h-14 items-center justify-center px-4 text-sm md:justify-start"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <form action={logOutAction} className="hidden px-5 py-4 md:block">
          <button type="submit" className="text-parent-muted text-sm underline">
            {t.auth.logOut}
          </button>
        </form>
      </nav>

      <div className="order-1 flex-1 md:order-2">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6">{children}</div>
      </div>

      <Link
        href="/assign"
        className="bg-parent-accent fixed right-5 bottom-20 z-10 rounded-full px-5 py-3 text-sm font-medium text-white shadow-lg md:bottom-6"
      >
        {t.nav.assign}
      </Link>
    </div>
  );
}
