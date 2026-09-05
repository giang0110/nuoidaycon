# Parent Progress & Weekly Insights — Phase 10 Design

**Date:** 2026-09-05
**Status:** Proposed for review
**Repository:** `giang0110/nuoidaycon`
**Branch:** `feat/phase-10-parent-progress-insights`

## 1. Goal

Give a parent a clear, low-pressure view of each child's recent learning activity without introducing scores, streaks, leaderboards, behavioural analytics SDKs, or AI-generated interpretation.

Phase 10 extends the product's **existing** history/weekly-summary flow rather than creating a second progress subsystem. It uses only first-party data the app already stores: assignments, assignment reviews, and the six per-type difficulty rows.

It does not change child mode, assignment selection, difficulty adaptation, the recommendation score, or the live Supabase schema.

## 2. Existing implementation to extend

The current code already contains the correct foundations:

- `app/(parent)/children/[childId]/history/page.tsx` — parent-only activity history route.
- `lib/domain/engine/summary.ts` — pure `buildWeeklySummary()` plus the explicit safety rule that summaries describe **activity**, never assess the **child**.
- `createAssignmentRepository(...).listForChild()` / `listRecentForChild()` — assignment data access.
- `createProgressRepository(...).listForChild()` — the six current per-type difficulty rows.
- `ReviewRepository` interface already exists in `lib/data/repositories.ts`, although the history page currently reads `assignment_reviews` directly.
- `lib/i18n/messages.vi.ts` / `messages.en.ts` already contain a `history` namespace.

Phase 10 must preserve these patterns and remove the direct review-table query from the page as a targeted architecture improvement.

## 3. Product principles

The feature inherits all existing product and child-safety constraints.

- Parent-only surface. Nothing new is exposed in child mode.
- No points, stars, ranks, streaks, badges, comparative performance labels, or cross-child comparison.
- No automatic judgment of a child's ability, personality, mood, development, or wellbeing.
- No third-party analytics SDK and no new external data processor.
- No AI analysis or generated narrative in this phase.
- Prefer descriptive facts over evaluative language.
- Empty-data states must be useful and must not imply failure.
- Any parent guidance is deterministic and rule-based over persisted facts only.

## 4. Scope

### 4.1 Upgrade the existing History screen into Progress & History

Keep the stable route:

`/children/[childId]/history`

Do **not** add a parallel `/progress` route. The child detail screen and dashboard continue to link to this route, with copy updated from "Lịch sử hoạt động" to a broader parent-facing label such as "Tiến bộ & lịch sử".

The screen supports two fixed windows:

- Last 7 days
- Last 30 days

For the selected window show:

1. Assigned activities
2. Completed activities
3. Completion rate, displayed as a neutral percentage and `—` when there are no assignments
4. Awaiting-parent-review count
5. Activity-type distribution across all six existing types, including zero-count types
6. Current per-type difficulty values from `child_type_progress`
7. Up to three deterministic parent-insight cards
8. Recent activity history with assignment status and review verdict where one exists

The screen must never collapse these facts into a single score.

### 4.2 Parent insights

Insights are deterministic rule ids plus parameters produced by the pure domain layer. They are not prose generated inside the domain module and they are not AI.

Allowed examples after i18n rendering:

- "Có 2 bài đang chờ bạn nhận xét."
- "7 ngày qua chưa có hoạt động đọc hiểu; lần giao tiếp theo bạn có thể chọn một bài đọc hiểu."
- "Tuần này có nhiều hoạt động vẽ hơn các loại khác."
- "Mức độ hiện tại của luyện viết là 2/5."

Prohibited examples:

- "Con đang yếu môn đọc hiểu."
- "Con có dấu hiệu mất tập trung."
- "Con thông minh hơn tuần trước."
- Any medical, developmental, psychological, personality, aptitude, or comparative inference.

Insight ordering is deterministic and capped at three items.

Recommended rule priority:

1. `awaiting_review`
2. `untouched_type`
3. `dominant_type`
4. `current_difficulty`

Rules that do not apply are skipped; the first three applicable results are returned.

### 4.3 Parent dashboard integration

The main parent dashboard gains a compact progress entry point for each active child.

It may show a minimal factual summary such as:

- completed count in the last 7 days
- awaiting-review count

and a link to `/children/[childId]/history`.

No family ranking, sibling comparison, or score is added.

## 5. Architecture

