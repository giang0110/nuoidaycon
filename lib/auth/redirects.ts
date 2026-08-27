/**
 * Where auth flows are allowed to send the browser.
 *
 * Every value here arrives from outside — a query string, a form field, a
 * request header — so none of it is trusted. The rules are deliberately
 * boring: an in-app path is a string that starts with exactly one `/`, and
 * anything else becomes the default.
 */

export const DEFAULT_DESTINATION = '/dashboard';

/** The route that completes an email link. Not a page — a route handler. */
export const AUTH_CALLBACK_PATH = '/auth/callback';

/**
 * Reduce an untrusted `next` value to a same-site path.
 *
 * `value.startsWith('/')` is the trap: `//evil.example` passes it and is a
 * protocol-relative URL, so `Location: //evil.example` sends the parent to
 * another host with our login in the referrer. Backslashes are rejected too —
 * some clients normalise `/\` to `//`.
 */
export function safeNextPath(value: unknown, fallback: string = DEFAULT_DESTINATION): string {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//')) return fallback;
  if (value.includes('\\')) return fallback;
  // A fragment never reaches the server; carrying one forward is meaningless
  // and only widens what the string can express.
  return value.split('#')[0] || fallback;
}

/**
 * The origin this request arrived on.
 *
 * `Origin` comes first because Next already validates it for Server Actions —
 * a mismatched origin is rejected before any of our code runs, which makes it
 * the least forgeable of the three. The forwarded headers cover the Vercel
 * proxy, and `Host` covers local development.
 *
 * Note that Supabase independently checks the resulting URL against its
 * Redirect URLs allowlist, so a spoofed host cannot turn a confirmation email
 * into a link to somewhere else — it can only make the link fail.
 */
export function resolveSiteOrigin(headers: Headers): string | null {
  const origin = headers.get('origin');
  if (origin && isAbsoluteHttpUrl(origin)) return stripTrailingSlash(origin);

  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  if (!host) return null;

  const forwardedProto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const proto = forwardedProto || (isLocalHost(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * The `emailRedirectTo` / `redirectTo` value for a Supabase auth email.
 *
 * Always the callback route, never a page: the link comes back carrying a
 * `code` (PKCE) or a `token_hash`, and something has to exchange it for a
 * session before the destination page renders. `next` rides along as a query
 * parameter and is sanitised on the way in as well as on the way out.
 */
export function buildEmailRedirect(
  origin: string | null,
  next: string = DEFAULT_DESTINATION,
): string | null {
  if (!origin) return null;
  const url = new URL(AUTH_CALLBACK_PATH, origin);
  url.searchParams.set('next', safeNextPath(next));
  return url.toString();
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isLocalHost(host: string): boolean {
  return host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]');
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}
