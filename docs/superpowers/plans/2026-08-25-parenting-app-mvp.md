# Implementation Plan — Parent-Guided Learning App (MVP)

**Date:** 2026-08-25
**Status:** Ready for implementation — **not started**
**Repository:** `ntgiang1235-ux/nuoidaycon` (empty; no commits)
**Branch:** `claude/parent-learning-app-spec-andbvx`

**Specification:**
[PRODUCT_SPEC.md](../../product/PRODUCT_SPEC.md) ·
[ACTIVITY_MODEL.md](../../product/ACTIVITY_MODEL.md) ·
[CHILD_SAFETY.md](../../product/CHILD_SAFETY.md) ·
[AI_CONTENT_RULES.md](../../product/AI_CONTENT_RULES.md) ·
[UX_FLOW.md](../../product/UX_FLOW.md)

---

## Goal

Ship a deterministic, parent-owned learning app: a parent creates child profiles,
the system suggests age-appropriate activities from a curated Vietnamese library,
the child completes them in a PIN-gated child mode, and the parent reviews the
result — which adapts future difficulty. **No AI in this plan.**

## Working agreements

1. **TDD throughout.** Write the failing test, watch it fail for the right reason, make it pass, refactor. Domain logic in `lib/domain` is pure and must reach ≥ 90% branch coverage.
2. **Each phase is independently verifiable.** A phase ends with a green `pnpm verify` and a stated, checkable "done when". Later phases never retro-fix earlier phases' tests.
3. **RLS is the authorisation boundary.** No feature is done until a cross-tenant denial test covers its tables.
4. **The service-role key never appears in a request path** — migrations and seed scripts only.
5. **No LLM dependency enters `package.json`.** CI enforces this.
6. **Commit per task, not per phase.** Conventional commits. Push to the designated branch only.
7. **`pnpm verify` = `typecheck && lint && test:unit && test:integration && validate:content && e2e`.**

## Phase dependency graph

```
P0 ──┬─→ P1 ──┬─→ P2 (content authoring — parallel, on the critical path)
     │        └─→ P6 ──┐
     └─→ P3 ──┬─→ P4 ──┴─→ P5 ──→ P7 ──→ P8 ──→ P9 ──→ P10 ──→ P11
              └────────────────────────────────↗
```

P1 and P3 can proceed in parallel after P0. **P2 (authoring 60 activities) should start
as soon as P1 lands and run alongside P3–P8** — it is the longest-lead item and the
biggest risk to the schedule.

---

## Phase 0 — Foundation & toolchain

**Deliverable:** an empty but fully wired application that builds, tests, lints and deploys.

