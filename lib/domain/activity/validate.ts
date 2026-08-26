/**
 * Composed validation — ACTIVITY_MODEL.md §6.
 *
 *   L1 structural  → zod parse
 *   L2 referential → cross-field checks zod cannot express alone
 *   L3 safety      → denylist, link/PII detectors, readability caps (fail closed)
 *
 * One implementation, reused by the seed CI job, the database read path, and
 * the Phase 8 AI pipeline.
 */
import { activitySchema, type Activity } from './schema';
import { getAgeBand, clampDifficultyToBand, isResponseModeAllowed } from '@/lib/domain/policy/age';
import {
  checkDenylist,
  checkForbiddenPatterns,
  checkReadability,
  type SafetyFailure,
} from '@/lib/domain/safety';

export interface ValidationFailure {
  readonly layer: 'L1' | 'L2' | 'L3';
  readonly rule: string;
  readonly path: string;
  readonly detail: string;
}

export type ValidationResult =
  { ok: true; activity: Activity } | { ok: false; failures: readonly ValidationFailure[] };

/** L2 — referential integrity across fields. */
export function validateReferential(activity: Activity): ValidationFailure[] {
  const failures: ValidationFailure[] = [];
  const band = getAgeBand(activity.safety.ageBand);

  const push = (rule: string, path: string, detail: string) =>
    failures.push({ layer: 'L2', rule, path, detail });

  // AI content may exist as a draft, but may never be APPROVED without an
  // approving parent. Same rule as the database constraint (PRODUCT_SPEC.md
  // §11.3) and as assertAssignable — three layers, one rule.
  if (activity.provenance.source === 'ai' && activity.status === 'approved') {
    if (!activity.provenance.approvedByParentId) {
      push(
        'provenance.ai_approved_without_parent',
        'provenance.approvedByParentId',
        'approved AI content must record the parent who approved it',
      );
    }
    if (!activity.provenance.approvedAt) {
      push(
        'provenance.ai_approved_without_timestamp',
        'provenance.approvedAt',
        'approved AI content must record when it was approved',
      );
    }
  }

  if (activity.audience.minAge > activity.audience.maxAge) {
    push('audience.range', 'audience', 'minAge must be <= maxAge');
  }

  // The declared band must actually contain the declared audience.
  if (activity.audience.minAge < band.minAge || activity.audience.maxAge > band.maxAge) {
    push(
      'audience.band_mismatch',
      'audience',
      `ages ${activity.audience.minAge}-${activity.audience.maxAge} fall outside band ` +
        `${band.key} (${band.minAge}-${band.maxAge})`,
    );
  }

  if (clampDifficultyToBand(activity.difficulty, band) !== activity.difficulty) {
    push(
      'difficulty.out_of_band',
      'difficulty',
      `${activity.difficulty} outside ${band.key} range ${band.minDifficulty}-${band.maxDifficulty}`,
    );
  }

  if (!isResponseModeAllowed(activity.response.mode, band)) {
    push(
      'response.mode_not_allowed',
      'response.mode',
      `${activity.response.mode} is not permitted for ${band.key}`,
    );
  }

  if (activity.response.mode === 'text') {
    for (const [i, field] of activity.response.fields.entries()) {
      if (field.maxWords > band.maxAnswerWords) {
        push(
          'response.answer_too_long',
          `response.fields[${i}].maxWords`,
          `${field.maxWords} exceeds band cap ${band.maxAnswerWords}`,
        );
      }
      if (field.minWords > field.maxWords) {
        push('response.word_range', `response.fields[${i}]`, 'minWords must be <= maxWords');
      }
    }
  }

  if (activity.type === 'story_comprehension') {
    for (const [i, q] of activity.payload.questions.entries()) {
      if (q.kind === 'multiple_choice') {
        const ids = q.choices.map((c) => c.id);
        if (!ids.includes(q.answerKey)) {
          push(
            'question.answer_key_missing',
            `payload.questions[${i}].answerKey`,
            `"${q.answerKey}" is not one of ${ids.join(', ')}`,
          );
        }
        if (new Set(ids).size !== ids.length) {
          push(
            'question.duplicate_choice_ids',
            `payload.questions[${i}].choices`,
            'ids must be unique',
          );
        }
      }
    }
    const qIds = activity.payload.questions.map((q) => q.id);
    if (new Set(qIds).size !== qIds.length) {
      push('question.duplicate_ids', 'payload.questions', 'question ids must be unique');
    }
  }

  if (activity.type === 'story_summary') {
    const { minWords, maxWords } = activity.payload.guidance;
    if (minWords > maxWords) push('guidance.word_range', 'payload.guidance', 'minWords > maxWords');
  }

  if (activity.type === 'situation_judgment' && activity.payload.mode === 'guided') {
    const options = activity.payload.options ?? [];
    if (!options.some((o) => o.isConstructive)) {
      push(
        'situation.no_constructive_option',
        'payload.options',
        'at least one option must be constructive — a child must have a good choice available',
      );
    }
  }

  return failures;
}

interface ReadableText {
  path: string;
  text: string;
  isStory?: boolean;
}

/** Which strings a CHILD actually has to read, for the readability caps. */
function readableTexts(activity: Activity): ReadableText[] {
  const texts: ReadableText[] = [{ path: 'instructions', text: activity.instructions }];

  // Narrowed one variant at a time: TypeScript cannot narrow a discriminated
  // union through an `||` of two discriminants.
  switch (activity.type) {
    case 'story_comprehension':
    case 'story_summary':
      texts.push({
        path: 'payload.story',
        text: activity.payload.story.paragraphs.join(' '),
        isStory: true,
      });
      break;
    case 'situation_judgment':
      texts.push({ path: 'payload.scenario', text: activity.payload.scenario });
      break;
    default:
      break;
  }

  return texts;
}

function toValidationFailures(failures: SafetyFailure[]): ValidationFailure[] {
  return failures.map((f) => ({ layer: 'L3' as const, ...f }));
}

/**
 * Run all three layers. Fails closed: any failure at any layer rejects.
 */
export function validateActivity(input: unknown): ValidationResult {
  const parsed = activitySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      failures: parsed.error.issues.map((issue) => ({
        layer: 'L1' as const,
        rule: issue.code,
        path: issue.path.join('.') || '(root)',
        detail: issue.message,
      })),
    };
  }

  const activity = parsed.data;
  const failures: ValidationFailure[] = [...validateReferential(activity)];

  const band = getAgeBand(activity.safety.ageBand);
  failures.push(
    ...toValidationFailures([
      ...checkDenylist(activity),
      ...checkForbiddenPatterns(activity),
      ...checkReadability(readableTexts(activity), band),
    ]),
  );

  return failures.length === 0 ? { ok: true, activity } : { ok: false, failures };
}
