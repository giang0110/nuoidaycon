# Parent Progress & Weekly Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing parent history flow into a 7/30-day progress and weekly-insights view without adding AI, gamification, analytics SDKs, or database migrations.

**Architecture:** Extend the existing pure `lib/domain/engine/summary.ts` module, add the missing review repository seam, and enhance the existing `/children/[childId]/history` server route. Keep all aggregation server-side and render only factual, deterministic summaries through the existing i18n catalogue.

**Tech Stack:** Next.js 16.3.3 App Router · React 19.2.8 · TypeScript · Supabase · Vitest · Playwright · pnpm 10.33.0 · Node 22+

**Spec:** `docs/superpowers/specs/2026-09-05-parent-progress-weekly-insights-design.md`

## Global Constraints

- Keep route `/children/[childId]/history`; do not add a parallel `/progress` route.
- No new tables, columns, migrations, RPCs, storage objects, analytics SDKs, or external processors.
- No AI-generated text or model calls.
- No points, streaks, ranks, scores about the child, sibling comparisons, diagnoses, personality or ability inference.
- Domain aggregation remains pure and must not import Next.js, React, Supabase, repository implementations, or i18n messages.
- `submitted` and `reviewed` count as completed; only `submitted` counts as awaiting parent review.
- `completionRate` is `null` when there are no assignments.
- All six activity types must always be present in `byType` and `difficultyByType`.
- Insight output is typed rule ids + parameters only and is capped at three items.
- Vietnamese strings live in `messages.vi.ts`; `messages.en.ts` keeps the identical key shape.
- Implementation branch: `feat/phase-10-parent-progress-insights`.

---

### Task 1: Extend the pure summary engine

**Files:**
- Modify: `lib/domain/engine/summary.ts`
- Modify: `tests/unit/summary.test.ts`

**Interfaces:**
- Produces `ProgressWindowDays = 7 | 30`.
- Produces `TypeDifficulty`, `ProgressInsight`, `ProgressSummary`.
- Produces `buildProgressSummary({ entries, allTypes, typeDifficulty, now, windowDays })`.
- Retains `buildWeeklySummary(entries, allTypes, now, windowDays?)` as a compatibility wrapper for existing callers/tests where useful.
- Removes user-facing Vietnamese prose from the domain layer; UI renders copy from i18n.

- [ ] **Step 1: Write failing unit tests for the richer contract**

Add tests covering:

```ts
const typeDifficulty = ACTIVITY_TYPES.map((type, index) => ({
  type,
  difficulty: ((index % 3) + 1) as 1 | 2 | 3,
}));

const summary = buildProgressSummary({
  entries,
  allTypes: ACTIVITY_TYPES,
  typeDifficulty,
  now: NOW,
  windowDays: 7,
});

expect(summary.completionRate).toBe(3 / 4);
expect(Object.keys(summary.byType)).toHaveLength(6);
expect(summary.byType.story_comprehension).toBe(0);
expect(Object.keys(summary.difficultyByType)).toHaveLength(6);
expect(summary.insights.length).toBeLessThanOrEqual(3);
```

Also test a 30-day window, inclusive window boundary, invalid timestamp ignored, empty window `completionRate === null`, submitted-only awaiting-review counting, deterministic insight order, and duplicate/missing difficulty rows throwing a data-integrity error.

- [ ] **Step 2: Run the focused unit test and confirm failure**

Run:

```bash
pnpm exec vitest run --project unit tests/unit/summary.test.ts
```

Expected: FAIL because `buildProgressSummary` and the richer fields do not exist yet.

- [ ] **Step 3: Implement `buildProgressSummary` minimally**

Use a complete six-key record seeded from `allTypes`. Filter entries with `Date.parse(assignedAt) >= now - windowDays * 86_400_000`. Count completed, awaiting review and verdicts exactly per the Global Constraints. Validate that `typeDifficulty` contains each type exactly once.

Insight generation order is fixed:

```ts
awaiting_review -> untouched_type -> dominant_type -> current_difficulty
```

Skip non-applicable rules and return `slice(0, 3)`.

For `dominant_type`, emit it only when one type has a unique highest count greater than 1; ties emit nothing. For `current_difficulty`, use the first type in `allTypes` order whose difficulty is available, which keeps behavior deterministic.

