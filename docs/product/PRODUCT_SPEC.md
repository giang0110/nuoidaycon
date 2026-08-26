# Product Specification — Nuôi Dạy Con (Parent-Guided Learning)

**Status:** Draft v2 — Phase 0 specification (locked corrections applied)
**Date:** 2026-08-25 (revised 2026-08-26)
**Owner:** Product / Engineering
**Related docs:** [ACTIVITY_MODEL.md](./ACTIVITY_MODEL.md) · [CHILD_SAFETY.md](./CHILD_SAFETY.md) · [AI_CONTENT_RULES.md](./AI_CONTENT_RULES.md) · [UX_FLOW.md](./UX_FLOW.md)

---

## 1. Summary

A web application where **a parent** creates profiles for their children and assigns
short, age-appropriate educational activities. The parent stays in the loop for the
whole lifecycle: they choose or approve what gets assigned, the child completes it,
and the parent reviews the result. The system adapts future suggestions from age,
grade, interests, history and observed difficulty.

The MVP — **Phases 0–7 of the roadmap** — contains **no AI generation**. It ships a
*deterministic activity engine* over a *curated, human-authored content library*. The AI
pipeline described in [AI_CONTENT_RULES.md](./AI_CONTENT_RULES.md) is **Phase 8**: it is
designed now so the MVP's data model and safety gates are already shaped to receive it,
but it is not built, and it is gated behind explicit preconditions.

## 2. Problem

Parents of primary-school children want short, meaningful, screen-light learning
activities they can hand their child in 10–20 minutes. Existing options are either
(a) unstructured worksheet PDFs with no adaptation and no record of what was done,
or (b) open-ended AI chatbots and content feeds that parents cannot supervise and
do not trust with a child.

## 3. Product principles

These are binding constraints, not aspirations. A feature that violates one of
these does not ship.

| # | Principle | Consequence |
|---|-----------|-------------|
| P1 | **The parent owns the account.** Children are profiles under it. | One `auth.users` row per family. Children are rows, never accounts. Every RLS policy resolves to the owning parent. |
| P2 | **No unrestricted AI chat for children.** | There is no free-text channel from a child to a model. Ever. Not behind a flag, not "supervised". |
| P3 | **Nothing reaches a child unreviewed.** | Seeded content is human-authored and human-approved. Future AI content passes an explicit parent preview gate before assignment. |
| P4 | **Deterministic before generative.** | The selection/adaptation engine is pure, testable, reproducible. AI is an optional content *source*, never the control flow. |
| P5 | **Collect the least child data that works.** | Nickname, `birth_year` + `birth_month`, grade, interest tags. **No exact date of birth, and age is never persisted** — it is derived at request time. No child email, no child contact data, no required face photos. |
| P6 | **Low pressure by default.** | No timers, no leaderboards, no streak guilt, no punitive scoring. Parent feedback is qualitative. |
| P7 | **Offline-friendly output.** | Every activity that can be printed, can be printed. Screen time is optional, not required. |

## 4. Users

- **Parent (primary user, account holder).** Vietnamese-speaking, mobile-first, time-poor.
  Wants: assign something good in under 60 seconds; see what the child did; know it's safe.
- **Child (subject, not an account holder).** Ages 4–12. Uses the parent's device in a
  locked "child mode". Cannot sign up, sign in, browse the catalog, or reach the internet
  from inside the app.
- **(Out of scope for MVP)** Co-parent, teacher, tutor, school admin.

## 5. Decisions locked in brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| **Child access** | Parent-device **child mode**, PIN-gated. No child credentials. | Keeps a single auth principal; RLS stays a simple ownership check; zero child PII in auth; fastest path to a working product. |
| **Work capture** | Digital answers (text / multiple-choice) **plus photo upload** to Supabase Storage for handwriting & drawing. | One submission model covers all six activity types without building a canvas. |
| **Language** | **Vietnamese-first, i18n-ready.** UI strings and all seed content in `vi`. Locale column on content; message catalogue from day one. | Matches the audience; avoids a rewrite when `en` is added. |
| **Sharing** | **Single owner parent.** No invites, no co-parents. | A child belongs to exactly one parent via `children.parent_id`. **No `households` / `household_members` tables exist** — an unused indirection would add a join to every RLS policy in the product to serve a non-goal. If co-parent sharing is ever built, it is a schema change at that time, on a small and well-understood set of tables. |

