# Child Safety Rules

**Status:** Draft v1 · `policyVersion: age-policy@2026-08-25`
**Date:** 2026-08-25
**Applies to:** all content, all features, MVP and beyond
**Related:** [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) · [ACTIVITY_MODEL.md](./ACTIVITY_MODEL.md) · [AI_CONTENT_RULES.md](./AI_CONTENT_RULES.md)

---

## 1. Standing

This document is **binding**. Rules stated as **MUST NOT** are product invariants: they
are not configurable, not behind a feature flag, and not waivable by a parent setting.
Where a rule can be enforced mechanically it is, and the enforcement point is named.
Everything else is enforced at pull-request review.

## 2. Hard prohibitions

These hold permanently, not just for the MVP.

| # | Rule | Enforcement |
|---|---|---|
| S1 | The product **MUST NOT** provide any free-form conversational interface between a child and a language model. | No generation endpoint reachable from the child route group; no LLM dependency in the MVP at all (CI check). |
| S2 | A child **MUST NOT** be able to send free text to any destination other than their own submission record, which only their parent can read. | Submissions are RLS-scoped to the owning parent; there is no other write path from child mode. |
| S3 | The product **MUST NOT** contain child-to-child or child-to-stranger communication of any kind — no chat, comments, replies, feeds, profiles, sharing links, or presence. | Non-goal #8; no such tables exist in the schema. |
| S4 | Unreviewed content **MUST NOT** reach a child. | `safety.reviewedBy` is required by the schema; `provenance.source === 'ai'` structurally requires `approvedByParentId` ([ACTIVITY_MODEL.md](./ACTIVITY_MODEL.md) §3). |
| S5 | The product **MUST NOT** load third-party advertising, marketing, or behavioural-analytics SDKs, in child mode or anywhere else. | CSP + dependency review; no ad/analytics packages permitted in `package.json`. |
| S6 | The product **MUST NOT** show a child any outbound link, external URL, embedded browser, or app-store prompt. | Child-mode renderers strip links; L3 safety validation rejects URLs in content. |
| S7 | Content **MUST NOT** ask a child to disclose personal information — full name, address, school, phone, email, social handles, daily routine, or when they are home alone. | L3 detectors + closed `theme` / `mode` enums + PR review. |
| S8 | The product **MUST NOT** encourage a child to keep anything secret from their parent or caregiver. | PR review; reinforced by the mandatory `trustedAdultPath` on `situation_judgment`. |
| S9 | Children **MUST NOT** have accounts, credentials, or sessions of their own. | Architectural decision A7; no child auth path exists. |
| S10 | Child submissions **MUST NOT** be sent to any third party, including a model provider, for any purpose. | MVP has no such integration; post-MVP this remains barred ([AI_CONTENT_RULES.md](./AI_CONTENT_RULES.md) §6). |

## 3. Data minimisation

**Collected about a child:** nickname (a nickname is encouraged in the UI copy),
birth **month and year**, grade, chosen interest tags, avatar selected from preset
illustrations, and their own submitted work.

**Never collected about a child:** exact date of birth, legal full name (not required),
email, phone, address, school name, geolocation, device identifiers, biometrics,
contacts, or a required photograph of the child.

Additional rules:

- The **parent** is the only account holder, the only consent-giver, and the only data subject with credentials.
- Photo submissions are stored in a **private** bucket at `{parent_id}/{child_id}/{submission_id}/…` and served exclusively through **short-TTL signed URLs**. No object is ever public.
- Upload UI copy explicitly asks parents to photograph *the work, not the child*, and to avoid capturing faces, names on paper, or school identifiers.
- The parent can **export** all data for their family (JSON + assets) and **delete** the account. Deletion cascades from `profiles` through every child, assignment, submission and asset, and purges Storage objects under the parent's prefix.
- `audit_events` retains actor, action and subject ids — not content — for security review.
- Retention default: data is kept until the parent deletes it (open question Q9).

## 4. Age policy

Age bands are defined **in code** at `lib/domain/policy/age-policies.ts` — a versioned,
reviewed, unit-tested artefact. They are deliberately **not** a database table: a
runtime-editable safety policy is a safety policy that can be edited at runtime.

| Band | Ages | Grades | Difficulty range | Max story words | Max sentence length | Response modes allowed |
|---|---|---|---|---|---|---|
| `early` | 4–6 | preschool, grade_1 | 1–2 | 120 | 12 words | `photo`, `choice`, `none` |
| `lower_primary` | 7–8 | grade_2, grade_3 | 1–3 | 250 | 15 words | + `text` (≤ 40 words) |
| `upper_primary` | 9–10 | grade_4, grade_5 | 2–4 | 450 | 18 words | + `text` (≤ 100 words) |
| `preteen` | 11–12 | grade_6 | 3–5 | 700 | 22 words | + `text` (≤ 200 words) |

Rules:

- A child's adaptive difficulty is **clamped** to their band's range. Adaptation can raise or lower difficulty but can never push a child outside the content approved for their age ([PRODUCT_SPEC.md](./PRODUCT_SPEC.md) §7).
- Band is derived from age at request time; grade is a secondary filter, not an override. A child in an unusual grade for their age still receives age-appropriate content.
- Every activity records the `ageBand` and `policyVersion` it was reviewed against. If the policy version changes, affected content is re-reviewed before it is served.

## 5. Content rules

### 5.1 Prohibited topics (all bands)

Content **MUST NOT** contain, depict, allude to, or ask a child to reason about:

