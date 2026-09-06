# Production Deployment & Operations

**Status:** deployed; core Phase 11 live machine checks verified, final PR/merge verification pending
**Updated:** 2026-09-06
**Production URL:** `https://nuoidaycon.vercel.app`
**Supabase project:** `lpqhxznwdsbvjwglsssr` — Singapore (`ap-southeast-1`)

This document is the runbook for the live deployment. Historical setup instructions
remain where they are useful for disaster recovery or a future staging project, but they
must not be read as evidence that production still needs to be created.

The former `nuoidaycon-eight` Vercel hostname is retired: it returned
`404 DEPLOYMENT_NOT_FOUND` during Phase 11 verification. Operators must use the canonical
production URL above.

## 1. Readiness vocabulary

- **implemented** — code exists and ordinary CI covers it.
- **deployed** — the Vercel/Supabase resource exists and serves production.
- **machine-verified** — a Phase 11 read-only operator check actually inspected it.
- **pending_human** — a person must perform the check; automation must not turn it into a pass.
- **insufficient_data** — the measurement is valid but there is not yet a denominator.

## 2. Live resources

| Resource | State | Notes |
|---|---|---|
| Vercel production | machine-verified | `https://nuoidaycon.vercel.app`; HTTP smoke 5/5 pass on 2026-09-06 |
| Supabase Postgres/Auth/Storage | machine-verified | project `lpqhxznwdsbvjwglsssr`, `ACTIVE_HEALTHY`, Singapore |
| Curated activity catalogue | machine-verified | 60 approved seed activities; live/repo canonical digest matches |
| Supabase Security Advisor | machine-verified | 0 security lints in the live hosted project |
| Product metrics baseline | machine-verified | 0 families, 0 children, 0 assignments; percentage rates are `null` / `insufficient_data` |
| Custom SMTP/email deliverability | pending_human | Real Gmail and non-Gmail round-trips must still be verified |
| Anthropic generation | implemented, disabled | `AI_GENERATION_ENABLED=false`; no live AI activation in Phase 11 |

### Applied production migrations

The live `supabase_migrations.schema_migrations` table was inspected read-only and
contains exactly these repository migration versions:

1. `20260826000001_init.sql`
2. `20260826000002_functions.sql`
3. `20260826000003_rls.sql`
4. `20260826000004_storage.sql`
5. `20260826000005_ai_drafts.sql`
6. `20260905045000_harden_security_definer_rpc.sql`

Do not apply `supabase/tests/bootstrap.sql` to a hosted project. It is only the vanilla
PostgreSQL shim used by the disposable integration-test database.

## 3. Environment variables

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel | Browser-safe project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel | Browser-safe only because RLS/privileges constrain it. |
| `AI_GENERATION_ENABLED` | Vercel | Must remain `"false"` for launch. |
| `ANTHROPIC_API_KEY` | Vercel server only | Omit until every AI activation precondition is explicitly approved. |
| `SUPABASE_SERVICE_ROLE_KEY` | operator tooling only | **Never Vercel.** Bypasses RLS. |
| `PRODUCTION_BASE_URL` | operator shell | Public URL used by `pnpm smoke:production`. |
| `PRODUCTION_DATABASE_URL` | operator shell only | **Never Vercel.** Used only by the read-only DB readiness command. |
| `METRICS_DATABASE_URL` | operator shell only | **Never Vercel.** Used only by first-party aggregate metrics. |

Production database URLs are runtime inputs from a trusted operator shell. Never commit
them, paste them into logs, or store them in GitHub Actions.

## 4. Phase 11 operator checks

### 4.1 Public HTTP smoke

```bash
PRODUCTION_BASE_URL=https://nuoidaycon.vercel.app pnpm smoke:production
PRODUCTION_BASE_URL=https://nuoidaycon.vercel.app pnpm smoke:production --json
```

This is unauthenticated and read-only. It checks `/`, `/login`, `/dashboard`, `/play`
and `/settings`, validates login redirects, CSP/HSTS/frame/referrer headers,
private/no-store semantics on protected routes, and absence of `X-Powered-By`.

**Live evidence — 2026-09-06T00:17:56.796Z:** all five checks passed:
reachability, security headers, protected-route redirects, protected-route cache policy,
and framework-signature removal. The generated report returned `machineReady: true`.

Vercel preview deployments for this project are protected by Vercel SSO, so an
unauthenticated preview probe is intercepted before Next.js. Preview readiness is taken
from Vercel's deployment status; public HTTP policy is verified against the canonical
production URL.

### 4.2 Database readiness

```bash
PRODUCTION_DATABASE_URL=<connection-string> pnpm readiness:db
PRODUCTION_DATABASE_URL=<connection-string> pnpm readiness:db --json
```

The script connects once, starts `BEGIN TRANSACTION READ ONLY`, performs SELECT-only
metadata/catalog checks, then rolls back and closes. It must never seed, migrate, repair
or create production rows.

Equivalent connected Supabase read-only probes were run for the live project during
Phase 11. They confirmed:

