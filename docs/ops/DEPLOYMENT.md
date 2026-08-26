# Deployment Readiness

**Status:** production-ready, **NOT DEPLOYED**
**Date:** 2026-08-26
**Scope:** Phases 0–9 of [the implementation plan](../superpowers/plans/2026-08-25-parenting-app-mvp.md)

No cloud resource has been created. Everything below is what a human must do to
put this into production, in order.

---

## 1. Cloud resources still required

Nothing in this repository provisions infrastructure. These must be created by a
person with the appropriate account:

| Resource | Why | Notes |
|---|---|---|
| **Supabase project** | Postgres, Auth, Storage | Region: Singapore unless open question **Q5** (Vietnam PDPD data residency) says otherwise. Decide before launch, not after — moving data later is far harder. |
| **Custom SMTP provider** | Signup confirmation and password reset | Supabase's built-in sender is rate-limited and not for production. **Deliverability to Vietnamese mailboxes must be verified before launch** — a parent who cannot receive a reset email cannot use the product. |
| **Vercel project** | Hosting | Framework preset: Next.js. Node 22. |
| **Anthropic API key** | Phase 8 generation only | Only needed if AI is switched on. The product works fully without it. |

## 2. Environment variables

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel (all environments) | Safe to expose. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel (all environments) | Safe to expose **because RLS constrains it**. |
| `AI_GENERATION_ENABLED` | Vercel | `"false"` at launch. Any value other than the exact string `true` leaves generation off. |
| `ANTHROPIC_API_KEY` | Vercel (server only) | Omit until AI is enabled. Never prefix with `NEXT_PUBLIC_`. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Nowhere in Vercel** | Bypasses RLS entirely. Local migrations and the seed script only (decision A3). A lint rule and the security audit both enforce its absence from application code. |

## 3. Order of operations

1. **Create the Supabase project.** Note the URL and anon key.
2. **Apply migrations in filename order** — `supabase/migrations/*.sql`, 0001 through 0005.
   They are idempotent, so a partial run can be repeated safely.
   *Do not* apply `supabase/tests/bootstrap.sql`: it is a local shim that recreates
   parts of Supabase's own `auth` and `storage` schemas for testing, and it lives
   outside `migrations/` precisely so it cannot reach a project.
3. **Seed reference data and the catalog:**
   ```
   SEED_DATABASE_URL=<project connection string> pnpm db:seed
   psql <connection string> -f supabase/seed/0001_interests.sql
   ```
4. **Configure Auth:** enable email confirmations, point at the custom SMTP
   provider, and set the site URL and redirect URLs to the production domain.
5. **Verify the storage bucket** is `submissions`, private, 15 MB limit,
   jpeg/png/webp only. Migration 0004 creates it; confirm it in the dashboard.
6. **Deploy to Vercel** with the environment variables above.
7. **Run the post-deploy checklist** below before giving the URL to anyone.

## 4. Post-deploy checklist

Security and privacy:

- [ ] `SUPABASE_SERVICE_ROLE_KEY` is absent from every Vercel environment
- [ ] Signing in as two separate parents, neither can see the other's children — the
      single most important check in the product
- [ ] An unauthenticated request to `/dashboard`, `/play` and `/print/<id>` redirects to `/login`
- [ ] A photo's storage URL is not publicly fetchable without a signed token
- [ ] A signed URL stops working after its TTL
- [ ] Response headers carry the CSP, HSTS, `X-Frame-Options` and `Referrer-Policy` from `next.config.ts`
- [ ] An uploaded photo taken on a real phone has no EXIF once stored

Function:

- [ ] Signup → email arrives → confirm → dashboard, on a Vietnamese mailbox
- [ ] Password reset round-trip on the same mailbox
- [ ] Create a child, assign an activity, complete it in child mode, review it
- [ ] Print a handwriting worksheet on real A4 and check the `vở ô ly` ruling and diacritics
- [ ] Data export downloads and contains what it should
- [ ] Account deletion removes rows **and** Storage objects

AI (only if enabling Phase 8):

- [ ] `AI_GENERATION_ENABLED=false` verified to block generation
- [ ] Preconditions in [AI_CONTENT_RULES.md](../product/AI_CONTENT_RULES.md) §8 all hold
- [ ] A written data-processing agreement with the model provider exists
- [ ] One real generation reviewed end to end by a person before any parent sees the feature

## 5. What CI enforces on every push

| Job | Checks |
|---|---|
| `verify` | typecheck · lint · format · provider abstraction · i18n key alignment · **security audit** · unit tests · seed content validation |
| `database` | migrations from scratch · cross-tenant RLS matrix · schema constraints · storage policies · the meta-test that fails when a table is added without matrix coverage |
| `e2e` | build · worksheet rendering · Playwright across mobile and desktop, including accessibility and print fidelity |

## 6. Known gaps

Honest list of what has **not** been verified, and why.

| Gap | Reason | Before launch |
|---|---|---|
| **Auth flows never run against a real auth server** | No Supabase instance was reachable from the build environment; container image pulls are blocked by network policy. Redirects, validation and every database rule are tested; the GoTrue round-trip is not. | Run the function checklist above manually. |
| **Storage upload never run against a real Storage API** | Same. `sanitiseImage` is tested with real GPS-tagged JPEGs; the upload call itself is not. | Upload a real phone photo and inspect the stored object. |
| **No live model call** | No API key present. The pipeline is tested against a scripted provider, which is the right way to test what the pipeline *does with* a response — but the adapter itself has never spoken to the API. | One smoke test before enabling AI. |
| **WebKit e2e not run locally** | Only Chromium was available in the build sandbox. CI installs both. | Confirm the CI e2e job is green. |
| **Performance not measured on a real network** | No deployment. | Measure from Vietnam on 4G after the first deploy. |
| **Legal review outstanding** | Out of engineering scope. | COPPA-style and Vietnam PDPD review of [CHILD_SAFETY.md](../product/CHILD_SAFETY.md) §8. |

## 7. Operational runbook

**Disable AI immediately:** set `AI_GENERATION_ENABLED=false` in Vercel and redeploy
the environment variable. No code deploy needed. Existing approved content is
unaffected.

**A parent reports unsafe content:** the report lands in `content_reports`. Set the
template's `status` to `'archived'` — it leaves the catalog at once. Assignments
already made keep their immutable snapshot, which is correct: a child's completed
work must not change under them. If the content must be withdrawn from a child too,
delete the assignment.

**Rolling back a migration:** the migrations are additive and idempotent, with no
down-scripts. Roll back by restoring a Supabase point-in-time backup — verify PITR
is enabled before launch.

**Suspected data exposure:** rotate the anon key, review `audit_events` for the
affected parent ids, and check `information_schema.role_table_grants` for anything
granted to `anon` (the security audit asserts this is empty).