> ⚠️ **Child mode is a UX lock, not a security boundary.** The parent's session is live
> behind it. A determined child on an unlocked device can leave it. This is stated
> explicitly to the parent during setup. Any control that *must* be enforced (what
> content exists, what data is reachable) is enforced server-side by RLS and the age
> policy, never by the PIN.

## 6. Activity types (MVP)

Six types, all seeded, all covered by the canonical schema in
[ACTIVITY_MODEL.md](./ACTIVITY_MODEL.md).

| Key | Vietnamese label | Child output | Printable |
|---|---|---|---|
| `handwriting` | Luyện viết | Photo of worksheet | ✅ primary |
| `drawing_prompt` | Vẽ & sáng tạo | Photo of drawing | ✅ primary |
| `story_comprehension` | Đọc hiểu | Choice + short text | ✅ |
| `story_summary` | Tóm tắt truyện | Long-ish text (or photo) | ✅ |
| `reflection` | Câu hỏi suy ngẫm | Short text (or photo) | ✅ |
| `situation_judgment` | Nếu là con, con sẽ làm gì? | Choice + short text | ✅ |

## 7. Adaptation model (deterministic)

Adaptation is a **pure function**, not a model. Given a child and the catalog it
returns a ranked, reproducible list.

**Inputs**
- `age` — **derived at request time** from `birth_year` + `birth_month`; never stored in any column, cache, or session
- `grade` (`preschool`, `grade_1` … `grade_6`)
- `interests` (tag slugs chosen by the parent, 3–6)
- `history` (assignments in the last N days: types, template ids, outcomes)
- `difficulty` (per-child **per-activity-type** level, 1–5)

**Pipeline**
1. **Hard filter (eligibility).** Locale match · `status = 'approved'` · age band overlap ·
   grade band overlap · difficulty within the age band's permitted range ·
   template not assigned to this child within its cooldown window.
   *A template that fails a hard filter can never be surfaced, regardless of score.*
2. **Score.** Weighted sum:
   `0.35 × interestOverlap + 0.30 × difficultyFit + 0.20 × typeRotation + 0.15 × novelty`
   - `interestOverlap` — Jaccard of template `interest_tags` × child interests
   - `difficultyFit` — `1 − |template.difficulty − child.difficulty[type]| / 4`
   - `typeRotation` — penalises types assigned recently, to keep a varied week
   - `novelty` — decays with recency of last assignment of that template
3. **Deterministic tie-break.** Seeded PRNG over `hash(childId, dateBucket, templateId)`.
   Same child + same day + same catalog ⇒ same suggestions. A parent "shuffle"
   increments an explicit `shuffleSeed`, so it is still reproducible in tests.
4. **Diversify.** Return at most one template per type in the top-3 proposal.

**Difficulty adaptation** — after a parent review of a submission:

| Parent verdict | Effect on `difficulty[type]` |
|---|---|
| `too_easy` | `+1` |
| `just_right` | `+1` only after **two consecutive** `just_right` |
| `too_hard` | `−1` immediately |
| Skipped / not completed ×2 | `−1` |

Clamped to `[bandMin, bandMax]` from the age policy — adaptation can never push a
child outside the content permitted for their age band.

## 8. MVP scope

**In scope**

- Parent email/password auth (Supabase Auth), session management, password reset
- Child profile CRUD: nickname, `birth_year` + `birth_month`, grade, avatar (preset illustration), interests
- Curated content library: **approximately 20–25 original Vietnamese activities**, covering all six types across the age bands and difficulty 1–5. All content is **original work authored for this product** — never copied from commercial books, textbooks, or in-copyright stories. The library grows after launch; it is not a precondition for implementation.
- Deterministic recommendation engine + per-type difficulty adaptation
- Assignment lifecycle: `assigned → in_progress → submitted → reviewed` (plus `skipped`)
- **Content snapshotting**: an assignment stores an immutable copy of the activity payload, so editing a template never mutates a child's assigned work
- Parent preview before assigning
- Child mode: PIN unlock, single-child lock, full-screen chrome-free player, six activity renderers
- Submission capture: text, multiple-choice, and photo upload — **server-side decode and re-encode strips EXIF before the asset is stored**; private Storage bucket, short-lived signed URLs
- **Answer keys are Parent Mode only** — a server-side `toChildView()` projection removes answer keys, rationales and exemplar answers before any activity reaches the child client
- Parent can **delete a child's submission** (and its assets) at any time
- Parent review screen: view answers/photo, verdict (`too_easy` / `just_right` / `too_hard`), optional note
- Printable worksheet route with print CSS for all six types
- Parent dashboard: today's assignments, awaiting review, recent history per child
- Settings: account, child-mode PIN, data export, account deletion
- i18n scaffolding (`vi` complete; `en` keys present but untranslated)
- RLS on every table; cross-tenant denial proven by integration tests
- CI (GitHub Actions): typecheck, lint, unit (Vitest), e2e (Playwright), seed validation, safety lint
- Deploy to Vercel; Supabase for Postgres / Auth / Storage

