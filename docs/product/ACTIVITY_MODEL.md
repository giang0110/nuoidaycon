# Canonical Activity Model

**Status:** Draft v2 · `schemaVersion: 1`
**Date:** 2026-08-25 (revised 2026-08-26)
**Related:** [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) · [CHILD_SAFETY.md](./CHILD_SAFETY.md) · [AI_CONTENT_RULES.md](./AI_CONTENT_RULES.md)

---

## 1. Purpose

One schema describes **every** activity in the system, whatever its origin. A curated
seed file, a future AI generation, and the immutable snapshot stored on an assignment
are all the same shape. This is what makes the AI pipeline safe to add later: the
schema validation gate ([AI_CONTENT_RULES.md](./AI_CONTENT_RULES.md) §4, stage 5) has
exactly one contract to enforce, and it is the same contract the seeded catalog
already satisfies.

Implementation lives in `lib/domain/activity/`, expressed with **zod**. The zod schema
is the single source of truth; TypeScript types are derived with `z.infer`, and the
database `payload jsonb` column is validated against it on write and on read.

## 2. Structure

An activity is an **envelope** (identical for all types) plus a **discriminated payload**
(one per type, keyed by `type`).

```ts
type Activity = ActivityEnvelope & (
  | { type: 'handwriting';         payload: HandwritingPayload }
  | { type: 'drawing_prompt';      payload: DrawingPromptPayload }
  | { type: 'story_comprehension'; payload: StoryComprehensionPayload }
  | { type: 'story_summary';       payload: StorySummaryPayload }
  | { type: 'reflection';          payload: ReflectionPayload }
  | { type: 'situation_judgment';  payload: SituationJudgmentPayload }
);
```

## 3. The envelope

```ts
const ActivityEnvelope = z.object({
  // ---- identity ----
  schemaVersion: z.literal(1),
  id:   z.string().uuid(),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80),
  type: ActivityTypeEnum,
  locale: z.enum(['vi', 'en']),
  version: z.number().int().positive(),

  // ---- presentation ----
  title: z.string().min(3).max(120),
  instructions: z.string().min(10).max(600),   // addressed to the CHILD, 2nd person
  parentNote: z.string().max(600).optional(),  // addressed to the PARENT, never shown in child mode

  // ---- targeting (drives the eligibility filter) ----
  audience: z.object({
    minAge: z.number().int().min(3).max(18),
    maxAge: z.number().int().min(3).max(18),
    gradeMin: GradeLevelEnum,
    gradeMax: GradeLevelEnum,
  }).refine(a => a.minAge <= a.maxAge, 'minAge must be <= maxAge'),

  difficulty: z.number().int().min(1).max(5),
  estimatedMinutes: z.number().int().min(3).max(45),
  interestTags: z.array(InterestSlug).max(8).default([]),

  // ---- how the child responds ----
  response: ResponseSpec,

  // ---- output ----
  printable: z.object({
    supported: z.literal(true),                       // every activity must be printable (P7)
    layout: z.enum(['worksheet', 'reading', 'prompt_card']),
    pageEstimate: z.number().int().min(1).max(4),
  }),

  // ---- governance ----
  safety: z.object({
    policyVersion: z.string(),        // e.g. "age-policy@2026-08-25"
    ageBand: AgeBandEnum,             // 'early' | 'lower_primary' | 'upper_primary' | 'preteen'
    reviewedBy: z.string().min(1),    // human reviewer identifier — required, always
    reviewedAt: z.string().datetime(),
    checks: z.array(z.string()).default([]),  // ids of automated checks that passed
  }),

  provenance: z.discriminatedUnion('source', [
    z.object({ source: z.literal('seed'), authoredBy: z.string(), sourceRef: z.string().optional() }),
    z.object({
      source: z.literal('ai'),
      model: z.string(),
      promptTemplateId: z.string(),
      promptTemplateVersion: z.string(),
      generatedAt: z.string().datetime(),
      approvedByParentId: z.string().uuid(),   // required — enforces the preview gate
      approvedAt: z.string().datetime(),
    }),
  ]),

  status: z.enum(['draft', 'in_review', 'approved', 'archived']),
});
```

Two envelope rules carry real weight:

- **`safety.reviewedBy` is required on every activity, including AI ones.** There is no
  shape of this object that validates as "generated and never looked at by a person".
- **`provenance.source === 'ai'` requires `approvedByParentId` and `approvedAt`.** An AI
  activity that has not been approved by a specific parent **fails zod validation**.