violence, injury or weapons · death or dying as subject matter · sexual content
of any kind, including romance framed for children · nudity or bodily privacy
scenarios · self-harm, suicide, or disordered eating · substances (alcohol, tobacco,
vaping, drugs) · gambling or betting · crime, theft, or how to conceal wrongdoing ·
hate, slurs, stereotyping, or discrimination on any protected characteristic ·
horror, graphic fear, or content designed to frighten · medical, psychological, legal
or financial advice · religious or political persuasion · commercial promotion,
brands, or product placement · contact information, URLs, QR codes, handles, or
invitations to go online · anything that solicits personal data (S7) ·
anything that encourages secrecy from a parent (S8).

Mechanical enforcement (L3, `lib/domain/safety`): a maintained Vietnamese + English
**denylist lexicon**, URL/email/phone/handle regex detectors, and length + reading-level
checks. L3 **fails closed** — content that cannot be validated is rejected, never
"allowed with a warning". Human PR review remains authoritative on tone and nuance;
passing L3 is necessary, never sufficient.

### 5.2 Required qualities

- Warm, encouraging, second-person address to the child.
- Culturally appropriate for a Vietnamese family context; names, foods, places and settings should feel local.
- Failure is never shamed. Feedback explains; it does not scold. No red X, no "wrong!", no time pressure.
- Effort is praised over innate ability.
- Every activity is completable in one sitting by a child at the low end of its age band.

### 5.3 `reflection` specific

The `theme` enum is closed (`kindness`, `effort`, `honesty`, `friendship`, `gratitude`,
`curiosity`, `responsibility`, `feelings`) precisely to bound this type. Reflection
questions **MUST NOT** probe: family conflict or a parent's behaviour · household
finances · a child's mental-health state or diagnosis · body image · religious belief ·
anything a child might feel obliged to disclose privately. The `feelings` theme covers
everyday emotions (disappointment about a rained-off outing), never distress screening.

### 5.4 `story_comprehension` / `story_summary` specific

- Every question must be answerable from the story text alone.
- Non-original text requires `attribution`; the team must hold rights to publish it (open question Q3).
- Reading level must fall within the band's thresholds, measured by the documented Vietnamese heuristic (average words per sentence + average syllables per word), since English readability formulas do not transfer.

### 5.5 `drawing_prompt` / `handwriting` specific

- Prompts **MUST NOT** ask a child to draw themselves, their home, their school, their route to school, or a family member's face.
- Handwriting `items` are restricted by schema refinement to Vietnamese alphabet characters plus `.,!?-` and spaces, so a worksheet can never ask a child to copy a URL or an email address.

### 5.6 `situation_judgment` specific

This is the highest-risk type and carries the strictest rules.

- Scenarios **MUST** be **everyday and child-solvable**: a friend cut in line, a sibling broke your toy, you found a lost wallet in the classroom, you were blamed for something you didn't do.
- Scenarios **MUST NOT** depict abuse, grooming, bullying escalating to harm, strangers offering lifts or gifts, domestic conflict, or any situation whose correct resolution is adult intervention. Danger is not a puzzle for a child to solve.
- `trustedAdultPath` is required by the schema (`z.literal(true)`) — telling a trusted adult is always present and always a valid answer.
- In `guided` mode, no option may be framed so that seeking help is the "wrong"answer, and `feedback` on a non-constructive option explains the consequence without shaming the child for choosing it.

## 6. Product-surface rules

- **Child mode** is full-screen, has no navigation chrome, no settings, no catalog browse, no search, and no route out except the PIN prompt. It is scoped to exactly one child profile at a time.
- Child mode is a **UX lock, not a security boundary** — this is stated to the parent during setup. All real enforcement is server-side (RLS + age policy).
- No timers, countdowns, scores-as-judgement, streaks, badges, leaderboards, or comparisons between children (P6).
- Per open question Q8, the child sees encouragement; the parent sees the multiple-choice score.
- A parent can **report** any content (`content_reports`); reported templates are reviewable and archivable, which removes them from the catalog immediately without altering already-assigned snapshots.
- No feature may make a child's work visible to anyone other than the owning parent.

## 7. Security controls

- RLS **enabled and forced** on every table; deny-by-default; nothing granted to `anon`.
- The Supabase **service-role key is never used in a request path** — migrations and seed scripts only (A3).
- Storage bucket `submissions` is private; its policy asserts `(storage.foldername(name))[1] = auth.uid()::text`.
- Uploads are validated for MIME type and size, re-encoded, and stripped of **EXIF metadata** (which routinely contains GPS coordinates) before storage.
- A strict Content-Security-Policy with no third-party script origins; no inline event handlers.
- Child-mode PIN is stored hashed (`child_mode_pin_hash`), rate-limited on attempts, and never logged.
- No child data appears in logs, error reports, or telemetry.

## 8. Compliance posture

The parent is the account holder and consent-giver; the service is directed at parents,
with children as supervised subjects. This is the design that keeps the product on the
right side of COPPA-style rules and Vietnam's PDPD: minimal child data, no child
accounts, no behavioural advertising, no third-party sharing, and parent-initiated
export and deletion. Data residency is unresolved — see open question Q5. Formal legal
review is required before public launch and is out of scope for engineering.

## 9. CI enforcement summary

The following run on every pull request, and a failure blocks merge:

1. **Schema validation** — every seed parses under L1 + L2 ([ACTIVITY_MODEL.md](./ACTIVITY_MODEL.md) §6).
2. **Safety lint** — every seed passes L3 (denylist, URL/PII detectors, length and reading-level caps).
3. **Age-policy conformance** — every seed's `difficulty` sits inside its declared band's range; its `response.mode` is permitted for that band.
4. **Coverage matrix** — every permitted `(type × ageBand × difficulty)` cell has at least one activity.
5. **No-LLM check** — no LLM provider SDK appears in the dependency tree.
6. **RLS cross-tenant tests** — a second tenant is denied read and write on every table.
7. **Accessibility** — automated axe checks on parent and child routes.
