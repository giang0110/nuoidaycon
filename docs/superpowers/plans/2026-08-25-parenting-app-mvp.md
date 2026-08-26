# Implementation Plan — Parent-Guided Learning App

**Date:** 2026-08-25 (revised 2026-08-26 — Phase 0 cleanup)
**Status:** Phase 0 complete. Phases 1–9 **not started.**
**Repository:** `ntgiang1235-ux/nuoidaycon`
**Branch:** `claude/parent-learning-app-spec-andbvx`

**Specification:**
[PRODUCT_SPEC.md](../../product/PRODUCT_SPEC.md) ·
[ACTIVITY_MODEL.md](../../product/ACTIVITY_MODEL.md) ·
[CHILD_SAFETY.md](../../product/CHILD_SAFETY.md) ·
[AI_CONTENT_RULES.md](../../product/AI_CONTENT_RULES.md) ·
[UX_FLOW.md](../../product/UX_FLOW.md)

---

## Goal

A parent-owned learning app: a parent creates child profiles, the system suggests
age-appropriate activities from a curated Vietnamese library, the child completes them in
a PIN-gated child mode, and the parent reviews the result — which adapts future
difficulty.

**MVP = Phases 0–7.** Phase 8 (AI personalisation) is a later increment, gated behind the
preconditions in [AI_CONTENT_RULES.md](../../product/AI_CONTENT_RULES.md) §8. Phase 9
(production hardening) is the release gate: it is run against the Phase 0–7 scope for the
MVP launch, and re-run against Phase 8 before any AI reaches a parent.

## Working agreements

1. **TDD throughout.** Write the failing test, watch it fail for the right reason, make it pass, refactor. Pure domain logic in `lib/domain` reaches ≥ 90% branch coverage.
2. **Each phase is independently verifiable** — a green `pnpm verify` and a stated, checkable "done when".
3. **RLS is the authorisation boundary.** No feature is done until the cross-tenant matrix ([PRODUCT_SPEC.md](../../product/PRODUCT_SPEC.md) §11.4) covers its tables for read/insert/update/delete.
4. **TypeScript is a safety layer, not a security boundary.** Every rule that matters is also enforced at runtime, and — where the data model allows — in the database.
5. **The service-role key never appears in a request path** — migrations and seed scripts only, lint-banned elsewhere.
6. **No LLM dependency in `package.json` through Phase 7.** CI enforces it; the check is lifted deliberately at Phase 8, never by drift.
7. **Commit per task.** Conventional commits. Push only to the designated branch, and only when the user asks.
8. **`pnpm verify` = `typecheck && lint && test:unit && test:integration && validate:content && test:e2e`.**

## Phase overview

| Phase | Name | Ships | MVP |
|---|---|---|---|
| 0 | Specification | The five product docs + this plan | ✅ done |
| 1 | Technical Foundation | Repo, toolchain, CI, i18n scaffolding, deploy target | ✅ |
| 2 | Database + Security | Schema, RLS, cross-tenant matrix, Storage | ✅ |
| 3 | Authentication + Child Profiles | Parent auth, app shell, child CRUD | ✅ |
| 4 | Activity Engine | Canonical schema, validators, age policy, recommendation, seed content | ✅ |
| 5 | Assignment + Child Mode + Submission | Assign flow, child mode, six players, submissions | ✅ |
| 6 | Parent Review + Progress | Review, adaptation loop, history, deletion | ✅ |
| 7 | Worksheets | Printables, handwriting ruling and font | ✅ |
| 8 | AI Personalization | The eight-stage pipeline, gated | ❌ post-MVP |
| 9 | Production Hardening | Privacy, a11y, perf, CI gates, release | ✅ (re-run after 8) |

```
P1 ──→ P2 ──→ P3 ──→ P5 ──→ P6 ──→ P7 ──→ P9 ──→ [MVP launch]
       └────→ P4 ──────↑                          └──→ P8 ──→ P9 (re-run)
```

P4 depends on P2 only for the `activity_templates` table and can otherwise run **in
parallel with P3**. Content authoring inside P4 should start as early as possible and
continue through P5–P7 — it is the longest-lead item, though no longer a gate (see
"Content scope" below).

## Content scope

