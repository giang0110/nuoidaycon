# Phase 11 Production Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reproducible, read-only production readiness checks for the deployed app and live Supabase project, preserve truthful empty-data metrics semantics, and synchronize operations documentation without enabling AI or mutating production data.

**Architecture:** Keep readiness evaluation pure in `lib/domain/readiness/`. HTTP and PostgreSQL access live only in operator scripts under `scripts/`. PR CI tests the logic against fixtures/disposable Postgres; live production checks are operator-run gates and never require production credentials in GitHub Actions or Vercel.

**Tech Stack:** TypeScript, Node 22+, pnpm 10.33, Vitest, PostgreSQL/pg, Next.js 16, Supabase, GitHub Actions, Vercel.

**Spec:** `docs/superpowers/specs/2026-09-05-production-launch-readiness-design.md`

## Global Constraints

- Production verification is read-only: no INSERT/UPDATE/DELETE/DDL, no seed, no Auth user creation, no Storage upload.
- `SUPABASE_SERVICE_ROLE_KEY`, `PRODUCTION_DATABASE_URL`, and `METRICS_DATABASE_URL` must never be Vercel runtime variables.
- No production test identities or child data are created.
- AI remains disabled; Phase 11 must not enable or live-test generation.
- JSON output must not contain database URLs, cookies, signed URLs, query strings, or credentials.
- Human gates stay pending unless a person actually performs them: SMTP/Auth email round-trip, real phone-photo/EXIF, signed URL TTL, real A4 print, PDPD/COPPA-style review, data residency decision.
- Ordinary CI must not depend on production URL or production database credentials.

---

### Task 1: Pure readiness report domain

**Files:**
- Create: `lib/domain/readiness/report.ts`
- Create: `tests/unit/readiness-report.test.ts`

**Interfaces:**
- Produces `ReadinessStatus = 'pass' | 'fail' | 'pending_human' | 'not_applicable' | 'insufficient_data'`.
- Produces `ReadinessCheck { id, label, status, detail? }` and `ReadinessReport { generatedAt, checks, blockingFailures, pendingHuman, insufficientData, machinePasses }`.
- Produces `buildReadinessReport(checks, generatedAt)` and `hasBlockingFailure(report)`.

- [ ] **Step 1: Write failing unit tests** for deterministic aggregation, fail precedence, and preserving `pending_human` / `insufficient_data` as non-pass states.
- [ ] **Step 2: Run** `pnpm test:unit -- tests/unit/readiness-report.test.ts` and confirm failure is due to missing module/API.
- [ ] **Step 3: Implement the minimal pure domain** with stable check order and no IO imports.
- [ ] **Step 4: Re-run the focused test** and then `pnpm test:unit`.
- [ ] **Step 5: Commit** `feat: add launch readiness report domain`.

### Task 2: HTTP production smoke checker

**Files:**
- Create: `lib/domain/readiness/http.ts`
- Create: `scripts/production-smoke.ts`
- Create: `tests/unit/production-smoke.test.ts`
- Modify: `package.json`

**Interfaces:**
- Pure `evaluateHttpProbe(input)` converts one normalized response/error into `ReadinessCheck[]`.
- Script reads only `PRODUCTION_BASE_URL`, supports `--json`, uses bounded timeout and manual redirect handling, and checks `/`, `/login`, `/dashboard`, `/play`, `/settings`.
- Package script: `smoke:production`.

- [ ] **Step 1: Write failing tests** for expected headers/redirects, missing CSP/HSTS/frame/referrer headers, unexpected 200 on protected routes, cross-origin redirect, timeout/network failure, and redaction of URL query strings.
- [ ] **Step 2: Run focused unit tests** and confirm RED for missing implementation.
- [ ] **Step 3: Implement pure HTTP evaluation** including expected CSP presence, exact `X-Frame-Options: DENY`, expected `Referrer-Policy`, HSTS presence, no `X-Powered-By`, and private/no-store semantics on protected routes.
- [ ] **Step 4: Implement `scripts/production-smoke.ts`** using `fetch(..., { redirect: 'manual', signal })`; never forward credentials; validate production base URL is HTTPS except explicit localhost test fixtures.
- [ ] **Step 5: Add package script** and run focused tests plus `pnpm typecheck`.
- [ ] **Step 6: Commit** `feat: add read-only production HTTP smoke checks`.

### Task 3: Read-only PostgreSQL readiness checker

**Files:**
- Create: `lib/domain/readiness/database.ts`
- Create: `scripts/production-db-readiness.ts`
- Create: `tests/unit/database-readiness.test.ts`
- Create: `tests/integration/production-db-readiness.test.ts`
- Modify: `package.json`

**Interfaces:**
- Pure `evaluateDatabaseSnapshot(snapshot)` validates schema/security/catalog invariants.
- Script reads only `PRODUCTION_DATABASE_URL`, opens one `pg.Client`, runs `BEGIN READ ONLY`, SELECT-only probes, then `ROLLBACK` and closes.
- Package script: `readiness:db`.

