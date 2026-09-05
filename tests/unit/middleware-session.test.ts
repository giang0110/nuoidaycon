import { describe, expect, it } from 'vitest';
import { hasSupabaseSessionCookie } from '@/lib/supabase/middleware';

describe('hasSupabaseSessionCookie', () => {
  it('does not treat a request with no Supabase session cookie as authenticated', () => {
    expect(hasSupabaseSessionCookie([])).toBe(false);
    expect(hasSupabaseSessionCookie(['theme', 'NEXT_LOCALE'])).toBe(false);
  });

  it('recognises the standard Supabase SSR auth cookie', () => {
    expect(hasSupabaseSessionCookie(['sb-lpqhxznwdsbvjwglsssr-auth-token'])).toBe(true);
  });

  it('recognises chunked Supabase SSR auth cookies', () => {
    expect(hasSupabaseSessionCookie(['sb-lpqhxznwdsbvjwglsssr-auth-token.0'])).toBe(true);
  });
});
