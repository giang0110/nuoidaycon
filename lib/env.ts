import { z } from 'zod';

/**
 * The single place application code reads configuration.
 *
 * Decision A3 (docs/product/PRODUCT_SPEC.md §10): the Supabase service-role key
 * bypasses RLS entirely, so it must never be reachable from a request path. It
 * is deliberately absent from this schema — migration and seed scripts under
 * `scripts/` read it from `process.env` directly, and ESLint bars the rest of
 * the codebase from touching `process.env` at all.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverEnvSchema = publicEnvSchema.extend({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Parse the public (browser-safe) environment. Throws with a readable message
 * listing every missing variable rather than failing at the first use site.
 */
export function readPublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid public environment:\n${formatIssues(result.error)}`);
  }
  return result.data;
}

export function readServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid server environment:\n${formatIssues(result.error)}`);
  }
  return result.data;
}

function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
}

/**
 * The public environment, read from `process.env` in the one module allowed to
 * touch it (decision A3, enforced by ESLint everywhere else).
 *
 * The `NEXT_PUBLIC_*` names are referenced as literals rather than looked up
 * dynamically, because Next.js inlines them at build time for the client
 * bundle and a computed key would not be replaced.
 */
export function getPublicEnv(): PublicEnv {
  return readPublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
