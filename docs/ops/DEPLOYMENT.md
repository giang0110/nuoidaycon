# Production Deployment & Operations

**Status:** deployed; Phase 11 machine verification in progress
**Updated:** 2026-09-06
**Production URL:** `https://nuoidaycon-eight.vercel.app`
**Supabase project:** `lpqhxznwdsbvjwglsssr` — Singapore (`ap-southeast-1`)

This document is now the runbook for the live deployment. Historical setup instructions
remain where they are useful for disaster recovery or a future staging project, but they
must not be read as evidence that production still needs to be created.

## 1. Readiness vocabulary

- **implemented** — code exists and ordinary CI covers it.
- **deployed** — the Vercel/Supabase resource exists and serves production.
- **machine-verified** — a Phase 11 read-only operator check has actually inspected it.
- **pending_human** — a person must perform the check; automation must not turn it into a pass.
- **insufficient_data** — the measurement is valid but there is not yet a denominator.

## 2. Live resources

| Resource | State | Notes |
|---|---|---|
| Vercel production | deployed | `https://nuoidaycon-eight.vercel.app` |
| Supabase Postgres/Auth/Storage | deployed | project `lpqhxznwdsbvjwglsssr`, Singapore |
| Curated activity catalogue | deployed | 60 approved seed activities; 15 per age band |
| Custom SMTP/email deliverability | pending_human | Real Gmail and non-Gmail round-trips must still be verified |
| Anthropic generation | implemented, disabled | `AI_GENERATION_ENABLED=false`; no live AI activation in Phase 11 |

### Applied production migrations

The repository migration set expected in production is:

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
PRODUCTION_BASE_URL=https://nuoidaycon-eight.vercel.app pnpm smoke:production
PRODUCTION_BASE_URL=https://nuoidaycon-eight.vercel.app pnpm smoke:production --json
```

This is unauthenticated and read-only. It checks `/`, `/login`, `/dashboard`, `/play`
and `/settings`, validates login redirects, CSP/HSTS/frame/referrer headers,
private/no-store semantics on protected routes, and absence of `X-Powered-By`.

### 4.2 Database readiness

```bash
PRODUCTION_DATABASE_URL=<connection-string> pnpm readiness:db
PRODUCTION_DATABASE_URL=<connection-string> pnpm readiness:db --json
```

The script connects once, starts `BEGIN TRANSACTION READ ONLY`, performs SELECT-only
metadata/catalog checks, then rolls back and closes. It must never seed, migrate, repair
or create production rows.

### 4.3 Product metrics

```bash
METRICS_DATABASE_URL=<connection-string> pnpm metrics
METRICS_DATABASE_URL=<connection-string> pnpm metrics --json
```

Product metrics use first-party rows only. `0 families` is a valid count; a rate whose
denominator does not exist is `null` / `insufficient_data`, never a fabricated `0%`.

## 5. Auth configuration runbook

All emailed confirmation/recovery links return through `/auth/callback`, which exchanges
the PKCE code or token hash for a session cookie.

**Authentication → URL Configuration**

| Field | Production value |
|---|---|
| Site URL | `https://nuoidaycon-eight.vercel.app` |
| Redirect URLs | `https://nuoidaycon-eight.vercel.app/auth/callback`, `https://nuoidaycon-eight.vercel.app/**`; keep `http://localhost:3000/auth/callback` only for local development |

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

Phase 11 automation may mark these machine-verified only after a real read-only run:

- public production URL and login route respond;
- protected routes redirect unauthenticated users to login;
- CSP/HSTS/`X-Frame-Options`/`Referrer-Policy` and cache headers match policy;
- required migrations/tables/RLS/client grants/security-definer hardening are present;
- `submissions` bucket metadata is private with the expected size/MIME restrictions;
- the live seed catalogue matches the canonical 60 activities;
- aggregate launch-context counts are readable without exposing identities.

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
Deployment success alone does not close SMTP deliverability, real-device Storage, real A4
print, data residency or legal review.