### 5.1 Extend the existing pure summary module

Evolve `lib/domain/engine/summary.ts` instead of introducing a new parallel progress package.

Keep the current safety comment and pure-domain boundary. The module must not import Next.js, React, Supabase, repository implementations, or i18n messages.

Introduce a richer summary contract while preserving compatibility where useful:

```ts
export type ProgressWindowDays = 7 | 30;

export interface SummaryInput {
  assignedAt: string;
  type: ActivityType;
  status: 'assigned' | 'in_progress' | 'submitted' | 'reviewed' | 'skipped';
  verdict: ReviewVerdict | null;
}

export interface TypeDifficulty {
  type: ActivityType;
  difficulty: number;
}

export type ProgressInsight =
  | { id: 'awaiting_review'; count: number }
  | { id: 'untouched_type'; type: ActivityType; windowDays: ProgressWindowDays }
  | { id: 'dominant_type'; type: ActivityType; count: number }
  | { id: 'current_difficulty'; type: ActivityType; difficulty: number };

export interface ProgressSummary {
  windowDays: ProgressWindowDays;
  assigned: number;
  completed: number;
  completionRate: number | null;
  awaitingReview: number;
  byType: Record<ActivityType, number>;
  verdicts: Record<ReviewVerdict, number>;
  untouchedTypes: ActivityType[];
  difficultyByType: Record<ActivityType, number>;
  insights: ProgressInsight[];
}

export function buildProgressSummary(input: {
  entries: readonly SummaryInput[];
  allTypes: readonly ActivityType[];
  typeDifficulty: readonly TypeDifficulty[];
  now: Date;
  windowDays: ProgressWindowDays;
}): ProgressSummary;
```

`buildWeeklySummary()` may remain as a narrow 7-day compatibility wrapper if existing tests or callers benefit from keeping it. New UI work should consume `buildProgressSummary()`.

### 5.2 Data access

Use repository interfaces from server-rendered pages instead of direct Supabase table access.

Targeted change:

```ts
export interface ReviewRepository {
  findByAssignment(assignmentId: string): Promise<AssignmentReview | null>;
  listForAssignments(assignmentIds: readonly string[]): Promise<AssignmentReview[]>;
  create(input: Omit<AssignmentReview, 'id' | 'createdAt'>): Promise<AssignmentReview>;
}
```

Add the Supabase implementation and use it in the upgraded history page.

The summary path needs only:

- assignment id
- child id
- immutable snapshot type/title
- assignment status
- `assigned_at`
- review verdict
- per-type difficulty

It does **not** need submission answers, uploaded assets, child-written text, photo URLs, parent email, or any extra tracking event.

No new table, column, function, trigger, storage object, or migration is required.

### 5.3 Server rendering and query parameter

The upgraded history page remains an authenticated parent server route.

Use a validated search parameter such as:

- `?window=7`
- `?window=30`

Anything else falls back to 7 days.

The server page:

1. resolves the authenticated parent
2. loads the owned child or returns `notFound()`
3. loads assignments, reviews, and type-progress rows
4. builds the pure summary on the server
5. renders presentational UI from the summary model

The raw assignment list remains server-side except for the fields rendered in the history rows.

### 5.4 UI

Enhance `app/(parent)/children/[childId]/history/page.tsx` rather than creating a new route.

Mobile-first structure:

1. Back link + child name
2. 7-day / 30-day segmented links
3. Four factual summary cards: assigned, completed, completion rate, waiting for review
4. Six activity-type distribution rows/bars
5. Up to three insight cards
6. Six current difficulty rows shown descriptively as `n/5`
7. Recent history list

Avoid a charting dependency. Semantic text + CSS bars using existing design tokens are sufficient, lighter, and easier to make accessible.

### 5.5 i18n

Move the current `describeWeek()` user-visible prose out of the pure domain layer during this phase.

The domain returns facts and insight ids/parameters; the page renders them through the existing i18n catalogue.

Extend both `messages.vi.ts` and `messages.en.ts` with matching keys. Vietnamese is complete; English may remain placeholder-quality only to the degree allowed by the existing i18n contract, but key shape must stay identical.

## 6. Data semantics

### Completion

Match the lifecycle already implemented in `summary.ts`:

- `submitted` = completed
- `reviewed` = completed
- `assigned` = not completed
- `in_progress` = not completed
- `skipped` = not completed

