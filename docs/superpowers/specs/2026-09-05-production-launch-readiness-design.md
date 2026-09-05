# Phase 11 — Production Launch Readiness Design

**Date:** 2026-09-05
**Status:** Proposed for review
**Repository:** `giang0110/nuoidaycon`
**Branch:** `feat/phase-11-production-launch-readiness`

## 1. Goal

Close the engineering and operational gaps between “the product is deployed” and “the product is ready to be offered to real families” without adding new child-facing features, enabling AI, weakening privacy controls, or creating test data in production.

Phase 11 is deliberately a release-readiness phase rather than a feature phase. It turns the current operational checklist into reproducible, mostly read-only verification, updates stale documentation to match the live deployment, and separates machine-verifiable gates from human-only launch gates.

## 2. Current production state to treat as source of truth

At the start of Phase 11:

- the default branch is `claude/parent-learning-app-spec-andbvx`;
- Phase 10 is merged at `ab7576916aa74ccad8dc83dad791b3ea3211f8ba`;
- GitHub post-merge CI run #109 is green across verify/unit, RLS matrix, build and Playwright;
- Vercel reports the merge commit as successfully deployed;
- the production app is deployed at `https://nuoidaycon-eight.vercel.app`;
- the live Supabase project is `lpqhxznwdsbvjwglsssr` in Singapore (`ap-southeast-1`);
- the live catalogue contains 60 approved seeded activities, 15 per age band, all six activity types represented;
- AI generation remains disabled for launch;
- there are currently no real parent/child rows, so product metrics must report “not enough data” rather than manufacture a zero-performance baseline.

Existing `README.md` and `docs/ops/DEPLOYMENT.md` still say the product is not deployed; Phase 11 corrects that drift.

## 3. Principles and hard boundaries

1. **Read-only by default.** Automated production checks may issue HTTP GET/HEAD requests and read metadata/database state. They must not create, update or delete production rows, users, Storage objects, Auth users, or configuration.
2. **No production test identities.** Do not create a parent, child, assignment, submission or review merely to make a smoke check pass.
3. **No service-role key in Vercel.** Existing decision A3 remains binding. Administrative database credentials may be used only by local/operator scripts when explicitly supplied at runtime.
4. **No secrets in logs.** Smoke tools print pass/fail facts and sanitized identifiers only. Connection strings, keys, cookies, signed URLs and email credentials never appear in output.
5. **AI remains off.** This phase does not enable `AI_GENERATION_ENABLED`, add a provider smoke call, or weaken the explicit AI preconditions.
6. **Human gates stay human.** SMTP deliverability, a real Auth email round-trip, a real phone-photo Storage check, A4 print fidelity, PDPD/COPPA-style review and the data-residency decision cannot be truthfully marked complete by a repository-only script.
7. **Fail closed.** A production smoke check with an unexpected response, missing header, unreachable dependency, malformed JSON or ambiguous state must exit non-zero rather than report success.

## 4. Scope

### 4.1 Synchronize deployment documentation with reality

Update `README.md`, `docs/ops/DEPLOYMENT.md` and `docs/ops/LAUNCH_READINESS.md` so they no longer claim that no cloud resources exist.

The updated docs must distinguish four states:

- **implemented** — code exists and CI covers it;
- **deployed** — live Vercel/Supabase resources exist;
- **machine-verified** — Phase 11 automation has checked it read-only;
- **human-verified / pending** — a person must complete the gate.

Do not rewrite historical design decisions merely because the app is now deployed.

### 4.2 Add a public production smoke script

Add a Node/TypeScript operator script, proposed path:

`scripts/production-smoke.ts`

Invocation:

```bash
PRODUCTION_BASE_URL=https://nuoidaycon-eight.vercel.app pnpm smoke:production
PRODUCTION_BASE_URL=https://nuoidaycon-eight.vercel.app pnpm smoke:production --json
```

The script performs only unauthenticated HTTP checks:

1. public landing page is reachable over HTTPS;
2. `/login` is reachable;
3. protected routes such as `/dashboard`, `/play` and one route shape that does not require a real id redirect unauthenticated users to `/login` rather than exposing content;
4. global response headers include the expected CSP, HSTS, `X-Frame-Options` and `Referrer-Policy` values/presence from `lib/security/csp.ts` / `next.config.ts`;
5. protected/session-bearing routes carry private/no-store cache semantics where applicable;
6. responses do not expose `X-Powered-By`;
7. redirects stay on the configured production origin or the expected local login path — no open redirect is accepted;
8. output is deterministic and machine-readable with `--json`.

The script must have timeouts and clearly distinguish network failure, wrong status, wrong redirect and missing-header failures.

### 4.3 Add a live Supabase readiness script

Add a second operator script, proposed path:

`scripts/production-db-readiness.ts`

Invocation uses a database URL supplied by the operator from a trusted machine:

```bash
PRODUCTION_DATABASE_URL=<connection string> pnpm readiness:db
PRODUCTION_DATABASE_URL=<connection string> pnpm readiness:db --json
```

This script is read-only and must execute inside a `READ ONLY` transaction where PostgreSQL supports it. It may inspect:

- expected migration/version state available from the production database;
- required public tables and known security-definer hardening objects;
- RLS enabled/forced state and client grants relevant to `anon`/`authenticated`;
- the `submissions` Storage bucket configuration when represented in database metadata;
- activity catalogue totals, approval/source counts, uniqueness and per-band/per-type coverage;
- current counts of `auth.users`, `profiles` and `children` for launch context.

It must not run migrations, seed data, alter policies, repair rows or call write-capable RPCs.

The canonical catalogue expectations remain 60 approved seeded activities, 15 in each age band, all six types represented in every band, with zero response-mode mismatches.

If a check depends on a hosted Supabase API/Advisor surface that is not represented in PostgreSQL metadata, the operator workflow may use the connected Supabase management tool during verification; the repository script must not imitate an unavailable API or claim to check it.

### 4.4 Preserve and operationalize product metrics

Keep `scripts/metrics.ts` as the product metrics authority. Do not move product-wide metrics into the web app and do not add a third-party analytics SDK.

Phase 11 should:

- add explicit readiness documentation around `pnpm metrics --json`;
- ensure an empty production/staging dataset yields `null` for rates where no denominator exists;
- record the first baseline result in an operator-readable launch-readiness section without committing private identifiers or database credentials;
- distinguish `0 families` from `0% retention`.

The proposed launch thresholds remain proposals until explicitly accepted by a person:

- 20 families with at least one child and one completed activity;
- at least 60% return after week one;
- at least 50% completion rate;
- zero children at or above 80% catalogue consumption in the first fortnight.

### 4.5 Add a single launch-readiness report shape

Introduce a small shared type/formatter for operator scripts so production smoke, DB readiness and metrics can be summarized consistently.

A check result should be one of:

- `pass` — verified fact satisfies the requirement;
- `fail` — verified fact violates the requirement;
- `pending_human` — cannot be verified safely by automation;
- `not_applicable` — intentionally outside the current configuration;
- `insufficient_data` — valid for metrics where the denominator does not yet exist.

Do not convert `pending_human` or `insufficient_data` to `pass`.

A final operator report may show the following human gates as pending:

- Gmail and non-Gmail signup/reset deliverability;
- real Auth confirmation and recovery round-trip;
- real phone photo upload plus stored EXIF inspection;
- signed-URL expiry verified against a real uploaded object;
- real A4 handwriting worksheet print check;
- Vietnam PDPD/Singapore data-residency decision;
- COPPA-style/PDPD legal review.

### 4.6 CI coverage

Production is an external dependency, so ordinary PR CI must **not** depend on the live production URL or production database credentials.

CI should instead test the tools themselves using fixtures/local servers:

- HTTP smoke parser against deterministic local responses for success, redirect, timeout and missing-header cases;
- DB readiness query/aggregation logic against the existing disposable Postgres test environment or pure fixtures where possible;
- JSON output schema and redaction behavior;
- empty-dataset metrics semantics;
- docs/status contract where useful.