**Explicit non-goals for the MVP (Phases 0–7)**

These are deliberately excluded from the MVP. Adding any of them is a scope change
requiring a new plan, not a "quick addition".

1. ❌ **Any AI/LLM generation.** No generation endpoint, no model SDK, no API key in Phases 0–7. AI personalisation is **Phase 8**, gated behind the preconditions in [AI_CONTENT_RULES.md](./AI_CONTENT_RULES.md) §8.
2. ❌ **Any chat interface**, for child or parent.
3. ❌ **Child accounts / child login / child credentials.**
4. ❌ **Co-parent, caregiver, teacher, tutor, or classroom access.** No invites, no sharing links.
5. ❌ **Notifications** — no email digests, no push, no SMS, no reminders.
6. ❌ **Payments, subscriptions, plans, entitlements.**
7. ❌ **Gamification economy** — no points, badges, coins, levels, leaderboards, streaks.
8. ❌ **Social features** — no comments, likes, sharing, feeds, public profiles, child-to-child anything.
9. ❌ **Native mobile apps**; no PWA install flow, no offline sync.
10. ❌ **In-browser drawing/handwriting canvas** (stylus, stroke capture) — photo upload instead.
11. ❌ **Audio / speech** — no TTS read-aloud, no speech-to-text, no pronunciation scoring.
12. ❌ **Automatic grading of free-text answers.** Multiple-choice is auto-scored; text is parent-reviewed only.
13. ❌ **English (or any non-Vietnamese) seed content.** The i18n layer exists; the content does not.
13a. ❌ **Licensed, textbook, or third-party story text.** MVP content is original work only.
14. ❌ **Admin CMS.** Content ships as version-controlled seed files reviewed via pull request.
15. ❌ **Analytics dashboards, cohort reports, progress charts** beyond a simple recent-history list.
16. ❌ **Realtime / multiplayer / live sessions.**
17. ❌ **Third-party analytics or advertising SDKs** (also barred permanently by [CHILD_SAFETY.md](./CHILD_SAFETY.md)).
18. ❌ **Curriculum alignment claims** to any official standard.

## 9. Success criteria for the MVP

Functional, testable, and checkable at the end of Phase 9 (MVP release gate):

- A new parent can sign up, create a child, and have a first activity assigned in **≤ 3 minutes**.
- The engine returns a stable top-3 for a fixed `(child, date, catalog)` across 1,000 runs — asserted in unit tests.
- Every seeded activity parses against the canonical schema and passes the safety lint, enforced in CI.
- No response sent to the child client contains an answer key, rationale, or exemplar answer — asserted by an automated test over all six renderers.
- The cross-tenant RLS test matrix (§11) passes: parent B is denied SELECT / INSERT / UPDATE / DELETE against parent A's data on every tenant-owned table, and `anon` is denied everywhere.
- All six activity types can be completed end-to-end in Playwright, and all six render a printable worksheet.
- Zero network calls to any LLM provider exist in the codebase (asserted by a CI dependency check).

## 10. Technical architecture

**Stack:** Next.js (App Router) · React · TypeScript (`strict`) · Tailwind CSS ·
shadcn/ui · Supabase (Postgres + Auth + Storage) · Vitest · Playwright · Vercel · GitHub Actions.

**Layering** — the domain is deliberately isolated from the framework so the engine
and the schemas are testable without a database or a browser.