- [ ] **Step 4: Keep compatibility without keeping user-facing prose in domain**

`buildWeeklySummary` may wrap `buildProgressSummary` with an empty/validated difficulty map only if that does not weaken the exact-six-row invariant for the new path. Existing callers that need only historical counts may keep the old `WeeklySummary` contract. Remove `describeWeek()` and update tests so no pure-domain function returns Vietnamese text.

- [ ] **Step 5: Run unit tests**

```bash
pnpm exec vitest run --project unit tests/unit/summary.test.ts
pnpm test:unit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/engine/summary.ts tests/unit/summary.test.ts
git commit -m "feat: extend parent progress summary engine"
```

---

### Task 2: Add the review repository seam

**Files:**
- Modify: `lib/data/repositories.ts`
- Modify: `lib/data/supabase/repositories.ts`
- Create: `tests/integration/review-repository.test.ts`

**Interfaces:**
- Extend `ReviewRepository` with:

```ts
listForAssignments(assignmentIds: readonly string[]): Promise<AssignmentReview[]>;
```

- Export:

```ts
createReviewRepository(db: SupabaseClient): ReviewRepository;
```

- `listForAssignments([])` returns `[]` without issuing an `.in()` query with an empty list.

- [ ] **Step 1: Add a failing repository integration test**

Use the existing disposable PostgreSQL/RLS helper pattern to prove that parent A can read reviews for A's assignments and parent B receives zero rows for the same assignment ids under RLS. Keep this test at the SQL boundary if the Supabase JS client is not available in the integration harness; the repository implementation is additionally exercised by typecheck and the page build.

- [ ] **Step 2: Extend the interface and Supabase implementation**

Map rows to `AssignmentReview` with:

```ts
{
  id: row.id,
  assignmentId: row.assignment_id,
  reviewerId: row.reviewer_id,
  verdict: row.verdict,
  note: row.note,
  createdAt: row.created_at,
}
```

`listForAssignments` selects only review fields and relies on existing RLS as the security boundary.

- [ ] **Step 3: Run focused and full database tests**

```bash
pnpm test:integration
```

In CI this must run with `TEST_DATABASE_URL`; a local skip is not proof. GitHub Actions database job is the release gate.

- [ ] **Step 4: Commit**

```bash
git add lib/data/repositories.ts lib/data/supabase/repositories.ts tests/integration/review-repository.test.ts
git commit -m "refactor: add review repository list query"
```

---

### Task 3: Upgrade History into Progress & History

**Files:**
- Modify: `app/(parent)/children/[childId]/history/page.tsx`
- Modify: `app/(parent)/children/[childId]/page.tsx`
- Modify: `app/(parent)/dashboard/page.tsx`
- Modify: `lib/i18n/messages.vi.ts`
- Modify: `lib/i18n/messages.en.ts`
- Modify: `tests/unit/i18n.test.ts` only if needed for explicit new-copy assertions

**Interfaces:**
- History page accepts `searchParams: Promise<{ window?: string }>` and resolves only `7` or `30`; all other values fall back to 7.
- Consumes `createReviewRepository`, `createProgressRepository`, `buildProgressSummary`.
- No direct `.from('assignment_reviews')` remains in the page.

- [ ] **Step 1: Add i18n keys to Vietnamese and matching empty English keys**

Under `history`, add keys for at least:

```ts
window7, window30, assigned, completed, completionRate, awaitingReview,
distribution, insights, difficulty, recent, noWindowActivity,
insightAwaitingReview, insightUntouchedType, insightDominantType, insightDifficulty,
progressLink
```

Vietnamese copy must remain factual and non-evaluative. Use interpolation in JSX because the current catalogue stores strings, not formatter functions.

- [ ] **Step 2: Replace direct review SQL with repositories**

Load in parallel after child ownership is established:

```ts
const [assignments, progress] = await Promise.all([
  createAssignmentRepository(db).listForChild(childId),
  createProgressRepository(db).listForChild(childId),
]);
const reviews = await createReviewRepository(db).listForAssignments(assignments.map((a) => a.id));
```

Build `verdictByAssignment`, `SummaryInput[]`, and call `buildProgressSummary` with `windowDays`.