**~20–25 original Vietnamese activities for the MVP**, covering all six types across the
age bands. This is a launch target, **not a precondition for implementation** — the
engine, the players and the review loop are all built and tested against fixtures, not
against a full library.

All MVP content is **original work authored for this product**. Commercial book text,
textbook extracts, and in-copyright stories are never copied. The `attribution` field
exists for future public-domain or properly licensed material.

---

## Phase 0 — Specification ✅ COMPLETE

**Deliverable:** an agreed product definition before any application code.

Produced: [PRODUCT_SPEC.md](../../product/PRODUCT_SPEC.md),
[ACTIVITY_MODEL.md](../../product/ACTIVITY_MODEL.md),
[CHILD_SAFETY.md](../../product/CHILD_SAFETY.md),
[AI_CONTENT_RULES.md](../../product/AI_CONTENT_RULES.md),
[UX_FLOW.md](../../product/UX_FLOW.md), and this plan.

Locked corrections applied in the cleanup pass: households removed in favour of direct
parent ownership · `birth_year` + `birth_month` canonical with age never persisted ·
AI approval reframed as defence in depth rather than a type-system guarantee · RLS
enabled everywhere with `FORCE` applied selectively and an explicit cross-tenant matrix ·
roadmap consolidated to ten phases · content scope cut to ~20–25 original activities ·
server-side EXIF removal · worksheet typography deferred to Phase 7.

**Done when:** the five docs and this plan are internally consistent and the open
questions have documented defaults. ✅

---

## Phase 1 — Technical Foundation

**Deliverable:** an empty but fully wired application that builds, tests, lints and deploys.

### Tasks
1. Next.js (App Router) + TypeScript `strict` + React; pnpm; pinned Node version.
2. Tailwind CSS + shadcn/ui; design tokens for the two moods (parent / child) from [UX_FLOW.md](../../product/UX_FLOW.md) §7. **UI** font with complete Vietnamese diacritic coverage — the *worksheet* handwriting font is Phase 7 and is not decided here.
3. ESLint + Prettier; `import/no-restricted-paths` forbidding `lib/domain/**` from importing `lib/data/**`, `lib/supabase/**`, `next/**` or `react` — decision A1 enforced by lint. Lint rule banning `SUPABASE_SERVICE_ROLE_KEY` outside `scripts/` and `supabase/`.
4. Vitest (unit + integration projects, coverage thresholds) and Playwright (Chromium + WebKit, mobile viewport project), one smoke test each.
5. Directory skeleton per [PRODUCT_SPEC.md](../../product/PRODUCT_SPEC.md) §10.
6. i18n scaffolding: `lib/i18n` catalogue, `vi` primary, `en` keys present and untranslated, typed `t()`, CI check for missing/orphaned keys, lint rule against hardcoded user-facing literals.
7. GitHub Actions `ci.yml`: typecheck → lint → unit → build → e2e.
8. **`no-llm-dependency` CI check** (decision A9). Prove the guard works by adding a fake LLM package and watching CI fail.
9. Vercel project + Supabase project (Singapore region, pending Q5); `.env.example`; documented secrets. **No service-role key in any Vercel runtime environment.**
10. `README.md` and `CONTRIBUTING.md` (TDD, commit convention, content-authoring rules including the original-content requirement).

### Done when
`pnpm verify` passes on a clean clone · CI green on a PR · a placeholder page live on a Vercel preview · the `no-llm-dependency` check demonstrably fails on a planted dependency.

---

## Phase 2 — Database + Security

**Deliverable:** the full Postgres schema with proven tenant isolation. No UI.

