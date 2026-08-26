/**
 * The curated catalog.
 *
 * MVP target is ~20–25 ORIGINAL Vietnamese activities across all six types
 * (PRODUCT_SPEC.md §8). This is a launch target, not a precondition: the
 * engine and the players are tested against fixtures, not against the library
 * reaching a count.
 */
import { handwritingSeeds } from './vi/handwriting';
import { drawingSeeds } from './vi/drawing_prompt';
import { reflectionSeeds } from './vi/reflection';
import { situationSeeds } from './vi/situation_judgment';
import { comprehensionSeeds } from './vi/story_comprehension';
import { summarySeeds } from './vi/story_summary';
import type { ActivityInput } from '@/lib/domain/activity/schema';

export const ALL_SEEDS: ActivityInput[] = [
  ...handwritingSeeds,
  ...drawingSeeds,
  ...comprehensionSeeds,
  ...summarySeeds,
  ...reflectionSeeds,
  ...situationSeeds,
];
