import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getPublicEnv } from '@/lib/env';

/**
 * Server client for server components, route handlers and server actions.
 *
 * Anon key only. Every query it makes is subject to RLS, so a forgotten
 * ownership predicate in application code cannot leak another family's rows.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const env = getPublicEnv();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component, where cookies are read-only. The
          // middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * The authenticated parent, or null.
 *
 * Always uses `getUser()`, never `getSession()`: `getSession` reads the cookie
 * without verifying it, so it can be forged. Anything that gates access must
 * ask the auth server.
 */
export async function getAuthenticatedParentId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Throwing variant for server actions, which must never proceed unauthenticated. */
export async function requireParentId(): Promise<string> {
  const parentId = await getAuthenticatedParentId();
  if (!parentId) throw new Error('UNAUTHENTICATED');
  return parentId;
}
