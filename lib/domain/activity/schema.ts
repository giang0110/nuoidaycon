/**
 * The canonical Activity schema — docs/product/ACTIVITY_MODEL.md.
 *
 * One shape describes every activity, whatever its origin: a curated seed
 * file, a future AI generation, and the immutable snapshot stored on an
 * assignment are all this type, validated by this code. That is what makes the
 * Phase 8 AI pipeline safe to add later — it has exactly one contract to meet,
 * and it is the contract the seeded catalog already satisfies.
 *
 * Pure module (decision A1): zod only, no Supabase, no Next.js, no React.
 */
import { z } from 'zod';
import { ACTIVITY_TYPES, GRADE_LEVELS } from '@/lib/domain/entities';

export const activityTypeSchema = z.enum(ACTIVITY_TYPES);
export const gradeLevelSchema = z.enum(GRADE_LEVELS);
export const ageBandSchema = z.enum(['early', 'lower_primary', 'upper_primary', 'preteen']);
export const localeSchema = z.enum(['vi', 'en']);
export const contentStatusSchema = z.enum(['draft', 'in_review', 'approved', 'archived']);

const interestSlug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Interest slugs are kebab-case.');

// ---------------------------------------------------------------------------
// Response spec (§4)
// ---------------------------------------------------------------------------

export const responseSpecSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none') }),

  z.object({
    mode: z.literal('text'),
    fields: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string().max(200),
          minWords: z.number().int().min(0).default(0),
          maxWords: z.number().int().min(1).max(400),
          sentenceStarters: z.array(z.string().max(120)).max(5).default([]),
        }),
      )
      .min(1)
      .max(6),
    /** Young children may photograph a handwritten answer instead of typing. */
    allowPhotoInstead: z.boolean().default(true),
  }),

  z.object({
    mode: z.literal('choice'),
    /** Multiple choice is the ONLY auto-scored response type (non-goal #12). */
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

export type ResponseSpec = z.infer<typeof responseSpecSchema>;

// ---------------------------------------------------------------------------
// Payloads (§5)
// ---------------------------------------------------------------------------

/**
 * Vietnamese alphabet plus the few punctuation marks a worksheet needs.
 * Restricting this at the schema level means a handwriting worksheet can never
 * ask a child to copy a URL, an email address, or a foreign string.
 */
const VIETNAMESE_TEXT =
  /^[a-zA-ZàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ0-9\s.,!?-]+$/;

export const handwritingPayloadSchema = z.object({
  script: z.enum(['print', 'cursive']),
  unit: z.enum(['letters', 'syllables', 'words', 'sentence']),
  items: z
    .array(
      z
        .string()
        .min(1)
        .max(60)
        .regex(VIETNAMESE_TEXT, 'Handwriting items must be Vietnamese text only.'),
    )
    .min(1)
    .max(12),
  repetitions: z.number().int().min(1).max(6),
  ruling: z.enum(['o_ly_grid', 'four_line', 'five_line', 'single_line']),
  tracingGuides: z.boolean(),
  showStrokeOrder: z.boolean().default(false),
  focusDiacritics: z.array(z.string().max(4)).max(10).default([]),
});

export const drawingPromptPayloadSchema = z.object({
  prompt: z.string().min(10).max(400),
  checklist: z.array(z.string().max(120)).min(1).max(5),
  suggestedMedium: z
    .array(z.enum(['pencil', 'crayon', 'watercolour', 'marker', 'collage']))
    .default([]),
  warmUp: z.string().max(200).optional(),
  /** There is never a "correct" drawing. */
  openEnded: z.literal(true),
});

export const storyBlockSchema = z.object({
  title: z.string().max(120),
  paragraphs: z.array(z.string().min(20).max(900)).min(1).max(8),
  wordCount: z.number().int().min(20).max(700),
  readingLevel: z.object({
    avgWordsPerSentence: z.number().positive(),
    avgSyllablesPerWord: z.number().positive(),
    band: ageBandSchema,
  }),
  /** Required for any text that is not original to this product. */
  attribution: z.string().max(200).optional(),
});

export const storyComprehensionPayloadSchema = z.object({
  story: storyBlockSchema,
  questions: z
    .array(
      z.discriminatedUnion('kind', [
        z.object({
          kind: z.literal('multiple_choice'),
          id: z.string().min(1),
          prompt: z.string().min(5).max(300),
          choices: z
            .array(z.object({ id: z.string().min(1), text: z.string().max(200) }))
            .min(2)
            .max(4),
          /** PARENT ONLY. Stripped by toChildView (decision A12). */
          answerKey: z.string().min(1),
          rationale: z.string().max(300),
        }),
        z.object({
          kind: z.literal('short_text'),
          id: z.string().min(1),
          prompt: z.string().min(5).max(300),
          /** PARENT ONLY reference. Never machine-compared. */
          exemplarAnswer: z.string().max(400),
          maxWords: z.number().int().min(1).max(120),
        }),
      ]),
    )
    .min(2)
    .max(8),
});

export const storySummaryPayloadSchema = z.object({
  story: storyBlockSchema,
  guidance: z.object({
    minWords: z.number().int().min(5),
    maxWords: z.number().int().max(200),
    /** PARENT ONLY checklist. */
    mustMention: z.array(z.string().max(80)).max(5),
    promptHints: z.array(z.string().max(160)).max(4),
  }),
});

export const reflectionPayloadSchema = z.object({
  /**
   * A closed set, precisely so reflection can never wander into family
   * conflict, health, or private household matters (CHILD_SAFETY.md §5.3).
   */
  theme: z.enum([
    'kindness',
    'effort',
    'honesty',
    'friendship',
    'gratitude',
    'curiosity',
    'responsibility',
    'feelings',
  ]),
  questions: z
    .array(
      z.object({
        id: z.string().min(1),
        prompt: z.string().min(8).max(280),
        sentenceStarters: z.array(z.string().max(120)).max(4).default([]),
      }),
    )
    .min(1)
    .max(4),
  conversationStarter: z.string().max(300).optional(),
});

export const situationJudgmentPayloadSchema = z
  .object({
    scenario: z.string().min(30).max(700),
    question: z.string().min(8).max(240),
    mode: z.enum(['guided', 'open']),
    options: z
      .array(
        z.object({
          id: z.string().min(1),
          text: z.string().max(240),
          /** PARENT ONLY — reveals the "good" option. */
          isConstructive: z.boolean(),
          /** Explains, never scolds. Returned only after the child chooses. */
          feedback: z.string().max(300),
        }),
      )
      .min(2)
      .max(4)
      .optional(),
    /**
     * `z.literal(true)` so it cannot be omitted: EVERY "what would you do?"
     * activity structurally contains "tell a trusted adult" as a valid answer
     * (CHILD_SAFETY.md §5.6).
     */
    trustedAdultPath: z.object({
      present: z.literal(true),
      text: z.string().min(1).max(240),
    }),
    followUp: z.string().max(240).optional(),
  })
  .refine((p) => p.mode !== 'guided' || (p.options?.length ?? 0) >= 2, {
    message: 'Guided mode requires at least two options.',
    path: ['options'],
  });

// ---------------------------------------------------------------------------
// Envelope (§3)
// ---------------------------------------------------------------------------

const provenanceSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('seed'),
    authoredBy: z.string().min(1),
    sourceRef: z.string().optional(),
  }),
  z.object({
    source: z.literal('ai'),
    model: z.string().min(1),
    promptTemplateId: z.string().min(1),
    promptTemplateVersion: z.string().min(1),
    generatedAt: z.string().min(1),
    /**
     * Present only once a parent has approved.
     *
     * Optional at THIS layer because a draft must be representable — an AI
     * activity exists, and is validated, before anyone approves it. The rule
     * that matters is conditional and lives in L2: AI content with
     * `status: 'approved'` MUST carry an approver. That mirrors the database
     * constraint exactly (`source <> 'ai' or status <> 'approved' or
     * approved_by_parent_id is not null`).
     *
     * Making these unconditionally required looked stronger and was wrong: it
     * made the draft state unrepresentable, which would have pushed the
     * pipeline into bypassing validation for drafts — the opposite of safe.
     */
    approvedByParentId: z.string().min(1).optional(),
    approvedAt: z.string().min(1).optional(),
  }),
]);