### Tasks
1. Migration `0001_init`: the seven enums and the **twelve tables** of [PRODUCT_SPEC.md](../../product/PRODUCT_SPEC.md) §11 — `profiles`, `children`, `interests`, `child_interests`, `activity_templates`, `child_type_progress`, `assignments`, `submissions`, `submission_assets`, `assignment_reviews`, `content_reports`, `audit_events`. **No `households` / `household_members`** — a child belongs to one parent via `children.parent_id`.
2. Child birth data as `birth_year int` + `birth_month int check between 1 and 12`. **No date-of-birth column, and no age column anywhere.**
3. `activity_templates.source` and `activity_templates.approved_by_parent_id` as **real columns**, not jsonb fields, so Phase 8 can constrain them.
4. Constraints: `difficulty between 1 and 5` · unique `submissions.assignment_id` · unique `assignment_reviews.assignment_id` · `assignments.content_snapshot not null` · cascade deletes from `profiles` down.
5. Indexes: `children(parent_id)` · `assignments(child_id, status)` · `assignments(child_id, template_id, assigned_at)` for cooldown lookups · `activity_templates(type, status, locale)` · GIN on `activity_templates.interest_tags`.
6. Migration `0002_rls`: `ENABLE ROW LEVEL SECURITY` on **every** table; the ownership policies of §11.1; the `activity_templates` read policy; `interests` as authenticated-read-only; **nothing granted to `anon`**.
7. **Selective `FORCE ROW LEVEL SECURITY`** per the table-by-table rationale in §11.2 — on `submissions`, `submission_assets`, `assignment_reviews`, `content_reports`; **not** on tables a trigger, migration or the seed loader legitimately writes as owner. Each `FORCE` carries a SQL comment stating why.
8. Trigger: create the `profiles` row on `auth.users` insert. Trigger: initialise six `child_type_progress` rows on `children` insert.
9. Migration `0003_storage`: private `submissions` bucket; policy asserting `(storage.foldername(name))[1] = auth.uid()::text`; MIME and size limits.
10. Local Supabase via CLI; `db:reset`, `db:migrate`, `db:seed` scripts. Generated TypeScript DB types with a CI freshness check.

### Tests — the cross-tenant RLS matrix is the deliverable
Integration, against local Postgres, with parent **A**, parent **B**, and **anon**:
- Every cell of the §11.4 matrix: `SELECT` returns zero rows; `INSERT` / `UPDATE` / `DELETE` raise or affect zero rows, per table.
- A meta-test enumerating `information_schema.tables` that **fails if any table in `public` is not covered by the matrix** — this is what keeps the matrix honest as the schema grows.
- `anon` reads nothing anywhere.
- Approved global templates readable by any authenticated parent; another parent's draft (`owner_id` set) is not.
- Storage: B cannot read an object under A's prefix; a signed URL expires and is then unfetchable.
- Deleting a `profiles` row cascades to children, assignments, submissions, assets.
- Migrations apply from scratch and are idempotent.

### Done when
The matrix covers 100% of `public` tables and is green · the meta-test fails when a new uncovered table is added (prove it) · `db:reset && db:migrate` produces a working local database.

---

## Phase 3 — Authentication + Child Profiles

**Deliverable:** a parent can sign up, log in, and manage child profiles.

### Tasks
1. Supabase clients: browser, server-component, route-handler. **No admin client.**
2. `(auth)` routes: `/login`, `/signup`, `/forgot-password`, `/reset-password`.
3. Middleware: session refresh; `(parent)` and `(child)` redirect unauthenticated users to `/login`.
4. `(parent)` layout: sidebar (desktop) / bottom tabs (mobile), four destinations plus the persistent "Giao bài" action ([UX_FLOW.md](../../product/UX_FLOW.md) §3).
5. `(marketing)` `/`, `/privacy`, `/safety` — the safety page is a plain-language summary of [CHILD_SAFETY.md](../../product/CHILD_SAFETY.md).
6. `/settings` account screen; custom SMTP configured and **deliverability to Vietnamese mailboxes verified**.
7. Repository interface layer `lib/data/*Repository.ts` with Supabase implementations behind it (A1).
8. `/children` list, `/children/new` wizard ([UX_FLOW.md](../../product/UX_FLOW.md) §4.1): nickname → **birth month + year** → grade → preset avatar → interests (3–6). **No exact date of birth. No child photo upload.** Resumable; interests skippable.
9. `/children/[childId]` overview and `/children/[childId]/edit`; archive via `archived_at` rather than hard delete.
10. Server actions with zod input validation; ownership enforced by RLS **and** re-asserted in the action.
11. Age and band **derived at render time** from `birth_year` + `birth_month` — never stored, never cached.

### Tests
Unit: form validation; **age derivation across month and year boundaries**; wizard state machine; i18n key coverage; middleware redirects.
Integration: creating a child initialises exactly six progress rows; a child cannot be created with another parent's `parent_id`.
E2E: signup → confirm → login → dashboard → sign out; unauthenticated `/dashboard` and `/play` redirect to `/login`; password reset round-trip; create → edit → archive a child on a 360px viewport.

