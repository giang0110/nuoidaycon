# AI Content Rules

**Status:** Draft v1 — **DESIGN ONLY. NOT BUILT IN THE MVP.**
**Date:** 2026-08-25
**Related:** [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) · [ACTIVITY_MODEL.md](./ACTIVITY_MODEL.md) · [CHILD_SAFETY.md](./CHILD_SAFETY.md)

---

## 1. Scope and status

The MVP ships **no AI**. There is no model SDK, no API key, no generation endpoint, and
a CI check asserts no LLM provider dependency exists in the tree
([PRODUCT_SPEC.md](./PRODUCT_SPEC.md) non-goal #1, decision A9).

This document exists so the MVP's data model and safety gates are shaped correctly
*now*. Two things in the shipped MVP are load-bearing for this future pipeline and were
designed for it deliberately:

- The canonical `Activity` schema is origin-agnostic — a seeded activity and a generated
  one are the same shape, validated by the same code.
- `provenance.source === 'ai'` **structurally requires** `approvedByParentId` and
  `approvedAt`, so an unapproved generation cannot be represented as a valid `Activity`
  and therefore cannot be assigned.

Nothing below may be implemented without a fresh plan and an explicit decision to lift
non-goal #1.

## 2. Non-negotiable invariants

These inherit from [CHILD_SAFETY.md](./CHILD_SAFETY.md) and hold at every stage.

| # | Invariant |
|---|---|
| AI1 | **No child-facing generation.** A model is never invoked from child mode, never in response to a child's input, and never renders directly to a child. |
| AI2 | **No conversational surface for anyone.** Generation is a request → draft → approve transaction, not a chat. There is no thread, no follow-up turn, no "regenerate with my comments" free-text channel. |
| AI3 | **Parent-in-the-loop is mandatory and explicit.** Auto-approve, "trusted parent" bypass, bulk-approve-all, and scheduled auto-generation are permanently prohibited. |
| AI4 | **Fail closed.** Any stage that errors, times out, or cannot validate discards the candidate. There is no degraded path that ships unvalidated content. |
| AI5 | **No free-form parent prompt reaches the model as instructions.** Parent input is constrained fields, placed in a delimited untrusted block, never concatenated into the system prompt. |
| AI6 | **Minimal child data in prompts.** Age band, grade, difficulty and interest **slugs** only. Never a name, never a birthdate, never free text a child wrote, never a submission, never a photo. |
| AI7 | **Full provenance.** Model id, prompt template id + version, policy version, generation timestamp, approving parent and approval timestamp are recorded on every AI activity and retained in the assignment snapshot. |
| AI8 | **A kill switch exists.** A single server-side flag disables generation globally without a deploy. Existing approved content is unaffected. |

## 3. The pipeline

```
1. Parent request
   → 2. Age policy resolution
   → 3. Approved activity template selection
   → 4. AI generation
   → 5. Schema validation      (L1 + L2)
   → 6. Content safety validation (L3, fail closed)
   → 7. Parent preview          (explicit approval, mandatory)
   → 8. Assign to child         (immutable snapshot)
```

Each stage is a pure, separately testable function except stage 4 (the model call) and
stage 7 (a human decision). A candidate that fails any stage is discarded with a reason
recorded; it is never passed forward "with warnings".

## 4. Stage contracts

### Stage 1 — Parent request

**Input:** `{ childId, type: ActivityType, interestSlugs: InterestSlug[], notes?: ConstrainedNote }`

- `type` is a closed enum. `interestSlugs` are validated against the `interests` table.
- **There is no free-text prompt field.** `notes` — if it exists at all — is a short,
  length-capped, denylist-filtered field that is passed as *untrusted data*, never as
  instructions (AI5), and is dropped entirely if it fails L3.
- Rate-limited per parent per day; cost-capped per account.
- Requires an authenticated parent who owns `childId` (RLS).

### Stage 2 — Age policy resolution

**Input:** the child. **Output:** the immutable constraint set for this request.

Derives the age band from birth month/year, then emits: permitted difficulty range,
maximum story words, maximum sentence length, permitted response modes, prohibited
topic list, and `policyVersion`. This is the same
`lib/domain/policy/age-policies.ts` the MVP engine already uses — one policy, one
implementation, no drift.

The resolved constraints are **passed to every later stage** and re-checked at stage 6.
A model claiming to have complied is not evidence of compliance.

### Stage 3 — Approved activity template selection

**Input:** activity type + resolved policy. **Output:** a versioned prompt template.

- Prompt templates are **in-repo, version-controlled, human-reviewed artefacts**
  (`lib/ai/prompt-templates/`), one per activity type per band. They are never assembled
  at runtime from user input.
- Each carries an id and a semantic version, both recorded in provenance.
- The template pins the output contract (the payload schema for that type), the
  constraints from stage 2, and the prohibited-topic instructions.
- Changing a prompt template is a pull request, reviewed like content.

### Stage 4 — AI generation

- **Structured output only** — schema-constrained/JSON-mode generation against the
  per-type payload schema. Free-form prose responses are rejected without parsing.
- Parent-supplied values are injected only inside an explicitly delimited untrusted
  block, with instructions stating that its contents are data and must never be treated
  as directions. Prompt-injection resistance is assumed to be imperfect, which is why
  stages 5–7 do not trust the output at all.
- Bounded: temperature cap, max tokens, wall-clock timeout, **maximum 2 retries**, then fail.
- No streaming to any UI. Generation is a background transaction; a parent sees a draft or nothing.
- The child's identifiers never enter the prompt (AI6).

### Stage 5 — Schema validation (L1 + L2)

`ActivitySchema.parse()` plus referential refinements — the **same code path** the seed
CI job runs ([ACTIVITY_MODEL.md](./ACTIVITY_MODEL.md) §6). Catches wrong shape, missing
fields, out-of-range values, `answerKey` not present in `choices`, `guided` mode without
options, difficulty outside the band. Failure discards the candidate; at most 2 regeneration
attempts total, then the request fails and the parent is told generation was unavailable.

### Stage 6 — Content safety validation (L3)

Deterministic checks first, and they are authoritative:

- Denylist lexicon (Vietnamese + English) over every string field
- URL / email / phone / social-handle / QR detectors
- PII solicitation patterns
- Length caps and reading-level thresholds for the resolved band
- Per-type structural safety: `trustedAdultPath` present on `situation_judgment`;
  `theme` within the closed reflection set; handwriting `items` character-restricted;
  drawing prompts not requesting self/home/school/faces

A second, independent classifier pass **may** be added, but never replaces the
deterministic layer and never overrides a deterministic rejection. Fail closed (AI4).
Rejections are logged with the failing rule for policy tuning — the rejected content
itself is retained only briefly for that review, never assigned.

### Stage 7 — Parent preview

- The draft is stored as `activity_templates` with `status = 'draft'`, `source = 'ai'`,
  `owner_id = <parent>`. RLS makes it visible **only** to that parent.
- The parent sees the full rendered activity exactly as the child would, plus a clear
  "created by AI, please review" label, the model and prompt-template version, and a
  reminder that they are the approver.
- Actions: **Approve** · **Discard** · **Regenerate** (a fresh run through stages 3–6,
  not a conversational edit — AI2). Manual edits by the parent are permitted and are
  re-validated through L1–L3 on save.
- Approval writes `approvedByParentId` + `approvedAt` and flips status to `approved`.
- Drafts expire automatically after a short TTL and are purged.
- **No auto-approve exists in any form** (AI3).

### Stage 8 — Assign to child

Identical to the seeded path: a deep copy of the validated, approved `Activity` is
written to `assignments.content_snapshot`. The child sees the approved bytes; a later
edit or archive of the draft cannot change assigned work; the audit trail ties the exact
content a child saw to the model, prompt version and approving parent.

## 5. Data flow into models

**Permitted in a prompt:** activity type · age band · grade · target difficulty ·
interest slugs · locale · policy constraints · the prompt template itself · optionally a
sanitised, length-capped parent note as untrusted data.

**Never permitted in a prompt:** the child's name or nickname · birth month/year or exact
age · avatar · any submission text · any uploaded photo · parent identity or email ·
free-form parent instructions as directives · any prior generation's rejected output ·
any data from another family.

## 6. Prohibited uses of AI (permanent)

Even after the pipeline ships, these remain barred:

1. Grading, scoring, or interpreting a child's free-text answers.
2. Analysing a child's uploaded drawings or handwriting photos.
3. Any inference about a child's ability, personality, mood, or wellbeing.
4. Generating content that is assigned without a parent's explicit per-item approval.
5. Personalising content using a child's own words or submitted work.
6. Any voice, avatar, or persona presented to a child as a companion or character to talk to.
7. Sending any child submission to a model provider for any purpose, including evaluation (S10).
8. Using family data to train or fine-tune any model.

## 7. Operational requirements

- **Kill switch** (AI8): server-side flag, no deploy required, disables stages 3–7 globally.
- **Cost and rate limits** per parent per day, plus a global budget ceiling that trips the kill switch.
- **Audit log**: every generation attempt records request parameters, prompt template version, model, outcome (`generated` / `schema_rejected` / `safety_rejected` / `approved` / `discarded`), and timing.
- **Rejection metrics** monitored; a rising safety-rejection rate is a signal to fix the prompt template, never to loosen stage 6.
- **Golden-set regression suite**: a fixed corpus of known-bad candidates that stage 6 must reject and known-good candidates it must accept, run in CI.
- **Red-team suite**: prompt-injection payloads placed in every parent-controlled field, asserting no escape into instructions and no policy bypass.
- **Human spot-audit** of approved AI content on a sampled basis after launch.

## 8. Preconditions before any of this is built

All must be true:

1. The MVP has shipped and the seeded catalog is proven in real use.
2. Non-goal #1 is explicitly lifted by the product owner (open question Q10).
3. L1–L3 validation is battle-tested against the seeded library with a golden set in CI.
4. Legal review of child-data handling is complete ([CHILD_SAFETY.md](./CHILD_SAFETY.md) §8).
5. A written model-provider data-processing agreement exists confirming no training on submitted data and appropriate retention.
6. The kill switch, audit log, and rate/cost limits are built **before** the first generation call, not after.