```
app/                  Next.js routes (thin; server components + server actions)
  (marketing)/        public landing
  (auth)/             login, signup, reset
  (parent)/           authenticated parent shell
  (child)/            child mode shell
  print/              printable worksheet routes
components/           UI (shadcn/ui primitives + app components)
lib/
  domain/
    activity/         canonical schema (zod), types, per-type payload schemas
    policy/           age policies, difficulty bands, cooldowns  ← pure
    engine/           eligibility filter, scoring, difficulty adaptation ← pure
    safety/           denylist, PII/link detectors, reading-level heuristic ← pure
  data/               repository interfaces + Supabase implementations
  supabase/           browser/server/admin clients
  i18n/               message catalogues, locale resolution
content/
  seeds/              curated activities (typed, validated in CI)
supabase/
  migrations/         SQL migrations (schema + RLS policies)
  seed/               seed loader
tests/
  unit/  integration/  e2e/
```

**Key architectural decisions**

| ID | Decision | Rationale | Alternative rejected |
|---|---|---|---|
| A1 | Domain logic is **pure functions over repository interfaces**; Supabase never appears in `lib/domain`. | Engine and policy are unit-testable with fixtures, no DB, no network. | Calling Supabase from the engine — untestable, slow, couples policy to infrastructure. |
| A2 | **RLS is the authorisation boundary**, not application code. Every table denies by default. | A bug in a route handler cannot leak another family's data. | App-layer checks only — one missed `where` clause is a breach. |
| A3 | The **service-role key is never used in request paths.** Only in migrations/seeding scripts. | Removes the main way RLS gets bypassed accidentally. | Admin client "for convenience" in server actions. |
| A4 | Content is **version-controlled seed files**, loaded by a seed script, validated in CI. | Review happens in PRs; content changes are auditable and revertible; no CMS to build or secure. | Authoring content in a DB UI — unreviewable, unversioned. |
| A5 | Assignments **snapshot** the activity payload at assign time. | A child's work never changes under them; parent review always matches what the child saw; makes AI provenance auditable later. | Referencing the live template — edits retroactively rewrite history. |
| A6 | Difficulty is tracked **per child per activity type**, not globally. | A child can be strong at reading and still building handwriting. | Single global level — mis-serves every child. |
| A7 | Child mode is a **client route group + server-verified child context**, not a separate auth role. | Matches the "parent owns the account" principle; no second auth path to secure. | A child JWT — new attack surface, child PII in tokens, more RLS. |
| A8 | Routes and code identifiers are **English**; user-facing strings are **Vietnamese via i18n keys**. | Keeps the codebase greppable and contributor-friendly while shipping a Vietnamese product. | Vietnamese route slugs — unstable under i18n, awkward in URLs and tests. |
| A9 | **No LLM dependency in `package.json`** through Phase 7. | Makes P2/P4 mechanically enforceable in CI rather than a matter of discipline. The check is lifted deliberately at Phase 8, not drifted past. | Adding the SDK "for later" — invites shortcuts. |
| A10 | Photo submissions go to a **private bucket keyed by `parent_id/child_id/...`**, served via short-TTL signed URLs, after a **server-side decode/re-encode** that drops all metadata. | Storage path prefix is itself an RLS check; no public object URLs of children's work; client-side stripping is advisory only, because the client is not trusted. | Public bucket with unguessable names — enumerable and permanently leaked once shared. Client-only EXIF stripping — trivially bypassed by a modified client. |
| A11 | **Assignment eligibility is defended in depth**, not by types: zod validation → a domain assignment guard → a database constraint (added with AI in Phase 8). | TypeScript is erased at runtime and is a *safety* layer, not a security boundary. Each layer catches what the one above it misses. | Relying on a schema shape to make unapproved content "unrepresentable" — true of well-typed code paths, false of `JSON.parse`, raw SQL, or a bug. |
| A12 | **Answer keys never leave the server.** A `toChildView()` projection strips them before any activity reaches the child client. | The snapshot legitimately contains answer keys for parent review and auto-scoring; the child's browser must never receive those bytes. | Hiding answers with CSS or client-side filtering — visible in the network tab. |

## 11. Database model

Postgres, all tables in `public`, all with RLS **enabled** and **forced**.

### Enums

```sql
create type activity_type as enum (
  'handwriting','drawing_prompt','story_comprehension',
  'story_summary','reflection','situation_judgment');
create type grade_level as enum (
  'preschool','grade_1','grade_2','grade_3','grade_4','grade_5','grade_6');
create type assignment_status as enum (
  'assigned','in_progress','submitted','reviewed','skipped');
create type content_status  as enum ('draft','in_review','approved','archived');
create type content_source  as enum ('seed','ai');
create type review_verdict   as enum ('too_easy','just_right','too_hard');
create type response_mode    as enum ('none','text','choice','photo','mixed');
```

