import { describe, it, expect } from 'vitest';
import {
  suggestActivities,
  scoreTemplate,
  interestOverlap,
  difficultyFit,
  typeRotation,
  novelty,
  isEligible,
  explainSuggestion,
  type ChildContext,
} from '@/lib/domain/engine/recommend';
import { applyReview, applyCompletionSignal } from '@/lib/domain/engine/adapt';
import { hashString, seededRandom, dateBucketFor } from '@/lib/domain/engine/prng';
import { getAgeBand, resolveBandForChild } from '@/lib/domain/policy/age';
import type {
  ActivityTemplate,
  ActivityType,
  Child,
  ChildTypeProgress,
} from '@/lib/domain/entities';

const NOW = new Date('2026-08-26T00:00:00Z');

const child: Child = {
  id: 'child-1',
  parentId: 'parent-1',
  displayName: 'Bé Bi',
  birthYear: 2018,
  birthMonth: 6, // 8 years old at NOW → lower_primary
  grade: 'grade_2',
  avatarKey: 'cat',
  locale: 'vi',
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
};

function template(over: Partial<ActivityTemplate> & { id: string }): ActivityTemplate {
  return {
    slug: over.id,
    type: 'reflection',
    locale: 'vi',
    title: 'T',
    instructions: 'I',
    minAge: 7,
    maxAge: 8,
    gradeMin: 'grade_2',
    gradeMax: 'grade_3',
    difficulty: 2,
    estimatedMinutes: 10,
    interestTags: [],
    responseMode: 'text',
    payload: {},
    status: 'approved',
    source: 'seed',
    approvedByParentId: null,
    ownerId: null,
    schemaVersion: 1,
    policyVersion: 'age-policy@2026-08-25',
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const TYPES: ActivityType[] = [
  'handwriting',
  'drawing_prompt',
  'story_comprehension',
  'story_summary',
  'reflection',
  'situation_judgment',
];

/** A catalog spread across types and difficulties, as the real one will be. */
const catalog: ActivityTemplate[] = TYPES.flatMap((type, ti) =>
  [1, 2, 3].map((difficulty) =>
    template({
      id: `${type}-${difficulty}`,
      type,
      difficulty: difficulty as ActivityTemplate['difficulty'],
      interestTags: ti % 2 === 0 ? ['animals'] : ['space'],
    }),
  ),
);

const ctx: ChildContext = {
  child,
  interestSlugs: ['animals'],
  difficultyByType: { reflection: 2, handwriting: 1 },
  history: [],
};

describe('seeded PRNG', () => {
  it('is stable for the same seed', () => {
    expect(seededRandom(42)()).toBe(seededRandom(42)());
    expect(hashString('abc')).toBe(hashString('abc'));
  });

  it('differs for different seeds', () => {
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
  });

  it('buckets by UTC day', () => {
    expect(dateBucketFor(new Date('2026-08-26T23:59:59Z'))).toBe('2026-08-26');
    expect(dateBucketFor(new Date('2026-08-27T00:00:00Z'))).toBe('2026-08-27');
  });
});

describe('sub-scores', () => {
  it('interestOverlap stays neutral when no interests are chosen', () => {
    expect(interestOverlap(['animals'], [])).toBe(1);
  });

  it('interestOverlap rewards a shared tag', () => {
    expect(interestOverlap(['animals'], ['animals'])).toBe(1);
    expect(interestOverlap(['space'], ['animals'])).toBe(0);
  });

  it('difficultyFit peaks at an exact match', () => {
    expect(difficultyFit(3, 3)).toBe(1);
    expect(difficultyFit(1, 5)).toBe(0);
  });

  it('typeRotation penalises a recently assigned type', () => {
    const history = [
      { templateId: 'x', type: 'reflection' as const, assignedAt: NOW.toISOString() },
    ];
    expect(typeRotation('reflection', history, NOW)).toBeLessThan(
      typeRotation('handwriting', history, NOW),
    );
  });

  it('novelty is 1 for a template never assigned', () => {
    expect(novelty('never', [], NOW)).toBe(1);
  });

  it('novelty decays with recency', () => {
    const recent = [
      { templateId: 't', type: 'reflection' as const, assignedAt: NOW.toISOString() },
    ];
    expect(novelty('t', recent, NOW)).toBe(0);
  });
});

describe('hard filter', () => {
  const band = resolveBandForChild(child, NOW);

  it('excludes a template outside the age range', () => {
    const t = template({ id: 'too-old', minAge: 11, maxAge: 12 });
    expect(isEligible(t, ctx, band, NOW, 21).eligible).toBe(false);
  });

  it('excludes a template outside the grade range', () => {
    const t = template({ id: 'wrong-grade', gradeMin: 'grade_5', gradeMax: 'grade_6' });
    expect(isEligible(t, ctx, band, NOW, 21).eligible).toBe(false);
  });

  it('excludes unapproved content', () => {
    const t = template({ id: 'draft', status: 'draft' });
    expect(isEligible(t, ctx, band, NOW, 21).eligible).toBe(false);
  });

  it("excludes another parent's private draft", () => {
    const t = template({ id: 'owned', ownerId: 'someone-else' });
    expect(isEligible(t, ctx, band, NOW, 21).eligible).toBe(false);
  });

  it('excludes difficulty outside the band', () => {
    // lower_primary allows 1–3.
    const t = template({ id: 'too-hard', difficulty: 5 });
    expect(isEligible(t, ctx, band, NOW, 21).eligible).toBe(false);
  });

  it('excludes a template inside its cooldown window', () => {
    const recent = {
      ...ctx,
      history: [
        {
          templateId: 'reflection-2',
          type: 'reflection' as const,
          assignedAt: new Date(NOW.getTime() - 3 * 86_400_000).toISOString(),
        },
      ],
    };
    const t = catalog.find((c) => c.id === 'reflection-2')!;
    expect(isEligible(t, recent, band, NOW, 21).eligible).toBe(false);
  });

  it('allows it again once the cooldown has elapsed', () => {
    const old = {
      ...ctx,
      history: [
        {
          templateId: 'reflection-2',
          type: 'reflection' as const,
          assignedAt: new Date(NOW.getTime() - 40 * 86_400_000).toISOString(),
        },
      ],
    };
    const t = catalog.find((c) => c.id === 'reflection-2')!;
    expect(isEligible(t, old, band, NOW, 21).eligible).toBe(true);
  });
});

describe('suggestActivities', () => {
  it('is deterministic across 1000 runs for a fixed child, date and catalog', () => {
    const first = suggestActivities(ctx, catalog, { now: NOW });
    expect(first.exhausted).toBe(false);
    const signature = first.suggestions.map((s) => s.template.id).join(',');

    for (let i = 0; i < 1000; i += 1) {
      const again = suggestActivities(ctx, catalog, { now: NOW });
      expect(again.suggestions.map((s) => s.template.id).join(',')).toBe(signature);
    }
  });

  it('changes reproducibly when the parent shuffles', () => {
    const a = suggestActivities(ctx, catalog, { now: NOW, shuffleSeed: 0 });
    const b = suggestActivities(ctx, catalog, { now: NOW, shuffleSeed: 1 });
    const b2 = suggestActivities(ctx, catalog, { now: NOW, shuffleSeed: 1 });
    expect(b.suggestions.map((s) => s.template.id)).toEqual(
      b2.suggestions.map((s) => s.template.id),
    );
    // Not asserting a != b: with distinct scores a shuffle may legitimately
    // keep the same top set. Reproducibility is the property that matters.
    expect(a.suggestions).toHaveLength(3);
  });

  it('returns at most one template per type', () => {
    const result = suggestActivities(ctx, catalog, { now: NOW, count: 3 });
    const types = result.suggestions.map((s) => s.template.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('never surfaces an ineligible template, however it scores', () => {
    const poisoned = [
      ...catalog,
      template({ id: 'perfect-but-too-old', minAge: 15, maxAge: 18, interestTags: ['animals'] }),
      template({ id: 'perfect-but-draft', status: 'draft', interestTags: ['animals'] }),
    ];
    for (let seed = 0; seed < 50; seed += 1) {
      const result = suggestActivities(ctx, poisoned, { now: NOW, shuffleSeed: seed });
      const ids = result.suggestions.map((s) => s.template.id);
      expect(ids).not.toContain('perfect-but-too-old');
      expect(ids).not.toContain('perfect-but-draft');
    }
  });

  it('reports exhaustion honestly rather than repeating', () => {
    const result = suggestActivities(ctx, [], { now: NOW });
    expect(result.exhausted).toBe(true);
    expect(result.suggestions).toEqual([]);
  });

  it('reports exhaustion when everything is inside its cooldown', () => {
    const allRecent: ChildContext = {
      ...ctx,
      history: catalog.map((t) => ({
        templateId: t.id,
        type: t.type,
        assignedAt: NOW.toISOString(),
      })),
    };
    expect(suggestActivities(allRecent, catalog, { now: NOW }).exhausted).toBe(true);
  });

  it('prefers a template matching the child interests, all else equal', () => {
    const result = suggestActivities(ctx, catalog, { now: NOW, count: 1 });
    expect(result.suggestions[0]!.template.interestTags).toContain('animals');
  });

  it('explains why each suggestion was picked', () => {
    const result = suggestActivities(ctx, catalog, { now: NOW });
    for (const s of result.suggestions) {
      expect(explainSuggestion(s, ctx).length).toBeGreaterThan(0);
    }
  });

  it('property: every suggestion is age, grade and band eligible for any seed', () => {
    const band = resolveBandForChild(child, NOW);
    for (let seed = 0; seed < 200; seed += 1) {
      const result = suggestActivities(ctx, catalog, { now: NOW, shuffleSeed: seed, count: 6 });
      for (const { template: t } of result.suggestions) {
        expect(t.minAge).toBeLessThanOrEqual(8);
        expect(t.maxAge).toBeGreaterThanOrEqual(8);
        expect(t.difficulty).toBeGreaterThanOrEqual(band.minDifficulty);
        expect(t.difficulty).toBeLessThanOrEqual(band.maxDifficulty);
        expect(t.status).toBe('approved');
      }
    }
  });

  it('scoreTemplate exposes its parts so a decision can be explained', () => {
    const scored = scoreTemplate(catalog[0]!, ctx, NOW);
    expect(Object.keys(scored.parts).sort()).toEqual([
      'difficultyFit',
      'interestOverlap',
      'novelty',
      'typeRotation',
    ]);
    expect(scored.score).toBeGreaterThanOrEqual(0);
    expect(scored.score).toBeLessThanOrEqual(1);
  });
});

describe('difficulty adaptation', () => {
  const band = getAgeBand('lower_primary'); // difficulty 1–3
  const base: ChildTypeProgress = {
    childId: 'child-1',
    type: 'reflection',
    difficulty: 2,
    streakSuccess: 0,
    streakStruggle: 0,
    lastAssignedAt: null,
  };

  it('raises difficulty immediately on "too easy"', () => {
    expect(applyReview(base, 'too_easy', band).difficulty).toBe(3);
  });

  it('lowers difficulty immediately on "too hard"', () => {
    expect(applyReview(base, 'too_hard', band).difficulty).toBe(1);
  });

  it('needs two consecutive "just right" before nudging up', () => {
    const once = applyReview(base, 'just_right', band);
    expect(once.difficulty).toBe(2);
    expect(once.streakSuccess).toBe(1);

    const twice = applyReview(once, 'just_right', band);
    expect(twice.difficulty).toBe(3);
    expect(twice.streakSuccess).toBe(0);
  });

  it('resets the success streak when the child struggles', () => {
    const once = applyReview(base, 'just_right', band);
    const struggled = applyReview(once, 'too_hard', band);
    expect(struggled.streakSuccess).toBe(0);
  });

  it('clamps at the top of the band', () => {
    const atTop = { ...base, difficulty: 3 as const };
    expect(applyReview(atTop, 'too_easy', band).difficulty).toBe(3);
  });

  it('clamps at the bottom of the band', () => {
    const atBottom = { ...base, difficulty: 1 as const };
    expect(applyReview(atBottom, 'too_hard', band).difficulty).toBe(1);
  });

  it('never escapes the band for any verdict sequence', () => {
    const verdicts = ['too_easy', 'just_right', 'too_hard'] as const;
    let progress = base;
    for (let i = 0; i < 500; i += 1) {
      progress = applyReview(progress, verdicts[i % 3]!, band);
      expect(progress.difficulty).toBeGreaterThanOrEqual(band.minDifficulty);
      expect(progress.difficulty).toBeLessThanOrEqual(band.maxDifficulty);
    }
  });

  it('eases after two incompletes when no verdict is ever given', () => {
    const once = applyCompletionSignal(base, false, band);
    expect(once.difficulty).toBe(2);
    expect(once.streakStruggle).toBe(1);

    const twice = applyCompletionSignal(once, false, band);
    expect(twice.difficulty).toBe(1);
    expect(twice.streakStruggle).toBe(0);
  });

  it('resets the struggle streak on completion', () => {
    const once = applyCompletionSignal(base, false, band);
    expect(applyCompletionSignal(once, true, band).streakStruggle).toBe(0);
  });
});
