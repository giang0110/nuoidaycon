/**
 * toChildView — ACTIVITY_MODEL.md §7.1, decision A12.
 *
 * The assignment snapshot legitimately contains answer keys: parent review and
 * server-side auto-scoring need them. The CHILD'S BROWSER MUST NEVER RECEIVE
 * THOSE BYTES. Hiding them with CSS or filtering on the client is not hiding
 * them — they would sit in the network tab.
 *
 * Every child-facing response passes through this projection. It returns a
 * DISTINCT type, not `Partial<Activity>`, so a renderer cannot accidentally be
 * handed a full Activity and compile anyway.
 */
import type { Activity } from './schema';

type Strip<T, K extends string> = T extends unknown ? Omit<T, K> : never;

export interface ChildViewBase {
  schemaVersion: 1;
  id: string;
  slug: string;
  locale: 'vi' | 'en';
  version: number;
  title: string;
  instructions: string;
  difficulty: number;
  estimatedMinutes: number;
  response: Activity['response'];
  printable: Activity['printable'];
}

export type ChildViewActivity = ChildViewBase &
  (
    | { type: 'handwriting'; payload: Extract<Activity, { type: 'handwriting' }>['payload'] }
    | { type: 'drawing_prompt'; payload: Extract<Activity, { type: 'drawing_prompt' }>['payload'] }
    | {
        type: 'story_comprehension';
        payload: {
          story: Extract<Activity, { type: 'story_comprehension' }>['payload']['story'];
          questions: (
            | {
                kind: 'multiple_choice';
                id: string;
                prompt: string;
                choices: { id: string; text: string }[];
              }
            | { kind: 'short_text'; id: string; prompt: string; maxWords: number }
          )[];
        };
      }
    | {
        type: 'story_summary';
        payload: {
          story: Extract<Activity, { type: 'story_summary' }>['payload']['story'];
          guidance: { minWords: number; maxWords: number; promptHints: string[] };
        };
      }
    | { type: 'reflection'; payload: Extract<Activity, { type: 'reflection' }>['payload'] }
    | {
        type: 'situation_judgment';
        payload: {
          scenario: string;
          question: string;
          mode: 'guided' | 'open';
          options?: { id: string; text: string }[];
          trustedAdultPath: { present: true; text: string };
          followUp?: string;
        };
      }
  );

/** Fields this projection is responsible for removing. Asserted by tests. */
export const PARENT_ONLY_FIELDS = [
  'parentNote',
  'answerKey',
  'rationale',
  'exemplarAnswer',
  'mustMention',
  'isConstructive',
  'feedback',
  'safety',
  'provenance',
  'audience',
  'status',
  'interestTags',
] as const;

function base(activity: Activity): ChildViewBase {
  return {
    schemaVersion: activity.schemaVersion,
    id: activity.id,
    slug: activity.slug,
    locale: activity.locale,
    version: activity.version,
    title: activity.title,
    instructions: activity.instructions,
    difficulty: activity.difficulty,
    estimatedMinutes: activity.estimatedMinutes,
    response: activity.response,
    printable: activity.printable,
    // Deliberately absent: parentNote, safety, provenance, audience, status.
  };
}

export function toChildView(activity: Activity): ChildViewActivity {
  const common = base(activity);

  switch (activity.type) {
    case 'handwriting':
      return { ...common, type: 'handwriting', payload: activity.payload };

    case 'drawing_prompt':
      return { ...common, type: 'drawing_prompt', payload: activity.payload };

    case 'reflection':
      return { ...common, type: 'reflection', payload: activity.payload };

    case 'story_comprehension':
      return {
        ...common,
        type: 'story_comprehension',
        payload: {
          story: activity.payload.story,
          questions: activity.payload.questions.map((q) =>
            q.kind === 'multiple_choice'
              ? {
                  kind: 'multiple_choice' as const,
                  id: q.id,
                  prompt: q.prompt,
                  choices: q.choices.map((c) => ({ id: c.id, text: c.text })),
                  // answerKey and rationale deliberately dropped.
                }
              : {
                  kind: 'short_text' as const,
                  id: q.id,
                  prompt: q.prompt,
                  maxWords: q.maxWords,
                  // exemplarAnswer deliberately dropped.
                },
          ),
        },
      };

    case 'story_summary':
      return {
        ...common,
        type: 'story_summary',
        payload: {
          story: activity.payload.story,
          guidance: {
            minWords: activity.payload.guidance.minWords,
            maxWords: activity.payload.guidance.maxWords,
            promptHints: activity.payload.guidance.promptHints,
            // mustMention is a parent checklist — dropped.
          },
        },
      };

    case 'situation_judgment':
      return {
        ...common,
        type: 'situation_judgment',
        payload: {
          scenario: activity.payload.scenario,
          question: activity.payload.question,
          mode: activity.payload.mode,
          // isConstructive would reveal the answer; feedback is withheld until
          // AFTER the child chooses and is then returned for that option only.
          options: activity.payload.options?.map((o) => ({ id: o.id, text: o.text })),
          trustedAdultPath: activity.payload.trustedAdultPath,
          ...(activity.payload.followUp ? { followUp: activity.payload.followUp } : {}),
        },
      };
  }
}

/**
 * Feedback for the option a child actually chose, resolved SERVER-SIDE from
 * the stored snapshot. The child never holds the full option list with its
 * feedback, so they cannot read ahead.
 */
export function feedbackForChoice(activity: Activity, optionId: string): string | null {
  if (activity.type !== 'situation_judgment') return null;
  return activity.payload.options?.find((o) => o.id === optionId)?.feedback ?? null;
}

export type { Strip };