### Tables

Twelve tables. `households` and `household_members` were removed in the Phase 0 cleanup:
a child belongs to one parent by foreign key, and an unused membership indirection would
add a join to every policy in the product.

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | The parent account. 1:1 with `auth.users`. | `id uuid pk → auth.users(id)`, `display_name`, `locale default 'vi'`, `child_mode_pin_hash`, `created_at`, `updated_at` |
| `children` | Child profile. **Not** an account. | `id uuid pk`, `parent_id → profiles(id) on delete cascade`, `display_name` (nickname), `birth_year int`, `birth_month int check 1..12`, `grade grade_level`, `avatar_key text`, `locale default 'vi'`, `archived_at`, `created_at` |
| `interests` | Global interest vocabulary. Read-only lookup. | `id`, `slug unique`, `label_vi`, `label_en`, `sort_order` |
| `child_interests` | Child ↔ interest. | pk `(child_id, interest_id)` |
| `activity_templates` | The catalog. Seeded now, AI-drafted from Phase 8. | `id uuid pk`, `slug unique`, `type activity_type`, `locale`, `title`, `instructions`, `min_age`, `max_age`, `grade_min grade_level`, `grade_max grade_level`, `difficulty int check 1..5`, `estimated_minutes`, `interest_tags text[]`, `response_mode response_mode`, `payload jsonb`, `status content_status`, **`source content_source`**, **`approved_by_parent_id uuid null → profiles(id)`**, `owner_id uuid null → profiles(id)`, `schema_version int`, `policy_version text`, `provenance jsonb`, `version int`, `created_at` |
| `child_type_progress` | Per-child, per-type difficulty state. | pk `(child_id, type)`, `difficulty int`, `streak_success int`, `streak_struggle int`, `last_assigned_at` |
| `assignments` | One activity given to one child. | `id uuid pk`, `child_id`, `template_id → activity_templates(id)`, `assigned_by → profiles(id)`, `status assignment_status`, `difficulty_at_assignment int`, **`content_snapshot jsonb not null`**, `snapshot_schema_version int`, `due_on date`, `assigned_at`, `started_at`, `submitted_at`, `reviewed_at` |
| `submissions` | The child's work. One per assignment. | `id uuid pk`, `assignment_id unique → assignments(id) on delete cascade`, `answers jsonb`, `auto_score jsonb null`, `submitted_at` |
| `submission_assets` | Photo/scan attachments. | `id uuid pk`, `submission_id → submissions(id) on delete cascade`, `storage_path text`, `mime_type`, `size_bytes`, `created_at` |
| `assignment_reviews` | Parent's verdict, drives adaptation. | `id uuid pk`, `assignment_id unique`, `reviewer_id → profiles(id)`, `verdict review_verdict`, `note text`, `created_at` |
| `content_reports` | Parent flags bad content. | `id uuid pk`, `reporter_id`, `template_id`, `assignment_id null`, `reason`, `details`, `status`, `created_at` |
| `audit_events` | Append-only trail (assign, review, delete, export). | `id`, `actor_id`, `action`, `subject_type`, `subject_id`, `metadata jsonb`, `created_at` |

Note that `source` and `approved_by_parent_id` are **real columns**, not fields buried in
`provenance jsonb`. That is deliberate: a database constraint can only defend what the
database can see (decision A11, §11.3).

`age` is **not a column anywhere.** It is derived from `birth_year` + `birth_month` at
request time. `age_policies` likewise lives in code (`lib/domain/policy/age-policies.ts`),
not in the database: it is a versioned, reviewed, testable artefact and must not be
editable at runtime. See [CHILD_SAFETY.md](./CHILD_SAFETY.md) §4.

### 11.1 RLS ownership model

Every policy resolves to `auth.uid()` through one direct chain — no indirection:

```
auth.users.id = profiles.id            (the parent)
              → children.parent_id
              → assignments.child_id
              → submissions.assignment_id
              → submission_assets.submission_id
```

