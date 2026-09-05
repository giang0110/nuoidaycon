/**
 * The curated launch catalog.
 *
 * Sixty ORIGINAL Vietnamese activities: 15 for each age band, with all six
 * activity types represented in every band. Seed files remain deterministic
 * and pass through the same L1–L3 validation used by database writes and AI.
 */
import { handwritingSeeds } from './vi/handwriting';
import { handwritingExpansionSeeds } from './vi/handwriting/expansion';
import { drawingSeeds } from './vi/drawing_prompt';
import { drawingExpansionSeeds } from './vi/drawing_prompt/expansion';
import { reflectionSeeds } from './vi/reflection';
import { reflectionExpansionSeeds } from './vi/reflection/expansion';
import { situationSeeds } from './vi/situation_judgment';
import { situationExpansionSeeds } from './vi/situation_judgment/expansion';
import { comprehensionSeeds } from './vi/story_comprehension';
import { comprehensionExpansionSeeds } from './vi/story_comprehension/expansion';
import { summarySeeds } from './vi/story_summary';
import { summaryExpansionSeeds } from './vi/story_summary/expansion';
import type { ActivityInput } from '@/lib/domain/activity/schema';

export const ALL_SEEDS: ActivityInput[] = [
  ...handwritingSeeds,
  ...handwritingExpansionSeeds,
  ...drawingSeeds,
  ...drawingExpansionSeeds,
  ...comprehensionSeeds,
  ...comprehensionExpansionSeeds,
  ...summarySeeds,
  ...summaryExpansionSeeds,
  ...reflectionSeeds,
  ...reflectionExpansionSeeds,
  ...situationSeeds,
  ...situationExpansionSeeds,
];
