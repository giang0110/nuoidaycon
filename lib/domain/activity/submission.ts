/**
 * Submission validation and auto-scoring — ACTIVITY_MODEL.md §8.
 *
 * Two rules matter here:
 *
 *  1. Auto-scoring runs SERVER-SIDE against the STORED SNAPSHOT, never against
 *     anything the client sends back. The child's copy has no answer keys in it
 *     (toChildView), so it could not score itself even if we asked it to.
 *
 *  2. Free text is NEVER machine-graded (non-goal #12). It is stored verbatim
 *     for the parent to read. Nothing here scores it, and nothing should.
 */
import { z } from 'zod';
import type { Activity } from './schema';

export const submissionAnswersSchema = z.object({
  text: z.record(z.string(), z.string().max(4000)).default({}),
  choice: z.record(z.string(), z.string().max(200)).default({}),
});

export type SubmissionAnswers = z.infer<typeof submissionAnswersSchema>;

export interface AutoScore {
  correct: number;
  total: number;
  perQuestion: Record<string, boolean>;
}

export type AnswerValidation =
  { ok: true; answers: SubmissionAnswers } | { ok: false; errors: string[] };

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Check a submission against the snapshot's response spec.
 *
 * Word limits are enforced here as well as in the UI, because the UI is a
 * convenience and the server is the rule.
 */
export function validateAnswers(activity: Activity, raw: unknown): AnswerValidation {
  const parsed = submissionAnswersSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  }

  const answers = parsed.data;
  const errors: string[] = [];
  const response = activity.response;

  if (response.mode === 'text' || (response.mode === 'mixed' && response.parts.includes('text'))) {
    if (response.mode === 'text') {
      for (const field of response.fields) {
        const value = answers.text[field.id] ?? '';
        const words = countWords(value);
        if (words > field.maxWords) {
          errors.push(`Câu trả lời "${field.label}" dài quá ${field.maxWords} từ.`);
        }
      }
    }
  }

  if (activity.type === 'story_comprehension') {
    const questionIds = new Set(activity.payload.questions.map((q) => q.id));
    for (const questionId of Object.keys(answers.choice)) {
      if (!questionIds.has(questionId)) {
        errors.push(`Câu hỏi không tồn tại: ${questionId}`);
      }
    }
    for (const q of activity.payload.questions) {
      if (q.kind !== 'multiple_choice') continue;
      const chosen = answers.choice[q.id];
      if (chosen !== undefined && !q.choices.some((c) => c.id === chosen)) {
        errors.push(`Lựa chọn không hợp lệ cho câu ${q.id}`);
      }
    }
  }

  if (activity.type === 'situation_judgment' && activity.payload.mode === 'guided') {
    const chosen = answers.choice.situation;
    const valid = activity.payload.options?.some((o) => o.id === chosen);
    if (chosen !== undefined && !valid) errors.push('Lựa chọn không hợp lệ.');
  }

  return errors.length === 0 ? { ok: true, answers } : { ok: false, errors };
}

/**
 * Score the multiple-choice part only. Returns null when the activity has no
 * choice component — a null score is meaningfully different from zero.
 */
export function autoScore(activity: Activity, answers: SubmissionAnswers): AutoScore | null {
  if (activity.type !== 'story_comprehension') return null;

  const multipleChoice = activity.payload.questions.filter((q) => q.kind === 'multiple_choice');
  if (multipleChoice.length === 0) return null;

  const perQuestion: Record<string, boolean> = {};
  let correct = 0;

  for (const q of multipleChoice) {
    if (q.kind !== 'multiple_choice') continue;
    // Compared against the STORED snapshot's key, never a client-supplied one.
    const isCorrect = answers.choice[q.id] === q.answerKey;
    perQuestion[q.id] = isCorrect;
    if (isCorrect) correct += 1;
  }

  return { correct, total: multipleChoice.length, perQuestion };
}

/** Encouragement for the child. Deliberately not a score (open question Q8). */
export function encouragementFor(score: AutoScore | null): string {
  if (score === null) return 'Con làm xong rồi! Bố mẹ sẽ xem nhé.';
  if (score.correct === score.total) return 'Con làm xong hết rồi, giỏi quá!';
  return 'Con đã làm xong. Bố mẹ sẽ cùng con xem lại nhé.';
}
