/**
 * Shared envelope helpers for seed authoring.
 *
 * All MVP content is ORIGINAL work written for this product. No commercial
 * book text, no textbook extract, no in-copyright story is copied
 * (CHILD_SAFETY.md §5.4).
 */
import type { ActivityInput } from '@/lib/domain/activity/schema';

export const POLICY_VERSION = 'age-policy@2026-08-25';
export const AUTHOR = 'doi-ngu-noi-dung';
export const REVIEWED_AT = '2026-08-26T00:00:00Z';

export type Band = 'early' | 'lower_primary' | 'upper_primary' | 'preteen';

const BAND_AUDIENCE: Record<
  Band,
  { minAge: number; maxAge: number; gradeMin: string; gradeMax: string }
> = {
  early: { minAge: 4, maxAge: 6, gradeMin: 'preschool', gradeMax: 'grade_1' },
  lower_primary: { minAge: 7, maxAge: 8, gradeMin: 'grade_2', gradeMax: 'grade_3' },
  upper_primary: { minAge: 9, maxAge: 10, gradeMin: 'grade_4', gradeMax: 'grade_5' },
  preteen: { minAge: 11, maxAge: 12, gradeMin: 'grade_6', gradeMax: 'grade_6' },
};

export function envelope(input: {
  id: string;
  slug: string;
  title: string;
  instructions: string;
  band: Band;
  difficulty: number;
  estimatedMinutes: number;
  interestTags?: string[];
  parentNote?: string;
  layout: 'worksheet' | 'reading' | 'prompt_card';
  pageEstimate?: number;
}) {
  const audience = BAND_AUDIENCE[input.band];
  return {
    schemaVersion: 1 as const,
    id: input.id,
    slug: input.slug,
    locale: 'vi' as const,
    version: 1,
    title: input.title,
    instructions: input.instructions,
    ...(input.parentNote ? { parentNote: input.parentNote } : {}),
    audience: {
      minAge: audience.minAge,
      maxAge: audience.maxAge,
      gradeMin: audience.gradeMin as never,
      gradeMax: audience.gradeMax as never,
    },
    difficulty: input.difficulty,
    estimatedMinutes: input.estimatedMinutes,
    interestTags: input.interestTags ?? [],
    printable: {
      supported: true as const,
      layout: input.layout,
      pageEstimate: input.pageEstimate ?? 1,
    },
    safety: {
      policyVersion: POLICY_VERSION,
      ageBand: input.band,
      reviewedBy: AUTHOR,
      reviewedAt: REVIEWED_AT,
      checks: [],
    },
    provenance: { source: 'seed' as const, authoredBy: AUTHOR },
    status: 'approved' as const,
  };
}

/** Measure a story so the declared readingLevel matches the actual text. */
export function storyMetrics(paragraphs: string[], band: Band) {
  const text = paragraphs.join(' ');
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = text
    .split(/[.!?…]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    wordCount: words.length,
    readingLevel: {
      avgWordsPerSentence: Math.round((words.length / Math.max(1, sentences.length)) * 10) / 10,
      avgSyllablesPerWord: 1,
      band,
    },
  };
}

export type Seed = ActivityInput;