- [ ] **Step 3: Render the 7/30-day switch and four factual summary cards**

Use `Link` targets:

```ts
`/children/${child.id}/history?window=7`
`/children/${child.id}/history?window=30`
```

Cards: assigned, completed, completion rate (`—` when null), awaiting review.

- [ ] **Step 4: Render six type-distribution rows and six difficulty rows**

Use `ACTIVITY_TYPES.map(...)` so zero-count types remain visible. CSS bars may use percentage of the maximum count in the selected window; never normalize into a performance score.

- [ ] **Step 5: Render up to three insight cards from typed rule ids**

Map each insight id to an i18n template and parameters. No domain prose and no inference beyond persisted facts.

- [ ] **Step 6: Keep recent history and add progress links**

Keep the recent assignment list. Child detail continues to link to the same route but uses the broader label. Dashboard child rows gain a second small link/entry point to the same route; do not add sibling comparison.

- [ ] **Step 7: Run static and unit gates**

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm check:i18n
pnpm test:unit
pnpm build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/(parent)/children/[childId]/history/page.tsx app/(parent)/children/[childId]/page.tsx app/(parent)/dashboard/page.tsx lib/i18n/messages.vi.ts lib/i18n/messages.en.ts tests/unit/i18n.test.ts
git commit -m "feat: add parent progress and weekly insights view"
```

---

### Task 4: E2E/security regression coverage and release verification

**Files:**
- Modify: `tests/e2e/auth-redirects.spec.ts`
- Modify: `tests/e2e/responsive.spec.ts` only for unauthenticated redirect/responsive coverage that can run without a live auth user
- Create: `tests/unit/progress-page-contract.test.ts` if authenticated E2E cannot be made deterministic in CI without introducing test-only auth bypasses

**Interfaces:**
- Protected history route example: `/children/00000000-0000-0000-0000-000000000000/history?window=30` redirects unauthenticated users to `/login` and preserves `next`.
- No test-only auth bypass, fake production cookie, service-role request path, or weakened middleware is allowed.

- [ ] **Step 1: Extend unauthenticated Playwright coverage**

Add the protected history URL to middleware redirect tests and assert it reaches `/login`.

- [ ] **Step 2: Add a static contract test for the authenticated progress page**

If CI has no deterministic authenticated Supabase fixture, create a unit/static contract test that reads the page source and asserts:

- both `window=7` and `window=30` links exist
- the page imports `createReviewRepository` rather than calling `.from('assignment_reviews')`
- `ACTIVITY_TYPES.map` drives the type rows
- `buildProgressSummary` is used

This supplements, not replaces, the real build and database security jobs. Do not add a fake auth bypass merely to satisfy E2E.

- [ ] **Step 3: Run all repository gates**

```bash
pnpm verify
pnpm build
pnpm test:e2e
```

Then rely on GitHub Actions for the database job and WebKit/browser matrix.

- [ ] **Step 4: Open PR and inspect CI/Vercel preview**

PR base: `claude/parent-learning-app-spec-andbvx`

PR title: `feat: add parent progress and weekly insights`

Do not merge until all GitHub Actions jobs and the Vercel preview status are green.

- [ ] **Step 5: Merge and verify production**

After merge, verify:

- merge commit on base branch
- post-merge GitHub Actions conclusion = success
- Vercel commit status = success
- no Supabase migration was added or applied

- [ ] **Step 6: Commit any final test-only changes before PR merge**

```bash
git add tests/e2e/auth-redirects.spec.ts tests/e2e/responsive.spec.ts tests/unit/progress-page-contract.test.ts
git commit -m "test: cover parent progress route and contract"
```

---

## Plan self-review

- Spec coverage: domain aggregation, repository seam, 7/30 UI, six type/difficulty rows, deterministic insights, dashboard/child links, i18n, RLS regression, Playwright redirect, build/CI/Vercel are all assigned to tasks.
- No schema work is present.
- No user-facing prose remains in the pure domain module after Task 1.
- No task requires a test-only auth bypass.
- Interfaces are consistent: Task 1 produces `buildProgressSummary`; Task 2 produces `createReviewRepository`; Task 3 consumes both; Task 4 verifies the assembled route.