### Awaiting review

Match the persisted assignment lifecycle already used by the dashboard and current summary:

- `submitted` = awaiting review
- all other statuses = not awaiting review

Do not reconstruct this from submission text or client behaviour.

### Completion rate

```ts
assigned === 0 ? null : completed / assigned
```

UI may display the rounded percentage, but the domain value stays numeric and neutral.

### Type distribution

Return a complete six-key record. Missing activity types must be represented as zero, not omitted.

Distribution is descriptive only; no type is labelled best, worst, weak, or strong.

### Difficulty

Display current per-type difficulty from `child_type_progress`.

Do not calculate one overall average difficulty because the product adaptation model is intentionally per-type.

Exactly six progress rows are expected for an active child. Tests should fail loudly on duplicate/missing types rather than silently inventing an average. UI may use the existing safe fallback only if a repository failure is not involved.

## 7. Error and empty states

- Unknown child or child not owned by the parent: reuse current `notFound()` ownership behaviour.
- Data-query error: use the existing server error behaviour; never render partial invented metrics.
- No assignments in the selected window: counts are zero, completion rate is `—`, insight copy is neutral.
- No activity history at all: show the existing empty-history state plus a link to assign an activity if consistent with existing navigation.
- Invalid `window` query: fall back to 7 days.
- More than 200 assignments: remove the current `slice(0, 200)` review-query workaround by using the repository method in a bounded, deterministic way; pagination is not required for this phase unless actual query limits make it necessary.

## 8. Testing

### Unit

Extend the existing summary tests using TDD:

- 7-day inclusive boundary
- 30-day inclusive boundary
- invalid timestamps are ignored and never treated as current activity
- zero assignments => `completionRate = null`
- submitted/reviewed completion counting
- submitted-only awaiting-review counting
- exactly six activity-type buckets including zero-count types
- verdict counts remain factual
- exactly six difficulty keys
- deterministic insight priority/order
- maximum three insights
- no insight output contains free-form evaluative language because output is ids/parameters only
- compatibility behaviour for `buildWeeklySummary()` if retained

### Integration

Use the existing disposable PostgreSQL security-test path:

- `ReviewRepository.listForAssignments()` returns only reviews reachable under RLS
- parent B cannot retrieve parent A's review rows through the repository path
- child ownership remains enforced before aggregation
- no schema change means the public-table RLS matrix remains unchanged and green

### E2E

Add parent-flow coverage for:

- child detail → progress/history
- dashboard → progress/history
- 7 ↔ 30 day switch
- empty window
- populated window with assigned/completed/waiting-for-review values
- six type rows visible
- mobile 360px layout
- unauthenticated history route redirects to login through existing middleware
- child-mode UI has no navigation to parent progress/history

## 9. Non-goals

Phase 10 does not include:

- AI-written summaries
- cross-child comparison
- curriculum benchmarking
- streaks, goals, badges, points, rewards, levels, or leaderboards
- notifications or weekly email digests
- product-wide admin analytics dashboard
- new tracking events or analytics SDKs
- predictive difficulty or automatic intervention recommendations
- changes to recommendation scoring or adaptation rules
- database migrations

## 10. Rollout

1. Implement on `feat/phase-10-parent-progress-insights`.
2. Follow TDD and commit per independently reviewable task.
3. Run typecheck, lint, format, i18n, unit, integration/database security, content validation, build, and Playwright.
4. Open a PR into `claude/parent-learning-app-spec-andbvx`.
5. Require green GitHub Actions and Vercel preview.
6. Merge only after review.
7. Verify the merge commit's GitHub Actions and Vercel production status.
8. No live Supabase mutation is expected for Phase 10 because there is no migration.
9. After Phase 10 is stable, begin the user-approved Phase C: production/operations hardening, including correcting stale deployment-readiness documentation to reflect the already-live Supabase/Vercel infrastructure.

## 11. Done when

Phase 10 is complete when:

- a parent can view 7-day and 30-day progress from the existing child history route
- all six activity types are represented even when their count is zero
- completion and waiting-review values match persisted assignment lifecycle state
- current difficulty is shown per type without an overall score
- deterministic insights remain descriptive and non-evaluative
- current direct `assignment_reviews` query is replaced by the repository seam
- no new database table, analytics SDK, AI dependency, or child-facing surface is introduced
- CI, database security tests, Playwright, and Vercel deployment are green
