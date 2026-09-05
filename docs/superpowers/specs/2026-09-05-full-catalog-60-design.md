# Full Catalog 60 — Design

## Goal

Expand the curated Vietnamese activity catalog from 22 to 60 approved seed activities so every age band has 15 activities and no launch band runs dry before roughly two weeks at one activity per day.

## Scope

Target matrix:

| Band | Handwriting | Drawing | Reflection | Situation | Comprehension | Summary | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| early (4–6) | 3 | 3 | 3 | 2 | 2 | 2 | 15 |
| lower_primary (7–8) | 3 | 3 | 3 | 2 | 2 | 2 | 15 |
| upper_primary (9–10) | 3 | 3 | 3 | 2 | 2 | 2 | 15 |
| preteen (11–12) | 3 | 3 | 3 | 2 | 2 | 2 | 15 |

The existing catalog remains unchanged unless a validator requires a correction. Add exactly 38 new activities across the six existing seed modules.

## Content rules

- All Vietnamese content is original work written for this product.
- No commercial book text, textbook extract, copyrighted story adaptation, or third-party answer key.
- Reuse `envelope()` and the existing `ActivityInput` schemas; do not add a new activity type or database field.
- Keep `status: approved`, seed provenance, current age-policy version, and existing safety validation path.
- Respect band reading complexity and response limits.
- Reflection topics stay inside the existing safe theme boundaries and do not solicit private family, health, abuse, sexuality, or financial information.
- Situation-judgment prompts stay everyday, child-solvable, non-dangerous, and include `trustedAdultPath` where the schema requires it.
- For preteen handwriting, focus on readable note-taking, structured short writing, headings, spacing, and presentation rather than tracing or babyish drills.
- Use existing interest slugs only.

## Implementation waves

### 2A — early

Add 11 activities to move early from 4 to 15 and cover all six types.

### 2B — lower_primary

Add 5 activities to move lower_primary from 10 to 15 while preserving all-six-type coverage.

### 2C — upper_primary

Add 10 activities to move upper_primary from 5 to 15 and fill missing type coverage.

### 2D — preteen

Add 12 activities to move preteen from 3 to 15 and fill missing type coverage.

## Verification

Automated gates only for this wave; manual `/play` testing is explicitly deferred.

- `pnpm validate:content`
- `pnpm test:unit`
- `pnpm validate:content:launch`
- CI typecheck/lint/format/security/i18n jobs

Success is 60 valid activities, exactly 15 in each band, with every band represented across all six types and launch validation passing.