> ⚠️ **What this does and does not guarantee.** The schema makes unapproved AI content
> fail to *validate*. It does **not** make it impossible to assign. TypeScript types are
> erased at runtime: a value from `JSON.parse`, a raw SQL row, an `as` cast, or a code
> path that simply never calls `.parse()` is not checked by anything. **TypeScript is a
> safety layer that catches mistakes during development, not a security boundary.**
>
> The preview gate is therefore enforced at three levels — zod validation, a runtime
> domain guard on the single assignment path, and a database constraint added with AI in
> Phase 8. See [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) §11.3 for the full defence-in-depth
> table. Nothing in this document should be read as a claim that the type system alone
> prevents unapproved content from being assigned.

## 4. Response spec

```ts
const ResponseSpec = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none') }),

  z.object({
    mode: z.literal('text'),
    fields: z.array(z.object({
      id: z.string(),
      label: z.string().max(200),
      minWords: z.number().int().min(0).default(0),
      maxWords: z.number().int().max(400),
      sentenceStarters: z.array(z.string().max(120)).max(5).default([]),
    })).min(1).max(6),
    allowPhotoInstead: z.boolean().default(true),   // young children may photograph handwritten answers
  }),

  z.object({
    mode: z.literal('choice'),
    autoScored: z.literal(true),
  }),

  z.object({
    mode: z.literal('photo'),
    prompt: z.string().max(200),
    maxAssets: z.number().int().min(1).max(3).default(1),
  }),

  z.object({
    mode: z.literal('mixed'),
    parts: z.array(z.enum(['text', 'choice', 'photo'])).min(2),
    maxAssets: z.number().int().min(0).max(3).default(1),
  }),
]);
```

Only `mode: 'choice'` (and the `choice` part of `mixed`) is auto-scored. Free text is
**never** machine-graded — see [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) non-goal #12.

## 5. Per-type payloads

### 5.1 `handwriting` — Luyện viết

```ts
const HandwritingPayload = z.object({
  script: z.enum(['print', 'cursive']),               // chữ in / chữ viết thường
  unit: z.enum(['letters', 'syllables', 'words', 'sentence']),
  items: z.array(z.string().min(1).max(60)).min(1).max(12),
  repetitions: z.number().int().min(1).max(6),
  ruling: z.enum(['o_ly_grid', 'four_line', 'five_line', 'single_line']),
  tracingGuides: z.boolean(),                          // dotted letterforms to trace
  showStrokeOrder: z.boolean().default(false),
  focusDiacritics: z.array(z.string()).max(10).default([]),  // e.g. ["ắ","ề","ỗ"]
});
```
Response is `photo`. Printable layout `worksheet`.
**Constraint:** `items` must contain only characters in the Vietnamese alphabet plus
`.,!?-` and spaces — enforced by a refinement, so a worksheet can never ask a child to
copy a URL, an email address, or a foreign string.

### 5.2 `drawing_prompt` — Vẽ & sáng tạo

```ts
const DrawingPromptPayload = z.object({
  prompt: z.string().min(10).max(400),
  checklist: z.array(z.string().max(120)).min(1).max(5),  // "vẽ ít nhất 3 con vật"
  suggestedMedium: z.array(z.enum(['pencil','crayon','watercolour','marker','collage'])).default([]),
  warmUp: z.string().max(200).optional(),
  openEnded: z.literal(true),      // there is never a "correct" drawing
});
```
Response is `photo`. Printable layout `prompt_card`.
**Constraint:** prompts must not require the child to draw themselves, their home, their
school, or any family member's face — see [CHILD_SAFETY.md](./CHILD_SAFETY.md) §5.

### 5.3 `story_comprehension` — Đọc hiểu

```ts
const StoryBlock = z.object({
  title: z.string().max(120),
  paragraphs: z.array(z.string().min(20).max(900)).min(1).max(8),
  wordCount: z.number().int().min(40).max(700),
  readingLevel: z.object({
    avgWordsPerSentence: z.number(),
    avgSyllablesPerWord: z.number(),
    band: AgeBandEnum,
  }),
  attribution: z.string().max(200).optional(),   // required for non-original text
});

const StoryComprehensionPayload = z.object({
  story: StoryBlock,
  questions: z.array(z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('multiple_choice'),
      id: z.string(),
      prompt: z.string().min(5).max(300),
      choices: z.array(z.object({ id: z.string(), text: z.string().max(200) })).min(2).max(4),
      answerKey: z.string(),          // must match a choice id
      rationale: z.string().max(300), // shown to the PARENT only
    }),
    z.object({
      kind: z.literal('short_text'),
      id: z.string(),
      prompt: z.string().min(5).max(300),
      exemplarAnswer: z.string().max(400),  // parent-only reference, never auto-compared
      maxWords: z.number().int().max(120),
    }),
  ])).min(2).max(8),
});
```
Response is `mixed` (`choice` + `text`). Printable layout `reading`.
**Constraint:** every `answerKey` must resolve to a `choices[].id`; every question must be
answerable from the story text alone (no outside knowledge).