### Done when
The signup and child-wizard e2e pass against a real Supabase project · **no date-of-birth field and no persisted age exist anywhere in the codebase** (asserted by a grep test) · every visible string comes from the i18n catalogue.

---

## Phase 4 — Activity Engine

**Deliverable:** the canonical schema, the validators, the age policy, the deterministic
recommendation engine, and the seed library. Pure functions plus content — no UI.

*Depends on Phase 2 only for the `activity_templates` table; otherwise parallel with Phase 3.*

### 4a — Canonical schema and validators
1. Enums; `ActivityEnvelope` per [ACTIVITY_MODEL.md](../../product/ACTIVITY_MODEL.md) §3; `ResponseSpec` §4; the six payload schemas §5 with their refinements (handwriting character restriction, `answerKey ∈ choices`, `guided ⇒ options.length ≥ 2`, `trustedAdultPath` as `z.literal(true)`).
2. `lib/domain/policy/age-policies.ts` — the four bands from [CHILD_SAFETY.md](../../product/CHILD_SAFETY.md) §4 as frozen data, plus `resolveBand(birthYear, birthMonth, now)`, `clampDifficulty`, `isResponseModeAllowed`, `POLICY_VERSION`.
3. **L2** `validateReferential()`; **L3** `lib/domain/safety/` — denylist lexicon, URL/email/phone/handle detectors, PII-solicitation patterns, and the documented Vietnamese reading-level heuristic (avg words/sentence + avg syllables/word), **failing closed**.
4. `validateActivity()` composing L1 → L2 → L3 — one implementation, reused by the seed CI job, the DB read path, and Phase 8.
5. **`assertAssignable(activity, actingParentId)`** — the runtime guard of [PRODUCT_SPEC.md](../../product/PRODUCT_SPEC.md) §11.3 layer 2. Checks `status === 'approved'`, and for `source === 'ai'` that an approving parent id is present and matches.
6. **`toChildView(activity)`** — the projection of [ACTIVITY_MODEL.md](../../product/ACTIVITY_MODEL.md) §7.1, returning a distinct `ChildViewActivity` type stripped of answer keys, rationales, exemplar answers, `mustMention`, `isConstructive` and `parentNote`.

### 4b — Recommendation and adaptation
7. `ChildContext` — **derived** age, band, grade, interests, per-type difficulty, recent history.
8. `filterEligible()` (hard filter), `scoreTemplate()` (the four weighted sub-scores), `seededShuffle()`, `suggestActivities()` (filter → score → tie-break → diversify), `explainSuggestion()`.
9. `applyReview(progress, verdict)` and `applyCompletionSignal(progress, outcomes)`, both clamped to the band.

### 4c — Seed content
10. `content/seeds/vi/<type>/*.ts`, each default-exporting `satisfies Activity`.
11. Author **~20–25 original activities** across all six types and the age bands. Original work only.
12. Interest vocabulary seed (~20 slugs).
13. `scripts/validate-content.ts` — runs L1–L3 over every seed, prints the coverage matrix, non-zero exit on failure. Wire into CI.
14. `scripts/seed-db.ts` — loads validated seeds into `activity_templates` as `owner_id = null`, `status = 'approved'`, `source = 'seed'`. Service-role, script only.

### Tests (unit + content validation)
- Every valid fixture parses; every invalid fixture fails with the expected error.
- **An AI-sourced activity without `approvedByParentId` fails zod validation**, *and* `assertAssignable` rejects the same object when it is cast past the compiler (`as unknown as Activity`) — proving the runtime guard, not the type system, does the work.
- `toChildView` output contains no answer key, rationale, exemplar answer, `mustMention` or `isConstructive`, for all six types — property-tested over generated activities.
- `resolveBand` boundary cases; `clampDifficulty` never escapes the band.
- Every §5.1 denylist category caught; URLs/emails/phones caught in nested arrays; reading-level snapshots.
- **Determinism:** 1,000 runs of `suggestActivities` on a fixed `(child, date, catalog)` return an identical ordering; `shuffleSeed + 1` changes it reproducibly.
- **Property test:** every suggestion is age-eligible, grade-eligible and difficulty-in-band for arbitrary generated children and catalogs — a hard-filter failure can never be outscored.
- Cooldown and type-rotation behaviour; empty and exhausted catalogs return an explicit exhausted result.
- `applyReview`: `too_hard` drops immediately, `just_right` needs two consecutive, clamping at both band ends.
- Every seed passes L1–L3; a deliberately unsafe fixture is rejected by CI.

