# Parent Progress & Weekly Insights — Phase 10 Design

**Date:** 2026-09-05
**Status:** Proposed for review
**Repository:** `giang0110/nuoidaycon`
**Branch:** `feat/phase-10-parent-progress-insights`

## 1. Goal

Give a parent a clear, low-pressure view of each child's recent learning activity without introducing scores, streaks, leaderboards, behavioural analytics SDKs, or AI-generated interpretation.

Phase 10 adds first-party progress summaries over the data the product already owns: assignments, submissions, reviews, and per-type difficulty. It does not change the child experience or the recommendation policy.

## 2. Product principles

The feature inherits all existing product and child-safety constraints.

- Parent-only surface. Nothing new is exposed in child mode.
- No points, stars, ranks, streaks, badges, or comparative performance labels.
- No automatic judgment of a child's ability, personality, mood, or wellbeing.
- No third-party analytics SDK and no new external data processor.
- No AI analysis or generated narrative in this phase.
- Prefer descriptive facts over evaluative language.
- Empty-data states must be useful and must not imply failure.

## 3. Scope

### 3.1 Child progress summary

Add a parent-facing progress screen for a selected child with two fixed windows:

- Last 7 days
- Last 30 days

For the selected window show:

1. Assigned activities
2. Completed activities
3. Completion rate, displayed only as a neutral percentage
4. Awaiting-parent-review count
5. Activity-type distribution across all six existing types
6. Current per-type difficulty values from `child_type_progress`
7. Recent activity history with status and review verdict where one exists

The screen must not convert these facts into a single score.

### 3.2 Weekly insights

Add deterministic, rule-based parent guidance derived only from first-party rows. This is not AI and must not infer hidden traits.

Allowed insight examples:

- "Tuần này con đã hoàn thành nhiều hoạt động vẽ hơn các loại khác."
- "Có 2 bài đang chờ bạn nhận xét."
- "7 ngày qua chưa có hoạt động đọc hiểu; bạn có thể chọn một bài đọc hiểu ở lần giao tiếp theo."
- "Mức độ hiện tại của luyện viết là 2/5."

Prohibited insight examples:

- "Con đang yếu môn đọc hiểu."
- "Con có dấu hiệu mất tập trung."
- "Con thông minh hơn tuần trước."
- Any medical, developmental, psychological, or personality inference.

Insight ordering is deterministic and capped at three items so the panel remains actionable rather than noisy.

### 3.3 Parent dashboard integration

The main parent dashboard gains a compact "Tiến bộ gần đây" entry point for each active child. It shows only a small summary and links to the full child progress screen.

No dashboard-wide family ranking or cross-child comparison is added.

## 4. Architecture

### 4.1 Pure aggregation domain

Create a pure progress module under `lib/domain/progress/`.

Responsibilities:

- normalize assignment/review rows into a framework-free input shape
- compute a progress summary for a fixed date window
- compute the six-type distribution
- produce deterministic insight rule ids and parameters

This module must not import Next.js, React, Supabase, or repository implementations.

Suggested interface:

```ts
export interface ProgressWindowInput {
  now: Date;
  days: 7 | 30;
  assignments: ProgressAssignment[];
  typeProgress: TypeDifficulty[];
}

export interface ProgressSummary {
  windowDays: 7 | 30;
  assigned: number;
  completed: number;
  completionRate: number | null;
  awaitingReview: number;
  byType: Record<ActivityType, number>;
  difficultyByType: Record<ActivityType, number>;
  insights: ProgressInsight[];
}

export function buildProgressSummary(input: ProgressWindowInput): ProgressSummary;
```

`completionRate` is `null` when there are no assignments in the window, not `0`.

### 4.2 Data access

Extend the existing repository layer rather than reading Supabase directly from UI components.

The query must be scoped by the authenticated parent through existing RLS and ownership-aware repository patterns. It should fetch only fields needed for aggregation:

- assignment id
- child id
- activity type from the immutable assignment snapshot or canonical persisted type field already used by the app
- status
- assigned/completed timestamps already present in the schema
- review verdict where present
- current `child_type_progress` difficulty

No submission text, uploaded asset URL, child nickname history, or answer content is needed for aggregation.

No new database table is required for Phase 10.

### 4.3 Server rendering

The progress page is a parent-authenticated server-rendered route. Aggregation runs server-side using repository results, then passes only the summary model to presentational components.

