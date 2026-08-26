import { redirect } from 'next/navigation';
import { getAuthenticatedParentId } from '@/lib/supabase/server';
import '../globals.css';

/**
 * Child mode.
 *
 * Structurally separate from the parent layout so it CANNOT inherit navigation
 * by accident: there is no sidebar, no tab bar, no links out, no catalog, no
 * search, no settings, and no route back except the PIN gate
 * (CHILD_SAFETY.md §6).
 *
 * Larger and warmer than the parent app — same tokens, same component
 * primitives, different scale (UX_FLOW.md §7).
 *
 * The route is still session-gated: the PIN is a UX lock, and the actual
 * boundary is the parent's authenticated session plus RLS.
 */
export default async function ChildLayout({ children }: { children: React.ReactNode }) {
  const parentId = await getAuthenticatedParentId();
  if (!parentId) redirect('/login');

  return (
    <div className="bg-child-bg text-child-fg min-h-dvh">
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-5 py-8 text-lg">
        {children}
      </main>
    </div>
  );
}
