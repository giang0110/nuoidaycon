'use client';

import { createBrowserClient } from '@supabase/ssr';
import { getPublicEnv } from '@/lib/env';

/**
 * Browser client. Carries the anon key only — which is safe precisely because
 * RLS constrains it (decision A2). There is deliberately no admin client
 * anywhere in this codebase: the service-role key carries BYPASSRLS and never
 * appears in a request path (decision A3, lint-enforced).
 */
export function createClient() {
  const env = getPublicEnv();
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
