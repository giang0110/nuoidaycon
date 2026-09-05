# Full Catalog 60 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the validated Vietnamese catalog to 60 activities: exactly 15 per age band with all six activity types represented in every band.

**Architecture:** Keep the existing six seed modules and `envelope()`/schema/validator pipeline unchanged. Add new immutable seed objects only; no schema, route, recommendation-engine, or database migration changes. Work in four band-scoped commits so coverage changes are reviewable and reversible.

**Tech Stack:** TypeScript, Zod domain schemas, Vitest, existing content validator, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-05-full-catalog-60-design.md`

## Global Constraints

- Final catalog size: exactly 60 approved seed activities.
- Final band size: exactly 15 activities for each of `early`, `lower_primary`, `upper_primary`, `preteen`.
- Every band must contain all six existing activity types.
- Use only existing interest slugs.
- No new database fields, activity types, dependencies, or runtime services.
- All stories/prompts must be original Vietnamese content.
- Manual `/play` testing is deferred; automated content/unit/CI gates are mandatory.

---

### Task 1: Wave 2A — early band to 15

**Files:**
- Modify: `content/seeds/vi/handwriting/index.ts`
- Modify: `content/seeds/vi/drawing_prompt/index.ts`
- Modify: `content/seeds/vi/reflection/index.ts`
- Modify: `content/seeds/vi/situation_judgment/index.ts`
- Modify: `content/seeds/vi/story_comprehension/index.ts`
- Modify: `content/seeds/vi/story_summary/index.ts`
- Test: `tests/integration/catalog.test.ts`

**Interfaces:**
- Consumes: `envelope()`, `storyMetrics()`, `Seed` and each existing type-specific payload shape.
- Produces: early-band catalog with 15 activities and all six types.

- [ ] **Step 1:** Add a focused catalog assertion for `early` expecting 15 items and all six activity types.
- [ ] **Step 2:** Run `pnpm validate:content` / catalog tests and confirm the new assertion fails against the current 4-item early catalog.
- [ ] **Step 3:** Add 11 original early activities, using short instructions, small response limits, concrete everyday topics and age-appropriate reading length.
- [ ] **Step 4:** Run `pnpm validate:content` and `pnpm test:unit`.
- [ ] **Step 5:** Commit as `feat: deepen early activity catalog`.

### Task 2: Wave 2B — lower primary to 15

**Files:** same six seed modules and catalog coverage test.

**Interfaces:**
- Consumes: unchanged seed schema and Wave 2A catalog.
- Produces: lower-primary catalog with 15 activities and all six types.

- [ ] **Step 1:** Add/adjust coverage assertion for `lower_primary` to require 15 items and all six types.
- [ ] **Step 2:** Confirm it fails against the current 10-item lower-primary catalog.
- [ ] **Step 3:** Add 5 original lower-primary activities, prioritising thin types and avoiding duplicate themes/titles.
- [ ] **Step 4:** Run `pnpm validate:content` and `pnpm test:unit`.
- [ ] **Step 5:** Commit as `feat: complete lower primary launch catalog`.

### Task 3: Wave 2C — upper primary to 15

**Files:** same six seed modules and catalog coverage test.

**Interfaces:**
- Consumes: existing validators and previous waves.
- Produces: upper-primary catalog with 15 activities and all six types.

- [ ] **Step 1:** Add/adjust coverage assertion for `upper_primary` to require 15 items and all six types.
- [ ] **Step 2:** Confirm it fails against the current 5-item upper-primary catalog.
- [ ] **Step 3:** Add 10 original upper-primary activities with longer but still bounded reading/writing tasks and diverse interests.
- [ ] **Step 4:** Run `pnpm validate:content` and `pnpm test:unit`.
- [ ] **Step 5:** Commit as `feat: deepen upper primary activity catalog`.

### Task 4: Wave 2D — preteen to 15 and launch gate

**Files:** same six seed modules and catalog coverage test.

**Interfaces:**
- Consumes: all prior waves.
- Produces: preteen catalog with 15 activities, all six types, and final 60-item launch catalog.

- [ ] **Step 1:** Add/adjust coverage assertions for `preteen`, total catalog size 60, and 15 items per band.
- [ ] **Step 2:** Confirm the preteen/total assertions fail before adding the final 12 activities.
- [ ] **Step 3:** Add 12 original preteen activities; handwriting focuses on notes, headings, spacing, and concise structured writing rather than tracing.
- [ ] **Step 4:** Run `pnpm validate:content`, `pnpm test:unit`, and `pnpm validate:content:launch`.
- [ ] **Step 5:** Run repository CI and verify typecheck, lint, format, security audit, i18n, unit, database-security and e2e jobs.
- [ ] **Step 6:** Commit as `feat: complete 60-activity launch catalog`.

### Task 5: Launch-readiness documentation

**Files:**
- Modify: `docs/ops/LAUNCH_READINESS.md`

**Interfaces:**
- Consumes: final validator counts.
- Produces: documentation that no longer reports the old 22-item/38-item content gap.

- [ ] **Step 1:** Update the catalog table to 15 activities and all six types for each band.
- [ ] **Step 2:** Mark the content-depth launch gate as satisfied while leaving metrics, email, residency and legal gates unchanged.
- [ ] **Step 3:** Run format check and verify documentation matches validator output.
- [ ] **Step 4:** Commit as `docs: update catalog launch readiness`.