const envelopeShape = {
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(80),
  locale: localeSchema,
  version: z.number().int().positive(),

  title: z.string().min(3).max(120),
  /** Addressed to the CHILD, second person. */
  instructions: z.string().min(10).max(600),
  /** Addressed to the PARENT. Never shown in child mode. */
  parentNote: z.string().max(600).optional(),

  audience: z.object({
    minAge: z.number().int().min(3).max(18),
    maxAge: z.number().int().min(3).max(18),
    gradeMin: gradeLevelSchema,
    gradeMax: gradeLevelSchema,
  }),

  difficulty: z.number().int().min(1).max(5),
  estimatedMinutes: z.number().int().min(3).max(45),
  interestTags: z.array(interestSlug).max(8).default([]),

  response: responseSpecSchema,

  printable: z.object({
    /** Every activity must be printable (principle P7). */
    supported: z.literal(true),
    layout: z.enum(['worksheet', 'reading', 'prompt_card']),
    pageEstimate: z.number().int().min(1).max(4),
  }),

  safety: z.object({
    policyVersion: z.string().min(1),
    ageBand: ageBandSchema,
    /** Required on EVERY activity, including AI ones. */
    reviewedBy: z.string().min(1),
    reviewedAt: z.string().min(1),
    checks: z.array(z.string()).default([]),
  }),

  provenance: provenanceSchema,
  status: contentStatusSchema,
};

type ActivityTypeName = z.infer<typeof activityTypeSchema>;

/**
 * Generic over the literal so each union member gets `type: 'handwriting'`
 * rather than the whole union — otherwise TypeScript cannot discriminate and
 * `activity.payload` stays a union at every call site.
 */
function withType<TType extends ActivityTypeName, TPayload extends z.ZodTypeAny>(
  type: TType,
  payload: TPayload,
) {
  return z.object({ ...envelopeShape, type: z.literal(type), payload });
}

export const activitySchema = z.discriminatedUnion('type', [
  withType('handwriting', handwritingPayloadSchema),
  withType('drawing_prompt', drawingPromptPayloadSchema),
  withType('story_comprehension', storyComprehensionPayloadSchema),
  withType('story_summary', storySummaryPayloadSchema),
  withType('reflection', reflectionPayloadSchema),
  withType('situation_judgment', situationJudgmentPayloadSchema),
]);

export type Activity = z.infer<typeof activitySchema>;
export type ActivityInput = z.input<typeof activitySchema>;
export type HandwritingActivity = Extract<Activity, { type: 'handwriting' }>;
export type StoryComprehensionActivity = Extract<Activity, { type: 'story_comprehension' }>;
export type SituationJudgmentActivity = Extract<Activity, { type: 'situation_judgment' }>;
