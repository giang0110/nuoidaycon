import { describe, expect, it } from 'vitest';
import { ALL_SEEDS } from '@/content/seeds';
import { ACTIVITY_TYPES } from '@/lib/domain/entities';

const BANDS = ['early', 'lower_primary', 'upper_primary', 'preteen'] as const;

describe('launch catalog depth', () => {
  it('contains exactly 60 curated activities', () => {
    expect(ALL_SEEDS).toHaveLength(60);
  });

  it.each(BANDS)('%s has exactly 15 activities and all six types', (band) => {
    const seeds = ALL_SEEDS.filter((seed) => seed.safety.ageBand === band);
    expect(seeds).toHaveLength(15);
    expect(new Set(seeds.map((seed) => seed.type))).toEqual(new Set(ACTIVITY_TYPES));
  });

  it('has no duplicate ids or slugs', () => {
    expect(new Set(ALL_SEEDS.map((seed) => seed.id)).size).toBe(ALL_SEEDS.length);
    expect(new Set(ALL_SEEDS.map((seed) => seed.slug)).size).toBe(ALL_SEEDS.length);
  });
});