### Done when
≥ 90% branch coverage on `lib/domain` · no import of Supabase/Next/React under `lib/domain` (lint-enforced) · `pnpm validate:content` green · ~20–25 activities loaded into a local database by the seed script.

---

## Phase 5 — Assignment + Child Mode + Submission

**Deliverable:** a parent can assign; a child can complete all six activity types and submit.

### Tasks
1. `/library` with filters; `/library/[templateId]` using the **shared `ActivityPreview` component** — the same component used by the assign flow and, in Phase 8, the AI approval gate.
2. `/assign` four-step flow ([UX_FLOW.md](../../product/UX_FLOW.md) §4.2), with `explainSuggestion` on each card and "Đổi gợi ý khác" incrementing `shuffleSeed`.
3. `assignActivity` server action: re-validate through L1–L3, **call `assertAssignable`**, deep-copy the payload into `content_snapshot`, record `difficulty_at_assignment` and `snapshot_schema_version`, write an `audit_events` row.
4. `/dashboard` per [UX_FLOW.md](../../product/UX_FLOW.md) §5; catalog-exhausted state handled honestly.
5. Enforce template immutability once `approved` — changes publish a new `version`.
6. Child-mode PIN at `/settings/safety`, hashed, attempt-rate-limited, never logged, with the honest "this is not a device lock" copy.
7. `(child)` route group: full screen, **no navigation**, no links out, no catalog, no search, single-child lock.
8. `/play` PIN gate → child picker → today's cards; `/play/[assignmentId]` with the six renderers, **each fed `toChildView(snapshot)`** — never the raw snapshot.
9. Photo upload: capture/select → optional client-side resize (bandwidth only) → **server-side decode and re-encode that discards EXIF and all metadata** → write to `{parent_id}/{child_id}/{submission_id}/…`. MIME and size validated server-side; the client is not trusted.
10. `submitAssignment`: validate answers against the snapshot's `ResponseSpec`, write `submissions` + `submission_assets`, **auto-score server-side against the stored snapshot**, set status `submitted`.
11. `/play/[assignmentId]/done` — warm completion, **no score shown to the child** (Q8), no timer anywhere. Exit requires the PIN.
12. Offline resilience: answers held in local state and retried; never a raw error in front of a child.

### Tests
Unit: answer validation per response mode; auto-scoring; `auto_score` is `null` with no `choice` component.
Integration: the snapshot equals the template payload at assign time, and **stays byte-identical after the template is edited or archived**; a parent cannot assign to another parent's child; **the stored asset contains no EXIF** (assert on a fixture image with GPS tags); a submission is readable only by the owning parent.
E2E: **one per activity type** — PIN → open → complete → submit → done. Plus: no navigation element exists in child mode; leaving requires the PIN; a child cannot reach `/dashboard` or `/library` by URL while locked; **no child-facing network response contains an answer key** (asserted by intercepting responses in Playwright).

### Done when
All six type e2e tests pass · the EXIF-stripping and answer-key-leak assertions are green · axe reports no violations on child routes.

---

## Phase 6 — Parent Review + Progress

**Deliverable:** the loop closes — review changes what gets suggested next.

### Tasks
1. `/assignments/[assignmentId]` review view ([UX_FLOW.md](../../product/UX_FLOW.md) §4.4): assigned content from the snapshot · text answers verbatim · multiple-choice with correct/incorrect and the **parent-only** answer key and rationale · photos via short-lived signed URLs.
2. Score shown **to the parent only**, choice questions only.
3. Verdict: three one-tap buttons + optional note → writes `assignment_reviews`, sets `reviewed`, calls `applyReview`, persists `child_type_progress`.
4. `applyCompletionSignal` for unreviewed assignments.
5. **Delete a submission** — removes `submissions` + `submission_assets` rows, purges the Storage objects, writes an `audit_events` row, with a confirm step. Available from the review screen and the child's history.
6. `/children/[childId]/history` — filterable, with verdicts.
7. Difficulty per type as five dots on `/children/[childId]` — the one place adaptation is legible to the parent.
8. "Report content" → `content_reports`; archiving a template removes it from the catalog **without altering existing snapshots**.