This keeps raw assignment history out of client state unless the UI explicitly renders a recent-history row.

### 4.4 UI

Add a mobile-first route under the existing parent child area, preferably:

`/children/[childId]/progress`

The page has:

1. Child header and 7/30-day switch
2. Four compact facts: assigned, completed, completion rate, waiting for review
3. Six activity-type rows or bars using existing design tokens
4. Six current difficulty rows shown descriptively as `n/5`
5. Up to three deterministic insight cards
6. Recent history list

Charts are intentionally simple. Avoid a heavy charting dependency; semantic bars and text are sufficient and more accessible.

### 4.5 i18n

All labels and insight templates go through the existing message catalogue. Insight generation returns ids plus parameters, never final Vietnamese strings from the domain layer.

Example:

```ts
{ id: 'awaiting_review', count: 2 }
```

The page maps that to the Vietnamese message catalogue.

## 5. Data semantics

### Completion

Treat assignment states already considered finished by the existing lifecycle as completed. `submitted` and `reviewed` count as completed; `assigned`, `in_progress`, and `skipped` do not count as completed unless the current schema explicitly defines skipped as completion elsewhere. The implementation must follow the repository's existing status enum exactly.

### Awaiting review

An item awaits review when it has a submitted child result and no parent review yet. Use existing persisted lifecycle fields rather than reconstructing this from client behavior.

### Type distribution

Count assignments by activity type within the selected time window. The distribution is descriptive only; no type is labelled best, worst, weak, or strong.

### Difficulty

Display current per-type difficulty from `child_type_progress`. Do not calculate an average difficulty across types because the existing adaptation model is per-type by design.

## 6. Error and empty states

- Unknown child or child not owned by the parent: reuse existing not-found/ownership behavior.
- Repository error: show the existing generic parent-facing error pattern; do not partially invent numbers.
- No assignments in a window: show zeros for counts, `—` for completion rate, and a neutral prompt to assign an activity.
- No recent history: omit the history rows and show a neutral empty state.
- Missing one type-progress row should be treated as a data integrity error in tests; the schema/trigger is expected to maintain six rows per child.

## 7. Testing

### Unit

Cover pure aggregation exhaustively:

- 7-day and 30-day window boundaries
- no assignments => `completionRate = null`
- submitted/reviewed completion counting
- awaiting-review counting
- exactly six activity-type buckets including zero-count types
- difficulty map for all six types
- deterministic insight ordering and three-item cap
- no insight rule emits evaluative or prohibited language because domain output is ids/parameters only

### Integration

Use the existing disposable PostgreSQL test path to prove:

- parent A can aggregate only parent A's child data
- parent B cannot obtain parent A's assignments/reviews through the repository query
- archived child behavior matches the existing child-profile policy
- no new table is introduced without RLS coverage

### E2E

Add parent-flow coverage for:

- progress link from child/dashboard
- 7 ↔ 30 day switch
- empty child state
- populated state with assigned/completed/waiting-for-review values
- 360px mobile viewport
- no child-mode route exposes the parent progress page

## 8. Non-goals

Phase 10 does not include:

- AI-written summaries
- cross-child comparison
- grade-school curriculum benchmarking
- streaks, goals, badges, points, rewards, or leaderboards
- notifications or weekly email digests
- product-wide admin analytics dashboard
- new tracking events or analytics SDKs
- predictive difficulty or automatic intervention recommendations
- changes to the existing recommendation scoring algorithm

## 9. Rollout

1. Implement on `feat/phase-10-parent-progress-insights`.
2. Run unit, integration, i18n, security, build, and Playwright gates.
3. Open PR into `claude/parent-learning-app-spec-andbvx`.
4. Require green GitHub Actions and Vercel preview.
5. Merge only after review.
6. Verify production Vercel status after merge.
7. Do not mutate live Supabase schema because this phase requires no migration.
8. After Phase 10 is stable, begin Phase C: production/operations hardening and update stale deployment-readiness documentation to match the already-live infrastructure.

## 10. Done when

Phase 10 is complete when:

- a parent can open a child's 7-day and 30-day progress view
- all six activity types are represented even when their count is zero
- completion and waiting-review values match persisted assignment/review state
- deterministic insights remain descriptive and non-evaluative
- no new database table, analytics SDK, AI dependency, or child-facing surface is introduced
- CI, database security tests, and Playwright are green
- Vercel production deployment succeeds after merge