The live production commands are operator-run release gates, not every-push CI jobs.

## 5. Architecture

### 5.1 Pure readiness domain

Create a small pure module, proposed path:

`lib/domain/readiness/`

Responsibilities:

- define `ReadinessStatus` and `ReadinessCheck`;
- aggregate checks into a report without treating pending items as passes;
- format JSON-safe output;
- perform no network or database access.

This follows the existing architecture rule that domain code stays pure.

### 5.2 Operator adapters

`scripts/production-smoke.ts` owns HTTP transport only.

`scripts/production-db-readiness.ts` owns PostgreSQL transport only.

`scripts/metrics.ts` remains the existing metrics adapter and may reuse the readiness formatter only if doing so does not make product metrics semantics less clear.

No Next.js route, Server Action or browser component gets administrative credentials.

### 5.3 Configuration

Required runtime configuration is explicit environment input:

- `PRODUCTION_BASE_URL` for HTTP smoke;
- `PRODUCTION_DATABASE_URL` for DB readiness;
- `METRICS_DATABASE_URL` for existing metrics.

None of these are committed. `PRODUCTION_DATABASE_URL` and `METRICS_DATABASE_URL` are operator-only and must never be Vercel environment variables.

## 6. Error handling and safety

- HTTP requests use a bounded timeout and no automatic credential forwarding.
- Redirect chains are bounded.
- Database readiness opens one connection, starts a read-only transaction, performs checks, rolls back/closes.
- Any attempted write statement is a design error and should be absent from the script/test corpus.
- JSON mode writes only the report to stdout; diagnostics go to stderr.
- Secret-looking input values must not be interpolated into errors.
- A failed live check leaves production unchanged.

## 7. Testing requirements

Unit/contract tests must cover at least:

1. production smoke succeeds for expected headers and redirects;
2. missing CSP/HSTS/frame/referrer headers fail;
3. unexpected 200 on a protected route fails;
4. cross-origin redirect fails;
5. timeout/network failure fails without leaking the target query string or credentials;
6. readiness status aggregation never upgrades `pending_human` to `pass`;
7. empty metrics produce `insufficient_data`/`null`, not a misleading percentage;
8. DB readiness coverage catches a missing expected table/policy/catalog invariant;
9. DB readiness script contains no DDL/DML mutation path;
10. JSON output is stable and contains no configured database URL.

Existing full CI, RLS matrix and Playwright must remain green.

## 8. Live verification sequence after merge

After Phase 11 code merges:

1. confirm default branch post-merge CI is green;
2. confirm Vercel deployment for the merge commit succeeds;
3. run `pnpm smoke:production` against the production URL;
4. run DB readiness read-only against `lpqhxznwdsbvjwglsssr`;
5. run `pnpm metrics --json` against the chosen staging/production database and record the empty/baseline semantics truthfully;
6. re-run Supabase Security Advisor through the connected management surface if available;
7. update the launch-readiness document with the machine-verified results and leave human-only gates unchecked;
8. do not enable AI as part of Phase 11.

## 9. Out of scope

- fixing SPF/DKIM/DMARC at the DNS/provider level;
- sending real signup/reset emails automatically from CI;
- creating synthetic production users or children;
- uploading a synthetic production child photo;
- legal advice or declaring PDPD/COPPA compliance;
- changing Supabase region;
- enabling or testing live AI generation;
- adding notifications, payments, co-parent sharing or new child-facing features;
- adding third-party analytics.

## 10. Definition of done

Phase 11 is complete when:

- deployment/readiness docs accurately state that the app is deployed;
- production smoke and DB-readiness operator scripts exist, are read-only and are covered by tests;
- all ordinary CI jobs remain green;
- a live HTTP smoke run passes against production;
- a live read-only DB readiness run passes the machine-verifiable Supabase/catalog/security checks;
- metrics baseline is run and reported with correct empty-data semantics;
- the final launch-readiness document clearly separates machine-passed gates from human-pending gates;
- no production data was created or mutated by Phase 11 verification;
- AI remains disabled.