```sql
-- profiles: you are your own row
create policy profiles_self on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- children: direct ownership, no join
create policy children_owner on children
  for all using (parent_id = auth.uid()) with check (parent_id = auth.uid());

-- one hop (child_interests, child_type_progress, assignments)
create policy assignments_owner on assignments
  for all using (exists (
    select 1 from children c where c.id = assignments.child_id and c.parent_id = auth.uid()))
  with check (exists (
    select 1 from children c where c.id = assignments.child_id and c.parent_id = auth.uid()));

-- two hops (submissions); three for submission_assets
create policy submissions_owner on submissions
  for all using (exists (
    select 1 from assignments a join children c on c.id = a.child_id
    where a.id = submissions.assignment_id and c.parent_id = auth.uid()));

-- catalog: approved global content is readable by any authenticated parent;
-- parent-owned drafts (Phase 8) are private to their owner. Client writes: none.
create policy templates_read on activity_templates
  for select to authenticated
  using ((owner_id is null and status = 'approved') or owner_id = auth.uid());
```

### 11.2 Where RLS is enabled, and where it is FORCEd

**`ENABLE ROW LEVEL SECURITY` on every table in `public`.** Deny-by-default; a table
with RLS enabled and no matching policy returns nothing. Nothing is granted to `anon` —
unauthenticated access to application data is zero.

**`FORCE ROW LEVEL SECURITY` is applied selectively, with a stated reason** — not
blanket. `FORCE` removes the *table owner's* exemption from its own policies. It is
worth having where no legitimate owner-role write path exists, and it is actively
harmful where one does, because it breaks migrations and the seed loader for no gain
against the actual threat model (a compromised `authenticated` or `anon` client, which
is already fully constrained by ordinary RLS).

| Table | RLS enabled | FORCE | Reason |
|---|---|---|---|
| `submissions` | ✅ | ✅ | Child work. No maintenance path writes here; owner should not be exempt. |
| `submission_assets` | ✅ | ✅ | Same. |
| `assignment_reviews` | ✅ | ✅ | Parent notes about a child. No maintenance path. |
| `content_reports` | ✅ | ✅ | User-submitted reports; owner exemption adds nothing. |
| `profiles` | ✅ | ❌ | Written by the `auth.users` insert trigger, which runs as owner. |
| `children` | ✅ | ❌ | Touched by data-repair and account-deletion routines running as owner. |
| `assignments` | ✅ | ❌ | Same; also read by maintenance for retention work. |
| `child_interests` | ✅ | ❌ | Seed/repair writes as owner. |
| `child_type_progress` | ✅ | ❌ | Initialised by trigger on child creation. |
| `activity_templates` | ✅ | ❌ | The seed loader writes here as owner — FORCE would break it. |
| `interests` | ✅ | ❌ | Public read-only lookup, seeded as owner. |
| `audit_events` | ✅ | ❌ | Append-only; written by triggers and server code as owner. |

> `service_role` carries the `BYPASSRLS` attribute, so **neither `ENABLE` nor `FORCE`
> constrains it**. FORCE is not a defence against a leaked service-role key. The actual
> control for that is decision **A3**: the service-role key never appears in a request
> path, only in migrations and seed scripts, and is lint-banned elsewhere.

Storage: the `submissions` bucket is **private**; its policy asserts
`(storage.foldername(name))[1] = auth.uid()::text`, so the path prefix is the tenant
check. Deletes cascade from `profiles`, so account deletion removes every child row,
assignment, submission and asset; Storage objects under the parent's prefix are purged
by the deletion routine.

### 11.3 Assignment eligibility — defence in depth (decision A11)

TypeScript cannot prevent unapproved content from being assigned. Types are erased at
runtime; a value arriving from `JSON.parse`, a raw SQL result, an `as` cast, or a future
code path is not checked by the compiler. **TypeScript is a safety layer that catches
mistakes during development, not a security boundary.** Eligibility is therefore
enforced three times, at three different levels:

| Layer | Where | Enforces | Defeated by |
|---|---|---|---|
| **1 — Zod validation** | `ActivitySchema.parse()` at every trust boundary (seed load, DB read, API input) | An AI-sourced activity missing `approvedByParentId` / `approvedAt` fails to parse | Nothing that goes through it — but only guards paths that actually call it |
| **2 — Domain assignment guard** | `assertAssignable(activity, actingParentId)`, called by the single `assignActivity` path | `status === 'approved'`; if `source === 'ai'`, an approving parent id is present and matches the acting parent | A second, forgotten write path that skips the guard |
| **3 — Database constraint** | `activity_templates` CHECK + a trigger on `assignments` insert (**added in Phase 8, with AI**) | `status = 'approved' and source = 'ai'` requires `approved_by_parent_id is not null`; an assignment cannot reference an ineligible template | Only `service_role` / owner-level access |