**Required snapshot checks:**
- expected public tables exist;
- latest hardening migration/version is present when `supabase_migrations.schema_migrations` exists;
- `private` SECURITY DEFINER helpers exist; no matching privileged SECURITY DEFINER functions remain in `public`;
- anon has no direct public-table privileges; authenticated grants remain scoped;
- RLS is enabled on all product tables and expected FORCE RLS subset remains forced;
- `storage.buckets.id='submissions'` exists, `public=false`, 15 MB limit, jpeg/png/webp;
- catalog: 60 approved seeded rows, 60 distinct ids/slugs, 15 per age band, all six activity types in every band, zero response-mode mismatch;
- launch context counts for `auth.users`, `profiles`, `children` are reported but do not turn zero into failure.

- [ ] **Step 1: Write failing pure tests** for a valid snapshot and one missing-table/security/catalog invariant.
- [ ] **Step 2: Write failing integration test** against the existing disposable Postgres harness verifying the checker uses only SELECTs inside a read-only transaction and succeeds after `applySchema()`/seed.
- [ ] **Step 3: Implement the pure evaluator** with stable IDs/details and no pg import.
- [ ] **Step 4: Implement SELECT-only snapshot queries** in `production-db-readiness.ts`; SQL text must contain no INSERT/UPDATE/DELETE/ALTER/DROP/CREATE/TRUNCATE/CALL.
- [ ] **Step 5: Add package script** and run unit + integration tests.
- [ ] **Step 6: Commit** `feat: add read-only database readiness checks`.

### Task 4: Metrics readiness semantics

**Files:**
- Modify: `tests/unit/product-metrics.test.ts`
- Modify only if needed: `lib/domain/metrics/product.ts`
- Modify only if useful without changing existing JSON contract: `scripts/metrics.ts`

- [ ] **Step 1: Add/strengthen tests** proving empty dataset returns `familiesTotal=0`, `completionRate=null`, `returnedAfterFirstWeek=null`, and therefore cannot be read as `0%` performance.
- [ ] **Step 2: Run the focused metrics tests** and verify current behavior; if already green, do not change production logic unnecessarily.
- [ ] **Step 3: If needed, minimally fix semantics** and re-run `pnpm test:unit`.
- [ ] **Step 4: Commit** only if code/test changes are required: `test: lock launch metrics empty-data semantics`.

### Task 5: Documentation and operator commands

**Files:**
- Modify: `README.md`
- Modify: `docs/ops/DEPLOYMENT.md`
- Modify: `docs/ops/LAUNCH_READINESS.md`
- Modify: `.env.example` only with commented operator-variable documentation; never real values.
- Create: `tests/unit/launch-readiness-docs.test.ts`

- [ ] **Step 1: Write failing docs contract test** asserting docs no longer say `NOT DEPLOYED`/`No cloud resource has been created`, production URL is documented, operator commands are documented, AI launch state remains disabled, and human gates are not marked complete.
- [ ] **Step 2: Run focused test** and confirm RED on stale docs.
- [ ] **Step 3: Update docs** to distinguish implemented/deployed/machine-verified/human-pending states; retain the historical setup instructions as a runbook rather than pretending resources still need creation.
- [ ] **Step 4: Add commented examples** for `PRODUCTION_BASE_URL`, `PRODUCTION_DATABASE_URL`, `METRICS_DATABASE_URL` with explicit “operator only / never Vercel” wording.
- [ ] **Step 5: Run focused test, `pnpm format:check`, and `pnpm audit:security`**.
- [ ] **Step 6: Commit** `docs: synchronize production launch readiness`.

### Task 6: Full branch verification and live read-only gates

**Files:**
- Modify: `docs/ops/LAUNCH_READINESS.md` with dated machine-verification evidence only after checks run.

- [ ] **Step 1: Run ordinary branch CI** and require verify, RLS matrix, and Playwright green.
- [ ] **Step 2: Run live HTTP smoke** against `https://nuoidaycon-eight.vercel.app`; require all machine checks pass.
- [ ] **Step 3: Run live Supabase DB readiness read-only** against project `lpqhxznwdsbvjwglsssr` using connected Supabase SQL/metadata if a raw operator DB URL is not available in this session; do not substitute writes.
- [ ] **Step 4: Run/read equivalent product metrics baseline** with read-only SQL if `METRICS_DATABASE_URL` is unavailable; record 0 families with `null` rates truthfully if still empty.
- [ ] **Step 5: Run Supabase Security Advisor** and record zero security advisories or document any blockers with remediation links.
- [ ] **Step 6: Update `LAUNCH_READINESS.md`** with exact date and machine results; keep SMTP/photo/print/legal/data-residency gates pending unless genuinely verified by a person.
- [ ] **Step 7: Re-run full branch CI after documentation evidence commit**.

### Task 7: Review, PR, merge, post-merge verification

**Files:** no new feature files unless review finds a defect.

- [ ] **Step 1: Compare feature branch against default branch** and confirm no migration/schema mutation, no production credentials, no temporary workflows.
- [ ] **Step 2: Request/review the complete diff** against the Phase 11 spec; fix any blocker via TDD and re-run all gates.
- [ ] **Step 3: Open PR** to `claude/parent-learning-app-spec-andbvx` with verification evidence.
- [ ] **Step 4: Merge only when PR CI and Vercel preview are green and the expected head SHA still matches.**
- [ ] **Step 5: Confirm default branch points to merge commit; require post-merge CI green and Vercel production deployment success.**
- [ ] **Step 6: Re-run unauthenticated production HTTP smoke against the newly deployed merge commit.**
- [ ] **Step 7: Phase 11 is complete only if post-merge smoke matches pre-merge result; AI remains disabled.**