### 5.4 `story_summary` — Tóm tắt truyện

```ts
const StorySummaryPayload = z.object({
  story: StoryBlock,
  guidance: z.object({
    minWords: z.number().int().min(15),
    maxWords: z.number().int().max(200),
    mustMention: z.array(z.string().max(80)).max(5),   // parent-facing checklist
    promptHints: z.array(z.string().max(160)).max(4),  // "Ai là nhân vật chính?"
  }),
});
```
Response is `text` (with `allowPhotoInstead`). Printable layout `reading`.

### 5.5 `reflection` — Câu hỏi suy ngẫm

```ts
const ReflectionPayload = z.object({
  theme: z.enum(['kindness','effort','honesty','friendship','gratitude',
                 'curiosity','responsibility','feelings']),
  questions: z.array(z.object({
    id: z.string(),
    prompt: z.string().min(8).max(280),
    sentenceStarters: z.array(z.string().max(120)).max(4).default([]),
  })).min(1).max(4),
  conversationStarter: z.string().max(300).optional(),  // for the parent to discuss after
});
```
Response is `text`. Printable layout `prompt_card`.
**Constraint:** `theme` is a closed set precisely so reflection can never wander into
family conflict, health, or private household matters — see
[CHILD_SAFETY.md](./CHILD_SAFETY.md) §5.

### 5.6 `situation_judgment` — Nếu là con, con sẽ làm gì?

```ts
const SituationJudgmentPayload = z.object({
  scenario: z.string().min(30).max(700),
  question: z.string().min(8).max(240),
  mode: z.enum(['guided', 'open']),
  options: z.array(z.object({
    id: z.string(),
    text: z.string().max(240),
    isConstructive: z.boolean(),
    feedback: z.string().max(300),     // never shaming; explains, does not scold
  })).min(2).max(4).optional(),        // required when mode === 'guided'
  trustedAdultPath: z.object({
    present: z.literal(true),
    text: z.string().max(240),         // always an available, always-valid response
  }),
  followUp: z.string().max(240).optional(),
}).refine(p => p.mode !== 'guided' || (p.options?.length ?? 0) >= 2,
          'guided mode requires options');
```
Response is `mixed` (`choice` + `text`) for `guided`, `text` for `open`.
Printable layout `prompt_card`.

**`trustedAdultPath.present` is `z.literal(true)`, so it cannot be omitted.** Every
"what would you do?" activity in the system structurally contains "tell a trusted adult"
as a valid answer. Combined with the scenario denylist in
[CHILD_SAFETY.md](./CHILD_SAFETY.md) §5.6, this prevents the type most at risk of
teaching a child to handle a dangerous situation alone.

## 6. Validation layers

An activity must pass **all four** before it can be assigned:

| Layer | Where | What it catches | On failure |
|---|---|---|---|
| **L1 — Structural** | `ActivitySchema.parse()` | Wrong shape, missing fields, out-of-range numbers, bad enums | Reject |
| **L2 — Referential** | zod refinements + `validateActivity()` | `answerKey` not in `choices`, `minAge > maxAge`, `guided` without options, difficulty outside the age band's permitted range | Reject |
| **L3 — Safety** | `lib/domain/safety` | Denylisted terms, URLs, emails, phone numbers, contact solicitation, reading level outside the band, text length caps | Reject (fail closed) |
| **L4 — Human** | Pull-request review (seed) / parent preview (AI) | Tone, cultural fit, pedagogy, factual accuracy | Not approved |
| **G — Runtime guard** | `assertAssignable(activity, actingParentId)` on the assignment path | `status !== 'approved'`; AI content whose approving parent is missing or is not the acting parent | Throw — the assignment is refused |

`G` is not a validation *layer* so much as a gate: it runs at the moment of assignment,
on whatever object actually reached that code, and is unit-tested with values cast past
the compiler (`as unknown as Activity`) to prove the check is done at runtime.