Layer 2 is unit-tested with objects deliberately cast past the type system
(`as unknown as Activity`) to prove the runtime guard, not the compiler, is doing the
work. Layer 3 is deferred to Phase 8 because no AI-sourced row can exist before it —
but the columns it constrains (`source`, `approved_by_parent_id`) are created in
Phase 2 so the constraint is a one-line addition rather than a migration of live data.

### 11.4 Cross-tenant RLS test matrix (mandatory, automated)

An integration suite runs against a real local Postgres with three clients: parent **A**
(owner), parent **B** (attacker), and **anon**. Every cell must be denied — `SELECT`
returning zero rows, writes raising or affecting zero rows. `n/a` marks operations no
client is granted at all (the catalog is written only by the seed loader).

| Table | B: SELECT | B: INSERT | B: UPDATE | B: DELETE | anon: all |
|---|---|---|---|---|---|
| `profiles` | denied | denied | denied | denied | denied |
| `children` | denied | denied | denied | denied | denied |
| `child_interests` | denied | denied | denied | denied | denied |
| `child_type_progress` | denied | denied | denied | denied | denied |
| `assignments` | denied | denied | denied | denied | denied |
| `submissions` | denied | denied | denied | denied | denied |
| `submission_assets` | denied | denied | denied | denied | denied |
| `assignment_reviews` | denied | denied | denied | denied | denied |
| `content_reports` | denied | denied | denied | denied | denied |
| `audit_events` | denied | n/a | n/a | n/a | denied |
| `activity_templates` | *approved global rows readable; A's drafts denied* | n/a | n/a | n/a | denied |
| `interests` | *readable (public lookup)* | n/a | n/a | n/a | denied |
| Storage `submissions/*` | denied | denied | denied | denied | denied |

Two further cases are part of the same suite: a signed URL for A's asset must expire and
must not be fetchable unauthenticated; and adding a new table without extending this
matrix fails CI (the suite enumerates `information_schema.tables` and asserts every
table in `public` is covered).

## 12. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Content authoring is a bottleneck** — original Vietnamese activities take real writing time. | Ships a working engine with a thin library. | MVP target cut to **~20–25 activities**, authored in parallel inside Phase 4 rather than gating implementation. The library grows continuously after launch. |
| **Small catalog ⇒ repetitive suggestions.** At ~20–25 activities this is a real, near-term risk, not a theoretical one. | Parent churn in week 2. | Cooldown windows + type rotation + novelty scoring; the coverage matrix enforces spread across (type × band × difficulty); the catalog-exhausted state is handled honestly rather than by silently repeating. Growing the library is the top post-launch priority. |
| **Child mode is not a security boundary.** | A child could reach the parent's account. | Stated plainly in setup copy; nothing destructive is reachable without re-entering the PIN; no payment data exists to expose. |
| **RLS misconfiguration leaks another family's data.** | Severe — children's work and names. | Deny-by-default RLS on every table; targeted `FORCE` (§11.2); the mandatory cross-tenant matrix of §11.4 covering read/insert/update/delete per table, which fails CI if a new table is not covered; service-role key barred from request paths (A3). |
| **Photo uploads contain faces, addresses, school names, or GPS in EXIF.** | Privacy exposure via any future sharing feature. | **Server-side decode and re-encode** discards all metadata before the asset is stored (client-side stripping is advisory only); private bucket; short-TTL signed URLs; no public URLs; no sharing feature; upload copy warns against including faces or identifying detail; parents can delete submissions. |
| **Vietnamese reading-level estimation has no standard metric** (Flesch is English-specific). | Age-appropriateness of stories is judged by feel. | Phase 1 defines an explicit syllable/word/sentence-length heuristic with documented thresholds per band; human review remains authoritative. |
| **Handwriting worksheets must render Vietnamese diacritics on ruled guides** (`vở ô ly`) correctly across browsers. | The flagship printable looks wrong. | Contained entirely in **Phase 7 (Worksheets)**. Font selection and exact ruling implementation are explicitly **deferred to that phase and must not block Phases 1–6**; the schema already carries a `ruling` enum, so no earlier work depends on the answer. |
| **Scope creep into AI.** | Blows the MVP and the safety story. | Non-goal #1 scopes AI to **Phase 8**; a CI check asserts no LLM dependency through Phase 7 (A9), lifted deliberately rather than drifted past; the AI pipeline has its own doc so "designing it" doesn't mean "building it". |
| **Free-text answers can't be auto-graded ⇒ parent review load.** | Parents stop reviewing; adaptation starves. | Review is one tap (three verdict buttons); adaptation degrades gracefully to completion signals when no verdict is given. |
| **Answer keys leaking to the child client.** The snapshot legitimately contains them for review and scoring. | A child can read the answers from the network tab. | Server-side `toChildView()` projection (A12), with an automated test asserting no answer key, rationale, or exemplar answer appears in any child-facing response. |
| **Supabase auth email deliverability in Vietnam.** | Users can't sign up or reset passwords. | Verify a custom SMTP provider in Phase 4; treat signup e2e as a release gate. |
| **Data residency / PDPD (VN) and COPPA-style obligations.** | Legal exposure. | Data minimisation (principle P5), export + delete in Phase 9, no third-party trackers. Open question for counsel — see §14. |
| **Latency from Vietnam to the chosen Supabase/Vercel regions.** | Sluggish app on mobile networks. | Pick the nearest region (Singapore) at Phase 1; server components keep round-trips low; measure in Phase 9. |

