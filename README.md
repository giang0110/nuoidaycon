# Nuôi Dạy Con

A parent-guided learning web app. A parent creates profiles for their children and
assigns short, age-appropriate activities; the child completes them in a PIN-gated child
mode; the parent reviews the result, which adapts future difficulty.

**The parent owns the account. Children are profiles, never accounts. There is no
unrestricted AI chat for children — not behind a flag, not "supervised".**

## Documentation

Read these before changing anything. They are the contract, not background reading.

| Document | What it settles |
|---|---|
| [PRODUCT_SPEC.md](docs/product/PRODUCT_SPEC.md) | Principles, MVP scope and non-goals, architecture, database model, RLS |
| [ACTIVITY_MODEL.md](docs/product/ACTIVITY_MODEL.md) | The canonical Activity schema and its validation layers |
| [CHILD_SAFETY.md](docs/product/CHILD_SAFETY.md) | Hard prohibitions, age policy, content rules, security controls |
| [AI_CONTENT_RULES.md](docs/product/AI_CONTENT_RULES.md) | The Phase 8 AI pipeline — design only, not built |
| [UX_FLOW.md](docs/product/UX_FLOW.md) | Routes, navigation, core flows, screens |
| [Implementation plan](docs/superpowers/plans/2026-08-25-parenting-app-mvp.md) | The ten phases and what "done" means for each |

## Status

**All nine phases complete — production-ready, not deployed.**

Parents can sign up, create child profiles, browse and assign activities from a curated
Vietnamese catalog, hand the device to a child in a PIN-gated child mode, review the
work, and print worksheets. AI generation exists behind a mandatory parent approval
gate and ships switched off.

See [docs/ops/DEPLOYMENT.md](docs/ops/DEPLOYMENT.md) for what a human still has to do,
including an honest list of what has not been verified.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 ·
Supabase (Postgres + Auth + Storage) · Vitest · Playwright · Vercel · GitHub Actions.

## Getting started

```bash
pnpm install
cp .env.example .env.local     # fill in the Supabase values
pnpm dev
```

Requires Node 22+ and pnpm 10+.

## Scripts

| Command | Does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |
| `pnpm test:unit` | Vitest unit tests (no database needed) |
| `pnpm test:integration` | Database security tests (needs `TEST_DATABASE_URL`) |
| `pnpm db:up` / `db:reset` / `db:down` | Disposable local PostgreSQL for those tests |
| `pnpm test:e2e` | Playwright |
| `pnpm validate:content` | L1–L3 validation over seeded activities |
| `pnpm check:no-llm` | Asserts one provider abstraction, all others banned |
| `pnpm audit:security` | Static security audit (secrets, RLS, storage, CSP, logging) |
| `pnpm check:i18n` | Asserts locale catalogues share a key shape |
| **`pnpm verify`** | **Everything above except e2e — run before pushing** |

### Running the database security tests

The cross-tenant RLS matrix runs against a **disposable local PostgreSQL** — never a
hosted project:

```bash
pnpm db:up                 # prints TEST_DATABASE_URL
export TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:55432/nuoidaycon_test"
pnpm test:integration
pnpm db:down               # when finished
```

Without `TEST_DATABASE_URL` the suites skip — except in CI, where a guard test fails
rather than let a missing database look like a pass.

`supabase/tests/bootstrap.sql` recreates just enough of Supabase's `auth` and `storage`
schemas for vanilla PostgreSQL to run the real policies. It lives outside
`supabase/migrations/` so it can never reach a project.

### Running Playwright in a sandbox

If the environment ships a preinstalled Chromium whose build differs from the one
Playwright expects, reuse it rather than downloading:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:e2e
```

## Architecture in one paragraph

`lib/domain` is pure: the activity schema, the age policy, the recommendation engine and
the safety validators are plain functions over interfaces, with **no** imports of
Supabase, Next.js or React — enforced by ESLint, not by discipline. `lib/data` holds
repository interfaces and their Supabase implementations. Authorisation is Row Level
Security: RLS is enabled on all twelve tables, `anon` holds no privilege at all, the
curated catalog is read-only for clients at the privilege level, and the service-role key
is barred from every request path. Assignments store an immutable snapshot of the
activity — enforced by a database trigger, not by convention — and answer keys are
stripped server-side before anything reaches the child's browser.

## Layout

```
app/            routes — (marketing) (auth) (parent) (child) print
components/     UI primitives and app components
lib/domain/     pure: activity schema, policy, engine, safety validators
lib/data/       repository interfaces + Supabase implementations
lib/i18n/       message catalogues (vi primary, en keys present)
content/seeds/  curated activities, validated in CI
supabase/       migrations (schema, functions, RLS, storage) + local test shim
tests/          unit · integration · e2e
scripts/        CI guards and the content validator
```