L1–L3 are **pure functions** and run identically in three places: the seed validation
CI job, the database write path, and (later) the AI generation pipeline. There is one
implementation, not three.

## 7. Content snapshotting

When a parent assigns an activity, `assignments.content_snapshot` receives a **deep copy**
of the validated `Activity` object, together with `snapshot_schema_version`.

- The child always sees exactly what the parent previewed.
- Editing or archiving a template never rewrites a child's assigned or completed work.
- Review, printing and history all read the snapshot, never the live template.
- For future AI content this makes the audit trail complete: the exact bytes shown to
  the child are retained alongside the model, prompt template version and approving parent.

Templates are additionally **immutable once `approved`**: a change publishes a new
`version` (and, for breaking payload changes, a new `slug`), rather than mutating the row.

### 7.1 `toChildView()` — answer keys are Parent Mode only

The snapshot legitimately contains answer keys, because parent review and auto-scoring
need them. The child's browser must never receive those bytes. Every child-facing
response is therefore passed through a **server-side projection**:

```ts
function toChildView(activity: Activity): ChildViewActivity
```

It removes, by construction:

| Field | Type | Why |
|---|---|---|
| `parentNote` | envelope | Written for the parent, not the child |
| `questions[].answerKey` | `story_comprehension` | The answer |
| `questions[].rationale` | `story_comprehension` | Explains the answer |
| `questions[].exemplarAnswer` | `story_comprehension` | A model answer |
| `guidance.mustMention` | `story_summary` | A parent-facing checklist |
| `options[].isConstructive` | `situation_judgment` | Reveals the "good" option |
| `options[].feedback` | `situation_judgment` | Withheld until after the child chooses, then returned for the chosen option only |

`ChildViewActivity` is a distinct type, not `Partial<Activity>`, so a renderer cannot
accidentally be handed a full `Activity`. Auto-scoring runs **server-side against the
stored snapshot**, never against anything the client sends back or holds.

An automated test asserts that no child-facing response for any of the six renderers
contains an answer key, rationale, or exemplar answer — see
[PRODUCT_SPEC.md](./PRODUCT_SPEC.md) §9 and decision A12.

## 8. Submission shape

```ts
const Submission = z.object({
  assignmentId: z.string().uuid(),
  answers: z.object({
    text:   z.record(z.string(), z.string().max(4000)).default({}),   // fieldId -> answer
    choice: z.record(z.string(), z.string()).default({}),             // questionId -> choiceId
  }),
  assetIds: z.array(z.string().uuid()).max(3).default([]),
  submittedAt: z.string().datetime(),
});

const AutoScore = z.object({
  correct: z.number().int(),
  total: z.number().int(),
  perQuestion: z.record(z.string(), z.boolean()),
}).nullable();   // null whenever the activity has no `choice` component
```

Auto-scoring runs **server-side only**, over `answers.choice`, comparing against
`answerKey` in the stored snapshot — never against a key sent by the client, which never
has one (§7.1). Text answers are stored verbatim and shown to the parent; nothing grades
them. Per open question Q8, the child sees encouragement rather than a score.

## 9. Versioning

`schemaVersion` is a literal on the envelope. Bumping it requires:

1. A new zod schema module (`v2/`) alongside v1 — v1 is never deleted while snapshots reference it.
2. A migration function `v1 → v2` used to read old snapshots.
3. A CI assertion that every existing seed and every stored snapshot still parses under its own declared version.

Additive, optional fields do **not** bump `schemaVersion`; they bump the template's
`version` only.

## 10. Seed file layout

```
content/seeds/
  vi/
    handwriting/         hw-o-ly-a-am-01.ts …
    drawing_prompt/
    story_comprehension/
    story_summary/
    reflection/
    situation_judgment/
  index.ts               // typed export; CI parses every entry through L1–L3
```

Each file default-exports a `satisfies Activity` object, so authoring errors surface in
the editor and in `tsc`, before CI — a convenience for authors, not a guarantee, since
every seed is still parsed through L1–L3 at load time and in CI.

**MVP content scope: approximately 20–25 original activities**, covering all six types
across the age bands. This is a launch target, not a precondition — implementation does
not wait on the library reaching a count. All MVP content is **original work authored for
this product**; commercial book text, textbook extracts, and in-copyright stories are
never copied. The `attribution` field on `StoryBlock` exists for future public-domain or
properly licensed material.

The coverage matrix reports which `(type × ageBand × difficulty)` cells are filled and
fails CI on a cell that the age policy permits and the roadmap has marked required — it
does not demand every permitted cell be filled at MVP.