- the six expected migration versions and required public tables;
- RLS enabled on the application tables and the expected force-RLS posture;
- no public-table grants to `anon`, with authenticated grants constrained to the expected allowlist;
- privileged helper functions in the private schema with the expected security-definer/EXECUTE posture;
- private `submissions` bucket, 15 MiB limit, JPEG/PNG/WebP MIME allowlist;
- 60 approved seed catalogue rows.

The repository and live database were independently reduced to the same sorted canonical
fields (`slug`, type, status, source, age range, response mode). Both produced count `60`
and MD5 `b8e39cea27ae52b9870ec43aa715f585`.

### 4.3 Product metrics

```bash
METRICS_DATABASE_URL=<connection-string> pnpm metrics
METRICS_DATABASE_URL=<connection-string> pnpm metrics --json
```

Product metrics use first-party rows only. `0 families` is a valid count; a rate whose
denominator does not exist is `null` / `insufficient_data`, never a fabricated `0%`.

**Live baseline on 2026-09-06:** 0 families, 0 active children, 0 assignments, 0 completed
assignments, 0 active families in 7d/28d. Completion rate and week-one return rate are
therefore `null` / `insufficient_data`. No identity or answer content was read.

### 4.4 Hosted Security Advisor

The live Supabase Security Advisor was queried on 2026-09-06 and returned **0 lints**.
This is a machine gate, not a replacement for the human cross-tenant UX check.

## 5. Auth configuration runbook

All emailed confirmation/recovery links return through `/auth/callback`, which exchanges
the PKCE code or token hash for a session cookie.

**Authentication → URL Configuration**

| Field | Production value |
|---|---|
| Site URL | `https://nuoidaycon.vercel.app` |
| Redirect URLs | `https://nuoidaycon.vercel.app/auth/callback`, `https://nuoidaycon.vercel.app/**`; keep `http://localhost:3000/auth/callback` only for local development |

**Authentication → Providers → Email**

| Setting | Required value |
|---|---|
| Email provider | ON |
| Confirm email | ON |
| Secure email change | ON |
| Minimum password length | 8 |

**Authentication → Emails → SMTP Settings**

Credentials belong in the Supabase Dashboard/provider configuration, never in this
repository, environment examples, or chat logs. The sending domain needs correct SPF,
DKIM and preferably DMARC. Real Gmail and non-Gmail delivery remains a human gate.

## 6. Machine-checkable vs human-only post-deploy gates

Phase 11 has machine-verified these live facts:

- public production URL and login route respond;
- protected routes redirect unauthenticated users to login;
- CSP/HSTS/`X-Frame-Options`/`Referrer-Policy` and cache headers match policy;
- required migrations/tables/RLS/client grants/security-definer hardening are present;
- `submissions` bucket metadata is private with the expected size/MIME restrictions;
- the live seed catalogue matches the canonical 60-activity metadata set;
- aggregate launch-context counts are readable without exposing identities;
- hosted Supabase Security Advisor reports no lints.

These remain **pending_human** until a person performs them:

- real signup confirmation and password-reset delivery on Gmail and a non-Gmail mailbox;
- two-real-parent cross-tenant UX check;
- upload a real phone photo and inspect the stored object for EXIF removal;
- verify an actual signed Storage URL stops working after its TTL;
- print a handwriting worksheet on real A4 and inspect ruling/diacritics;
- verify data export/account deletion against a real test family in a suitable non-production environment;
- Vietnam PDPD/Singapore data-residency decision;
- COPPA-style/PDPD legal review.

## 7. What CI enforces on every push

| Job | Checks |
|---|---|
| `verify` | typecheck · lint · format · provider abstraction · i18n alignment · security audit · unit tests · seed validation · launch catalogue depth |
| `database` | migrations from scratch · cross-tenant RLS matrix · schema constraints · Storage policies · security-definer RPC hardening |
| `e2e` | production build · worksheet rendering · Playwright across Chromium/WebKit, mobile/desktop and accessibility/print flows |

Ordinary CI deliberately does **not** receive production database credentials and does
not call the live production database.

## 8. Operational runbook

**Disable AI immediately:** set `AI_GENERATION_ENABLED=false` and redeploy. Existing
approved seed content is unaffected.

**A parent reports unsafe content:** follow the existing content-incident process and
archive the affected template through an authorized administrative path. Do not bypass
RLS from an application request merely to make the incident easier to resolve.

**Database recovery:** migrations are forward/idempotent scripts, not down-migrations.
Use the Supabase backup/recovery capabilities appropriate to the project plan; never
invent a destructive rollback in production.

**Suspected data exposure:** rotate affected credentials, review relevant audit events,
re-run Security Advisor and client-grant checks, and treat any unexpected `anon` grant or
public Storage exposure as a release blocker.

## 9. Remaining launch gaps

See [LAUNCH_READINESS.md](./LAUNCH_READINESS.md) for the authoritative launch gate list.
Machine verification does not close SMTP deliverability, real-device Storage, real A4
print, data residency or legal review.
