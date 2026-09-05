import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath, DEFAULT_DESTINATION } from '@/lib/auth/redirects';

/**
 * Completes an emailed auth link — confirmation, recovery, or a change of
 * email address.
 *
 * Supabase does not hand the browser a session. It hands it a one-time
 * credential and expects the application to trade it in:
 *
 *   * `?code=…`                    the PKCE flow (@supabase/ssr's default).
 *                                  The verifier lives in a cookie set when the
 *                                  email was requested, so the exchange must
 *                                  happen server-side, in this browser.
 *   * `?token_hash=…&type=…`       the older verify flow, still what some
 *                                  email templates emit.
 *
 * Without this route the link lands on a page that ignores the parameter, the
 * cookie is never written, and the parent sees a login screen after clicking
 * "confirm" — which looks exactly like the link being broken.
 *
 * Nothing here is logged. `code` and `token_hash` are live credentials for the
 * few minutes they last, and a log line is a place they would outlive the
 * request.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;

  const next = safeNextPath(searchParams.get('next'));
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  /**
   * Supabase reports its own failures — an expired or already-used link — by
   * appending `error`/`error_code` to the redirect. Treat that as the answer
   * rather than trying an exchange that cannot succeed.
   */
  if (searchParams.get('error') || searchParams.get('error_code')) {
    return NextResponse.redirect(new URL(failurePath(searchParams.get('error_code')), origin));
  }

  // No credential at all: someone typed the URL, or a mail client prefetched
  // the link and stripped the query. Decide this before creating a Supabase
  // client so the public failure path never depends on project configuration
  // or an auth-server round trip.
  if (!code && !(tokenHash && type)) {
    return NextResponse.redirect(new URL('/login', origin));
  }

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL(failurePath(error.code), origin));
    return NextResponse.redirect(new URL(next, origin));
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as Parameters<typeof supabase.auth.verifyOtp>[0]['type'],
      token_hash: tokenHash,
    });
    if (error) return NextResponse.redirect(new URL(failurePath(error.code), origin));
    return NextResponse.redirect(new URL(next, origin));
  }

  // The guard above makes this unreachable; keep a safe fallback so future
  // credential shapes cannot accidentally render the raw callback URL.
  return NextResponse.redirect(new URL('/login', origin));
}

/**
 * Where a failed link lands. The reason is reduced to a short, non-identifying
 * code — never the provider's message, which can disclose whether an address
 * is registered, and never the token itself.
 */
function failurePath(code: string | null | undefined): string {
  const expired = code === 'otp_expired' || code === 'pkce_grant_code_exchange_failed';
  return expired ? '/login?notice=link_expired' : '/login?notice=link_invalid';
}

export const dynamic = 'force-dynamic';

/** Exported for tests; the route itself always returns to the request origin. */
export const CALLBACK_DEFAULT_DESTINATION = DEFAULT_DESTINATION;
