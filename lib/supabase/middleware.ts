import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getPublicEnv } from '@/lib/env';

/**
 * Route groups that require an authenticated parent.
 *
 * Must cover every route under the (parent) and (child) layouts. The layouts
 * re-check server-side and RLS is the actual boundary, so a gap here is not a
 * hole — but it costs the ?next= round-trip and invites the reader to assume
 * the omitted route is public.
 */
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/children',
  '/library',
  '/settings',
  '/assign',
  '/assignments',
  '/ai',
  '/play',
  '/print',
];

/**
 * Auth screens an ALREADY signed-in parent has no reason to see.
 *
 * `/reset-password` is deliberately NOT here. A recovery link signs the parent
 * in — a recovery session is a session — so bouncing authenticated visitors to
 * /dashboard would make the reset form unreachable by the only people who ever
 * need it. `updateUser` requires that session anyway, and a signed-in parent
 * changing their own password is a legitimate thing to do.
 */
const AUTH_PREFIXES = ['/login', '/signup', '/forgot-password'];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isAuthPath(pathname: string): boolean {
  return AUTH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refresh the session cookie and gate protected routes.
 *
 * This is a convenience redirect, not the authorisation boundary — RLS is
 * (decision A2). A request that slips past this still cannot read another
 * family's data.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const env = getPublicEnv();

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && isProtectedPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}