## 13. Assumptions

1. Target age range is **4–12**; grades are the Vietnamese system (`mẫu giáo`, `lớp 1`–`lớp 6`), stored as `preschool` / `grade_1`…`grade_6`.
2. The parent has an email address and a smartphone or tablet; mobile-first, ~360px minimum width.
3. A single family device is shared with the child; the child does not have their own account or device.
4. Activities are **10–20 minutes**; a typical assignment batch is 1–3 activities.
5. A printer is available to *some* parents; printing is valuable but never required.
6. The MVP is free and unmonetised; no billing surface exists.
7. Seed content is **original work authored by the product team**. No commercial book text, textbook extract, or in-copyright story is copied. The `attribution` field exists for any future public-domain or licensed material, but the MVP does not rely on it.
8. Supabase Auth email/password is sufficient; no social login in the MVP.
9. `birth_year` + `birth_month` is precise enough for age banding; exact date of birth is never collected, and age is never persisted — only derived.
10. One submission per assignment; re-doing an activity creates a new assignment rather than a second submission.
11. Multiple-choice is the only auto-scored response type.
12. Vercel + Supabase (Singapore region) is the deployment target; no self-hosting requirement.

## 14. Open questions

Q3 (content rights) and Q4 (handwriting font/ruling) were **resolved or deferred** in the
Phase 0 cleanup and no longer block anything: MVP content is original work, and worksheet
typography is contained inside Phase 7.

| # | Question | Blocks | Default if unanswered |
|---|---|---|---|
| Q1 | Confirm the grade taxonomy — Vietnamese `lớp 1–6` as assumed, or a K-12/US mapping, or both? | Phase 4 enums and content banding | Vietnamese `preschool` + `grade_1`…`grade_6` |
| Q2 | Is the target range really 4–12, or should it start at 6 (`lớp 1`) to avoid pre-literate design work? | Phase 4 authoring volume | 4–12 |
| ~~Q3~~ | ~~Who authors the seed content and what rights do we hold?~~ **Resolved:** original work only, ~20–25 activities. No commercial book, textbook, or in-copyright story text. | — | — |
| ~~Q4~~ | ~~Handwriting ruling and font.~~ **Deferred to Phase 7 (Worksheets)** by decision; must not block Phases 1–6. The `ruling` enum already exists in the schema. | — | — |
| Q5 | Is there a data-residency requirement (Vietnam PDPD) that rules out a Singapore region? | Phase 1 region choice | Singapore, revisit before launch |
| Q6 | Long-term, do you want an admin content-review UI, or is PR-based seed authoring acceptable indefinitely? | Post-MVP roadmap | PR-based (A4) |
| Q7 | Is monetisation planned? If so, when — because it changes what data must be retained. | Post-MVP | Free, unmonetised |
| Q8 | Should a child ever see a *score* on multiple-choice, or only the parent? (P6 leans "child sees encouragement, parent sees the score".) | Phase 5 child UI | Child sees encouragement only; parent sees the score |
| Q9 | Retention policy for photo submissions — keep indefinitely, or auto-purge after N months? | Phase 9 export/delete | Keep until the parent deletes; parents can delete individual submissions at any time |
| Q10 | Confirm Phase 8 (AI personalisation) is genuinely post-launch, with no pilot expected during the MVP. | Guards non-goal #1 | Post-launch, no pilot |