### Tasks
1. Initialise Next.js (App Router) + TypeScript `strict` + React; pnpm; Node version pinned.
2. Tailwind CSS + shadcn/ui init; design tokens for the two moods (parent / child) from [UX_FLOW.md](../../product/UX_FLOW.md) §7; Vietnamese-diacritic-complete font loaded and verified.
3. ESLint + Prettier; `import/no-restricted-paths` rule forbidding `lib/domain/**` from importing anything under `lib/data/**`, `lib/supabase/**`, `next/**` or `react` — decision A1 enforced by lint, not discipline.
4. Vitest (unit + integration projects, coverage thresholds) and Playwright (Chromium, mobile viewport project) configured with one smoke test each.
5. Directory skeleton per [PRODUCT_SPEC.md](../../product/PRODUCT_SPEC.md) §10, with `.gitkeep`s.
6. GitHub Actions: `ci.yml` running typecheck → lint → unit → build → e2e on PR and push.
7. **`no-llm-dependency` CI check** — a script asserting no LLM provider SDK is anywhere in the dependency tree (decision A9, non-goal #1).
8. Vercel project + Supabase project (Singapore region, pending Q5); `.env.example`; documented secrets. **No service-role key in any Vercel runtime environment.**
9. `README.md` (setup, scripts, architecture pointer) and `CONTRIBUTING.md` (TDD, commit convention, content-authoring rules).

### Done when
`pnpm verify` passes on a clean clone · CI is green on a PR · a placeholder page is live on a Vercel preview · the `no-llm-dependency` check fails when a fake LLM package is added (prove the guard works).

---

## Phase 1 — Domain: canonical Activity schema (pure, no DB, no UI)

**Deliverable:** the single source of truth for what an activity is, and the L1–L3 validators.

### Tasks
1. Enums: `ActivityType`, `GradeLevel`, `AgeBand`, `ResponseMode`, `ContentStatus`, `ContentSource`, `ReviewVerdict`, `InterestSlug`.
2. `ActivityEnvelope` zod schema exactly as [ACTIVITY_MODEL.md](../../product/ACTIVITY_MODEL.md) §3 — including `safety.reviewedBy` required and the `provenance` discriminated union where `source: 'ai'` **requires** `approvedByParentId`. Add a test asserting an AI-sourced activity without an approving parent **fails to parse**; this is the preview gate expressed as a type.
3. `ResponseSpec` discriminated union (§4).
4. Six payload schemas (§5), with their refinements: handwriting character restriction, `answerKey ∈ choices`, `guided ⇒ options.length ≥ 2`, `trustedAdultPath` as `z.literal(true)`.
5. `ActivitySchema` — the discriminated union over `type`; `z.infer` types exported.
6. `lib/domain/policy/age-policies.ts` — the four bands from [CHILD_SAFETY.md](../../product/CHILD_SAFETY.md) §4 as frozen data, plus `resolveBand(birthYear, birthMonth, now)`, `clampDifficulty`, `isResponseModeAllowed`, and `POLICY_VERSION`.
7. **L2** `validateReferential(activity)` — cross-field checks not expressible in a single refinement, including difficulty-within-band and response-mode-within-band.
8. **L3** `lib/domain/safety/`:
   - denylist lexicon (Vietnamese + English), sourced from [CHILD_SAFETY.md](../../product/CHILD_SAFETY.md) §5.1, in its own reviewable data file
   - URL / email / phone / social-handle detectors
   - PII-solicitation patterns
   - Vietnamese reading-level heuristic (avg words/sentence + avg syllables/word) with **documented thresholds per band** and a note that it is a heuristic, not a validated metric (risk register)
   - `runSafetyChecks(activity, band) → { ok, failures[] }`, **failing closed**
9. `validateActivity(input) → Result<Activity, ValidationFailure[]>` composing L1 → L2 → L3. One implementation, later reused by the seed CI job, the DB write path and (if ever) the AI pipeline.
10. Fixture library: one valid + several invalid fixtures per type.

### Tests (all unit, no I/O)
Valid fixtures parse · each invalid fixture fails with the expected error · `resolveBand` boundary cases (birthday month, band edges) · `clampDifficulty` never escapes the band · every §5.1 denylist category is caught · URLs/emails/phones caught in every string field including nested arrays · reading-level heuristic snapshot tests · **property test: for any generated activity, if `validateActivity` returns ok then difficulty ∈ band range and response mode ∈ band allowlist.**

### Done when
Coverage ≥ 90% branches on `lib/domain` · the AI-without-approval parse-failure test is green · no import of Supabase/Next/React exists anywhere under `lib/domain` (lint-enforced).

---

## Phase 2 — Curated content library (parallelisable, longest lead)

**Deliverable:** ≥ 60 Vietnamese activities that pass L1–L3, spread across the coverage matrix.

> **Start this as soon as Phase 1 lands and run it alongside Phases 3–8.** Authoring, not
> coding, is the critical path (risk register). Blocked on open question **Q3** (who authors,
> and what rights we hold to any story text).

### Tasks
1. `content/seeds/vi/<type>/*.ts`, each default-exporting `satisfies Activity` so authoring errors surface in the editor.
2. Author ≥ 10 per type: `handwriting`, `drawing_prompt`, `story_comprehension`, `story_summary`, `reflection`, `situation_judgment`.
3. Interest vocabulary (`interests` seed): ~20 slugs with `label_vi` / `label_en`.
4. `scripts/validate-content.ts` — runs L1–L3 over every seed, prints a coverage matrix, non-zero exit on any failure.
5. **Coverage matrix assertion**: every `(type × ageBand × difficulty)` cell permitted by the age policy has ≥ 1 activity.
6. Wire `validate:content` into CI ([CHILD_SAFETY.md](../../product/CHILD_SAFETY.md) §9 checks 1–4).
7. Content authoring guide in `CONTRIBUTING.md`: tone, the `situation_judgment` scenario rules (§5.6), attribution requirements, the PR review checklist.

### Done when
`pnpm validate:content` is green · the coverage matrix has no empty permitted cell · every non-original story carries `attribution` · every seed carries `safety.reviewedBy` and a matching `policyVersion` · a deliberately unsafe fixture is rejected by CI (prove the guard works).

---

## Phase 3 — Database schema, RLS and migrations

**Deliverable:** the full Postgres schema with proven tenant isolation. No UI.

### Tasks
1. Migration `0001_init`: enums and all tables from [PRODUCT_SPEC.md](../../product/PRODUCT_SPEC.md) §11 — `profiles`, `households`, `household_members`, `children`, `interests`, `child_interests`, `activity_templates`, `child_type_progress`, `assignments`, `submissions`, `submission_assets`, `assignment_reviews`, `content_reports`, `audit_events`.
2. Constraints: `difficulty between 1 and 5` · `birth_month between 1 and 12` · unique `submissions.assignment_id` · unique `assignment_reviews.assignment_id` · `assignments.content_snapshot not null` · cascade deletes from `profiles` down.
3. Indexes: `children(parent_id)` · `assignments(child_id, status)` · `assignments(child_id, template_id, assigned_at)` (cooldown lookup) · `activity_templates(type, status, locale)` · GIN on `activity_templates.interest_tags`.
4. Migration `0002_rls`: `enable` **and** `force row level security` on every table; the ownership policies from §11; the `activity_templates` read policy; `interests` as authenticated-read-only; **nothing granted to `anon`**.
5. Trigger: create a `profiles` row (and a single-member `households` row) on `auth.users` insert.
6. Migration `0003_storage`: private `submissions` bucket + policy asserting `(storage.foldername(name))[1] = auth.uid()::text`; MIME and size limits.
7. `scripts/seed-db.ts` — loads validated seeds into `activity_templates` (`owner_id = null`, `status = 'approved'`, `source = 'seed'`). Service-role key, script only.
8. Local Supabase via CLI; `db:reset`, `db:migrate`, `db:seed` scripts.
9. Generate TypeScript DB types; add a CI check that they are up to date with the migrations.

### Tests (integration, against local Supabase)
- Migrations apply from scratch and are idempotent.
- **Cross-tenant matrix:** for *every* table, parent B gets zero rows on select and is denied insert/update/delete on parent A's data. This test is a template that must be extended whenever a table is added.
- `anon` reads nothing anywhere.
- Approved global templates are readable by any authenticated parent; another parent's draft (`owner_id` set) is not.
- Deleting a `profiles` row cascades to children, assignments, submissions, assets.
- Storage: parent B cannot read an object under parent A's prefix.

### Done when
The cross-tenant matrix covers 100% of tables and is green · `db:reset && db:migrate && db:seed` produces a working local database.

---

## Phase 4 — Auth and the parent shell

**Deliverable:** a parent can sign up, log in, and see an empty authenticated app in Vietnamese.

### Tasks
1. Supabase clients: browser, server-component, route-handler. **No admin client.** Lint rule banning `SUPABASE_SERVICE_ROLE_KEY` outside `scripts/`.
2. `(auth)` routes: `/login`, `/signup`, `/forgot-password`, `/reset-password` (shadcn/ui forms, zod validation, Vietnamese error messages).
3. Middleware: session refresh; `(parent)` and `(child)` redirect unauthenticated users to `/login`.
4. `(parent)` layout: sidebar (desktop) / bottom tabs (mobile) with the four destinations from [UX_FLOW.md](../../product/UX_FLOW.md) §3, plus the persistent "Giao bài" action.
5. i18n scaffolding: `lib/i18n` message catalogue, `vi` complete, `en` keys present and untranslated, typed `t()` with a CI check for missing/orphaned keys.
6. `(marketing)` `/`, `/privacy`, `/safety` — the safety page is a plain-language summary of [CHILD_SAFETY.md](../../product/CHILD_SAFETY.md).
7. `/settings` account screen (display name, locale, sign out).
8. Repository interface layer `lib/data/*Repository.ts` with Supabase implementations behind them (decision A1).
9. Custom SMTP for auth email — **verify deliverability to Vietnamese mailboxes** (risk register).

### Tests
Unit: form validation, i18n key coverage, middleware redirect logic.
E2E: signup → confirm → login → land on `/dashboard` → sign out; unauthenticated access to `/dashboard` and `/play` redirects to `/login`; password reset round-trip.

### Done when
The signup → login → dashboard e2e passes against a real Supabase project · every visible string comes from the i18n catalogue (no hardcoded literals — lint-enforced).

---

## Phase 5 — Child profiles and interests

**Deliverable:** full child-profile CRUD with the onboarding wizard.

### Tasks
1. `/children` list; empty state per [UX_FLOW.md](../../product/UX_FLOW.md) §6.
2. `/children/new` wizard, one question per screen ([UX_FLOW.md](../../product/UX_FLOW.md) §4.1): nickname → birth month/year → grade → preset avatar → interests (3–6 chips). **No exact birthdate. No photo upload.** Resumable; interests skippable.
3. `/children/[childId]` overview and `/children/[childId]/edit`.
4. Archive (soft delete via `archived_at`) rather than hard delete, so history survives.
5. Server actions with zod input validation; ownership enforced by RLS *and* asserted in the action.
6. `child_type_progress` rows initialised for all six types at creation, seeded from the band's midpoint difficulty.
7. Age/band display derived at render time from birth month/year.

### Tests
Unit: wizard state machine, age derivation across month boundaries, interest min/max.
Integration: creating a child initialises exactly six progress rows; a child cannot be created with another parent's `parent_id`.
E2E: create → edit → archive; archived children are excluded from assignment flows but their history remains readable.

### Done when
The full wizard e2e passes on a 360px viewport · no exact-birthdate field exists anywhere in the codebase.

---

## Phase 6 — Recommendation and difficulty engine (pure)

**Deliverable:** the deterministic engine. Pure functions over repository interfaces; no DB, no UI.

### Tasks
1. `ChildContext` type: age, band, grade, interests, per-type difficulty, recent history.
2. `filterEligible(templates, ctx, now)` — the hard filter from [PRODUCT_SPEC.md](../../product/PRODUCT_SPEC.md) §7 step 1: locale, `status = 'approved'`, age overlap, grade overlap, difficulty within band, cooldown not active.
3. `scoreTemplate(template, ctx)` — `0.35 × interestOverlap + 0.30 × difficultyFit + 0.20 × typeRotation + 0.15 × novelty`, each sub-score its own tested function.
4. `seededShuffle(items, seed)` — deterministic PRNG over `hash(childId, dateBucket, templateId, shuffleSeed)`.
5. `suggestActivities(ctx, catalog, { count = 3, shuffleSeed = 0 })` — filter → score → tie-break → diversify to at most one per type.
6. `applyReview(progress, verdict)` — the adaptation table from §7, clamped to the band.
7. `applyCompletionSignal(progress, outcomes)` — the graceful degradation path: two consecutive incompletes lower difficulty by one.
8. `explainSuggestion(template, ctx)` — the "why this was picked" string shown on the assign card.

### Tests (unit only, fixtures only)
- **Determinism:** 1,000 runs of `suggestActivities` on a fixed `(child, date, catalog)` return an identical ordering ([PRODUCT_SPEC.md](../../product/PRODUCT_SPEC.md) §9).
- `shuffleSeed + 1` changes the result and is itself reproducible.
- **Property test:** every suggestion is age-eligible, grade-eligible and difficulty-in-band, for arbitrary generated children and catalogs. A hard-filter failure can never be outscored.
- Cooldown excludes recently assigned templates; type rotation prevents three of the same type.
- Golden snapshots for a handful of representative children.
- `applyReview`: `too_hard` drops immediately; `just_right` needs two consecutive; clamping at both band ends.
- Empty-catalog and fully-exhausted-catalog cases return an explicit exhausted result, not an empty array.

### Done when
Coverage ≥ 90% branches · the determinism and property tests are green · the engine module has zero imports outside `lib/domain`.

---

## Phase 7 — Assignment lifecycle and the assign flow

**Deliverable:** a parent can browse, preview and assign; snapshots are immutable.

### Tasks
1. `AssignmentRepository`, `TemplateRepository`, `ProgressRepository` implementations.
2. `assignActivity` server action: re-validate the template through L1–L3, **deep-copy the payload into `content_snapshot`**, record `difficulty_at_assignment` and `snapshot_schema_version`, write an `audit_events` row.
3. `/library` with filters (type, age, difficulty, interest, minutes) and cards.
4. `/library/[templateId]` — the **shared `ActivityPreview` component**, rendering exactly what the child will see. Same component used by the assign flow and, later, the AI approval gate: one implementation, three call sites.
5. `/assign` four-step flow ([UX_FLOW.md](../../product/UX_FLOW.md) §4.2): pick child → suggestions (with `explainSuggestion` and "Đổi gợi ý khác" incrementing `shuffleSeed`) → preview → confirm with optional due date.
6. `/dashboard`: today · awaiting review · suggestions · recent — per [UX_FLOW.md](../../product/UX_FLOW.md) §5.
7. `/assignments/[assignmentId]` parent view (submission section arrives in Phase 9).
8. Catalog-exhausted state handled honestly per [UX_FLOW.md](../../product/UX_FLOW.md) §6.
9. Enforce template immutability once `approved` — updates publish a new `version` ([ACTIVITY_MODEL.md](../../product/ACTIVITY_MODEL.md) §7).

### Tests
Integration: assigning writes a snapshot equal to the template payload; **archiving or editing the template afterwards leaves the snapshot byte-identical**; a parent cannot assign to another parent's child.
E2E: dashboard → assign → suggestions → preview → confirm → the assignment appears on the dashboard; "Đổi gợi ý khác" changes the suggestions.

### Done when
The snapshot-immutability test is green · assigning from a cold dashboard takes ≤ 4 taps.

---

## Phase 8 — Child mode, activity players and submissions

**Deliverable:** a child can complete all six activity types and submit work.

### Tasks
1. Child-mode PIN: set/change at `/settings/safety` with the honest explanatory copy from [UX_FLOW.md](../../product/UX_FLOW.md) §5; hashed at rest; attempt rate-limiting; never logged.
2. `(child)` route group + layout: full screen, **no navigation**, no links out, no catalog, no search, single-child lock ([CHILD_SAFETY.md](../../product/CHILD_SAFETY.md) §6). Structurally separate from `(parent)`.
3. `/play` PIN gate → child picker → today's cards.
4. Six renderers, each reading from `content_snapshot`, never the live template:
   - `HandwritingPlayer` — instructions, print link, photo capture
   - `DrawingPromptPlayer` — prompt, checklist, photo capture
   - `StoryComprehensionPlayer` — story with a text-size control, one question per screen
   - `StorySummaryPlayer` — story + writing area with hints and sentence starters
   - `ReflectionPlayer` — one question per screen, optional sentence starters
   - `SituationJudgmentPlayer` — scenario → guided options or open text → gentle feedback; the `trustedAdultPath` is always visible
5. Photo upload: capture/select → client-side resize → **EXIF strip** → signed upload to `{parent_id}/{child_id}/{submission_id}/…`; MIME and size validation server-side too.
6. `submitAssignment` action: validate answers against the snapshot's `ResponseSpec`, write `submissions` + `submission_assets`, auto-score `choice` answers only, set status `submitted`.
7. `/play/[assignmentId]/done` — warm completion, **no score shown to the child** (Q8), no timer anywhere.
8. Exit to the parent app requires the PIN.
9. Offline resilience: answers held in local state and retried; never a raw error in front of a child.
10. Accessibility pass: ≥ 18px body with a size control, ≥ 48px targets, high contrast, dyslexia-friendly font option, keyboard operable, reduced-motion respected.

### Tests
Unit: answer validation per response mode; auto-scoring correctness; auto-score is `null` when there is no `choice` component; EXIF stripping.
Integration: a submission is readable only by the owning parent; an asset under another parent's prefix is unreadable.
E2E: **one per activity type** — PIN → open → complete → submit → done. Plus: no navigation element is present anywhere in child mode; leaving requires the PIN; a child cannot reach `/dashboard` or `/library` by URL while locked.

### Done when
All six type e2e tests pass · the "no nav chrome in child mode" assertion passes · axe reports no violations on child routes · no free-text destination other than the child's own submission exists (S2).

---

## Phase 9 — Parent review and the adaptation loop

**Deliverable:** the loop closes — review changes what gets suggested next.

### Tasks
1. `/assignments/[assignmentId]` review view ([UX_FLOW.md](../../product/UX_FLOW.md) §4.4): assigned content from the snapshot · text answers verbatim · multiple-choice with correct/incorrect and the parent-only `rationale` · photos via short-TTL signed URLs with zoom.
2. Score shown **to the parent only**, choice questions only.
3. Verdict: three one-tap buttons (`Hơi dễ` / `Vừa sức` / `Hơi khó`) + optional note → writes `assignment_reviews`, sets status `reviewed`, calls `applyReview` and persists the new `child_type_progress`.
4. Completion-signal degradation for unreviewed assignments (`applyCompletionSignal`), run on assignment creation.
5. `/children/[childId]/history` — filterable history with verdicts.
6. Difficulty per type surfaced as five dots on `/children/[childId]` — the one place adaptation is made legible to the parent.
7. "Report content" → `content_reports`; archiving a template removes it from the catalog **without altering existing snapshots**.
8. Dashboard "Chờ bố mẹ xem" queue as the primary call to action.

### Tests
Integration: verdict → correct `child_type_progress` change, clamped at band edges; two consecutive incompletes lower difficulty; a signed URL expires and is not publicly fetchable.
E2E: child submits → parent reviews `Hơi dễ` → the child's difficulty dot for that type increases → subsequent suggestions shift upward.

### Done when
The full loop e2e (assign → complete → review → adapted suggestion) is green.

---

## Phase 10 — Printable worksheets

**Deliverable:** every activity prints well on A4.

### Tasks
1. `print/[assignmentId]` and `print/preview/[templateId]` — snapshot-driven, no app chrome.
2. Print stylesheet: A4 portrait, correct margins, page-break control, header with activity title and child nickname.
3. Per-type print layouts: `worksheet` (handwriting), `prompt_card` (drawing, reflection, situation), `reading` (comprehension, summary).
4. Handwriting ruling renderers: `o_ly_grid`, `four_line`, `five_line`, `single_line`, with tracing guides and optional stroke-order marks — **blocked on open question Q4** (ruling choice + licensed diacritic-complete font).
5. Print entry points from the library preview, the assignment view and the child card.
6. Browser print dialog only — no PDF service, no server-side rendering pipeline.

### Tests
E2E: every type's print route renders without app chrome; Playwright print-media screenshots compared against baselines for each ruling style; diacritics render correctly at worksheet sizes; page-count estimate matches `printable.pageEstimate` within one page.

### Done when
All six types have an approved print baseline · handwriting guides align correctly in Chromium and WebKit.

---

## Phase 11 — Hardening, privacy and release readiness

**Deliverable:** production-ready.

### Tasks
1. `/settings/data`: **export** (JSON + assets) and **account deletion** with cascade plus Storage prefix purge, per [CHILD_SAFETY.md](../../product/CHILD_SAFETY.md) §3.
2. Strict Content-Security-Policy with no third-party script origins; security headers; **verify no ad/analytics SDK is present** (S5).
3. Full accessibility pass on parent and child routes; axe in CI.
4. Error boundaries, empty and loading states from [UX_FLOW.md](../../product/UX_FLOW.md) §6; no raw error is ever shown in child mode.
5. Performance: measure from a Vietnamese network profile; image optimisation; server components minimising round-trips.
6. Rate limiting on auth, PIN attempts and uploads.
7. Structured logging with **no child data**; error reporting scrubbed of content and identifiers.
8. Complete the CI gate list from [CHILD_SAFETY.md](../../product/CHILD_SAFETY.md) §9 (all seven checks).
9. Operational docs: runbook, migration and rollback procedure, incident response for a content report.
10. Final review against every non-goal in [PRODUCT_SPEC.md](../../product/PRODUCT_SPEC.md) §8 — confirm none has crept in.

### Done when
All seven CI gates are green · export and delete verified end-to-end · axe clean · the non-goal audit is signed off · the success criteria in [PRODUCT_SPEC.md](../../product/PRODUCT_SPEC.md) §9 are all demonstrably met.

---

## Explicitly out of scope for this plan

Everything in [PRODUCT_SPEC.md](../../product/PRODUCT_SPEC.md) §8 "non-goals", and in
particular: **all AI generation** ([AI_CONTENT_RULES.md](../../product/AI_CONTENT_RULES.md)
is design-only), child accounts, co-parent or teacher sharing, notifications, payments,
gamification, social features, native apps, an in-browser drawing canvas, audio, auto-grading
of free text, English content, and an admin CMS.

## Risks carried into implementation

| Risk | Phase | Mitigation in this plan |
|---|---|---|
| Content authoring is the true critical path | P2 | Parallelised from the end of P1; coverage matrix enforced in CI; **blocked on Q3** |
| RLS misconfiguration leaks family data | P3 | Cross-tenant matrix over every table; forced RLS; service-role key lint-banned from request paths |
| Small catalog feels repetitive | P2, P6 | Cooldowns, type rotation, novelty scoring; coverage matrix |
| Vietnamese reading level has no standard metric | P1 | Documented heuristic with explicit thresholds; human review stays authoritative |
| Print fidelity for diacritics and ruled guides | P10 | Dedicated phase; cross-browser print snapshots; **blocked on Q4** |
| Auth email deliverability in Vietnam | P4 | Custom SMTP verified in P4; signup e2e is a release gate |
| Scope creep into AI | all | Non-goal #1 plus the `no-llm-dependency` CI check from P0 |
| Parent review fatigue starves adaptation | P9 | One-tap verdicts; completion-signal degradation when no verdict is given |

## Open questions that block specific phases

| # | Question | Blocks |
|---|---|---|
| Q1 | Confirm the grade taxonomy (Vietnamese `lớp 1–6` as assumed) | P1 enums, P2 banding |
| Q2 | Is the range really 4–12, or start at 6? | P2 authoring volume |
| **Q3** | **Who authors the seed content, and what rights do we hold to any story text?** | **P2 — the critical path** |
| **Q4** | **Handwriting ruling style and licensed diacritic-complete font** | **P10** |
| Q5 | Data-residency requirement (Vietnam PDPD) vs a Singapore region | P0 region choice |
| Q8 | Does the child ever see a score, or only the parent? | P8 completion screen |
| Q9 | Retention policy for photo submissions | P11 export/delete |

Q3 and Q4 should be answered before their phases begin. The rest have documented defaults
in [PRODUCT_SPEC.md](../../product/PRODUCT_SPEC.md) §14 and will not block progress.