### Tests
Integration: verdict → correct `child_type_progress` change, clamped at band edges; two consecutive incompletes lower difficulty; **deleting a submission removes the Storage object and leaves the assignment intact**; a signed URL expires and is not fetchable unauthenticated.
E2E: child submits → parent reviews `Hơi dễ` → the difficulty dot rises → subsequent suggestions shift upward. Parent deletes a submission and it disappears from history.

### Done when
The full loop e2e (assign → complete → review → adapted suggestion) is green, and submission deletion is verified down to the Storage object.

---

## Phase 7 — Worksheets

**Deliverable:** every activity prints well on A4.

*All handwriting typography decisions live here. **Nothing in Phases 1–6 may block on
them** — the schema already carries the `ruling` enum, and screen renderers do not use
the worksheet font.*

### Tasks
1. `print/[assignmentId]` and `print/preview/[templateId]` — snapshot-driven, no app chrome, **fed `toChildView` for the child's copy and the full snapshot for a parent answer sheet**.
2. Print stylesheet: A4 portrait, margins, page-break control, header with activity title and child nickname.
3. Per-type layouts: `worksheet`, `prompt_card`, `reading`.
4. **Decide and implement the Vietnamese handwriting font and ruling here** — `o_ly_grid`, `four_line`, `five_line`, `single_line`, tracing guides, optional stroke-order marks. Requires a licensed font with complete diacritic coverage; selection is a Phase 7 task, not a prerequisite.
5. Optional parent answer sheet for `story_comprehension`, clearly labelled, never printed with the child's copy by default.
6. Browser print dialog only — no PDF service.

### Tests
E2E: every type's print route renders without app chrome; Playwright print-media snapshots per ruling style in Chromium and WebKit; diacritics render correctly at worksheet sizes; the child's printed copy contains no answer key; page count matches `printable.pageEstimate` within one page.

### Done when
All six types have approved print baselines in both browsers.

---

## Phase 8 — AI Personalization (post-MVP, gated)

**Deliverable:** the eight-stage pipeline of
[AI_CONTENT_RULES.md](../../product/AI_CONTENT_RULES.md) §3.

> **Do not start** until every precondition in [AI_CONTENT_RULES.md](../../product/AI_CONTENT_RULES.md) §8 holds, including an explicit decision to lift non-goal #1 (Q10).

### Tasks
1. **Build the safety infrastructure first:** kill switch, audit log, rate limits and cost caps — before the first generation call, not after.
2. **Layer 3 of the defence in depth** ([PRODUCT_SPEC.md](../../product/PRODUCT_SPEC.md) §11.3): a CHECK constraint on `activity_templates` refusing `status = 'approved'` where `source = 'ai'` and `approved_by_parent_id is null`, plus a trigger on `assignments` insert asserting template eligibility. Migrated and tested **before** any generation.
3. Stage 1 constrained request object — **no free-text prompt field**.
4. Stage 2 age-policy resolution reusing `lib/domain/policy` unchanged.
5. Stage 3 versioned, in-repo, human-reviewed prompt templates.
6. Stage 4 structured-output generation; parent input only inside a delimited untrusted block; bounded retries and timeouts.
7. Stages 5–6 reusing `validateActivity()` unchanged; fail closed.
8. Stage 7 parent preview reusing the `ActivityPreview` component; approve / discard / regenerate; **no auto-approve in any form**; draft TTL.
9. Stage 8 assignment via the existing snapshot path.
10. Lift the `no-llm-dependency` CI check deliberately, in the same PR that adds the SDK.

### Tests
Golden-set regression (known-bad rejected, known-good accepted) · red-team prompt-injection suite over every parent-controlled field · **the database constraint rejects an approved AI row with a null approving parent, tested with direct SQL that bypasses the application entirely** · no child identifier appears in any prompt.

### Done when
The golden set and red-team suites are green, the DB constraint is proven by direct SQL, and the kill switch is verified to stop generation without a deploy.

---

## Phase 9 — Production Hardening

**Deliverable:** release-ready. Run against Phases 0–7 for the MVP launch; re-run against Phase 8 before any AI reaches a parent.

### Tasks
1. `/settings/data`: **export** (JSON + assets) and **account deletion** with cascade plus Storage prefix purge.
2. Strict CSP with no third-party script origins; security headers; verify no ad or analytics SDK is present (S5).
3. Full accessibility pass on parent and child routes; axe in CI.
4. Error boundaries and the empty/loading states of [UX_FLOW.md](../../product/UX_FLOW.md) §6; no raw error ever shown in child mode.
5. Performance measured from a Vietnamese network profile; image optimisation; round-trip reduction.
6. Rate limiting on auth, PIN attempts and uploads.
7. Structured logging with **no child data**; error reporting scrubbed of content and identifiers.
8. Complete the CI gate list of [CHILD_SAFETY.md](../../product/CHILD_SAFETY.md) §9.
9. Runbook, migration and rollback procedure, incident response for a content report.
10. Final audit against every non-goal in [PRODUCT_SPEC.md](../../product/PRODUCT_SPEC.md) §8 — confirm none has crept in.

### Done when
All CI gates green · export and delete verified end-to-end · axe clean · the non-goal audit signed off · the success criteria of [PRODUCT_SPEC.md](../../product/PRODUCT_SPEC.md) §9 demonstrably met.

---

## Preserved architectural decisions

Unchanged by the Phase 0 cleanup and binding on every phase:

- Children have **no accounts** — they are profiles under a parent-owned authenticated account.
- **Child mode is UX protection, not a security boundary**; all real enforcement is server-side.
- Assignments carry an **immutable `content_snapshot`**.
- Domain functions are **pure and independent of Supabase, Next.js and React** (lint-enforced).
- The MVP engine is **deterministic**; there is **no unrestricted child-facing AI chat**, ever.
- **Answer keys are Parent Mode only** — enforced by the server-side `toChildView()` projection.
- **A parent can delete their child's submissions**, including the stored assets.

## Risks carried into implementation

| Risk | Phase | Mitigation |
|---|---|---|
| Small catalog feels repetitive at ~20–25 activities | 4 | Cooldowns, type rotation, novelty scoring; honest exhausted state; library growth is the top post-launch priority |
| Content authoring is long-lead | 4 | Parallel with 3–7; fixtures, not real content, gate the engine and player tests |
| RLS misconfiguration leaks family data | 2 | Cross-tenant matrix over read/insert/update/delete per table, plus a meta-test failing on any uncovered table |
| Answer keys leaking to the child client | 4, 5 | `toChildView()` projection, property-tested, plus a Playwright network assertion |
| EXIF/GPS in stored photos | 5 | Server-side decode/re-encode, asserted on a GPS-tagged fixture |
| Vietnamese reading level has no standard metric | 4 | Documented heuristic with explicit thresholds; human review stays authoritative |
| Print fidelity for diacritics and ruled guides | 7 | Contained entirely in Phase 7; nothing earlier depends on it |
| Auth email deliverability in Vietnam | 3 | Custom SMTP verified in Phase 3; signup e2e is a release gate |
| Scope creep into AI | 1–7 | `no-llm-dependency` CI check, lifted deliberately at Phase 8 |
| Parent review fatigue starves adaptation | 6 | One-tap verdicts; completion-signal degradation |

## Open questions

Q3 (content rights) and Q4 (handwriting font/ruling) are **closed** — original content
only, and typography deferred into Phase 7. The remainder have documented defaults in
[PRODUCT_SPEC.md](../../product/PRODUCT_SPEC.md) §14 and block nothing:

| # | Question | Phase |
|---|---|---|
| Q1 | Confirm the Vietnamese grade taxonomy | 4 |
| Q2 | Age range 4–12, or start at 6? | 4 |
| Q5 | Data residency (Vietnam PDPD) vs Singapore region | 1 |
| Q8 | Does the child ever see a score? | 5 |
| Q9 | Photo submission retention policy | 9 |
| Q10 | Confirm Phase 8 is genuinely post-launch | 8 |
