import { describe, it, expect } from 'vitest';
import {
  buildProgressSummary,
  buildWeeklySummary,
  describeWeek,
  type SummaryInput,
} from '@/lib/domain/engine/summary';
import { ACTIVITY_TYPES, type Difficulty } from '@/lib/domain/entities';

const NOW = new Date('2026-08-26T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const entries: SummaryInput[] = [
  { assignedAt: daysAgo(1), type: 'reflection', status: 'reviewed', verdict: 'just_right' },
  { assignedAt: daysAgo(2), type: 'reflection', status: 'submitted', verdict: null },
  { assignedAt: daysAgo(3), type: 'handwriting', status: 'reviewed', verdict: 'too_hard' },
  { assignedAt: daysAgo(4), type: 'handwriting', status: 'assigned', verdict: null },
  { assignedAt: daysAgo(30), type: 'drawing_prompt', status: 'reviewed', verdict: 'too_easy' },
];

const typeDifficulty = ACTIVITY_TYPES.map((type, index) => ({
  type,
  difficulty: ((index % 3) + 1) as Difficulty,
}));

describe('buildProgressSummary', () => {
  it('builds a complete six-type factual summary for seven days', () => {
    const summary = buildProgressSummary({
      entries,
      allTypes: ACTIVITY_TYPES,
      typeDifficulty,
      now: NOW,
      windowDays: 7,
    });

    expect(summary.windowDays).toBe(7);
    expect(summary.assigned).toBe(4);
    expect(summary.completed).toBe(3);
    expect(summary.completionRate).toBe(3 / 4);
    expect(summary.awaitingReview).toBe(1);
    expect(summary.byType).toEqual({
      handwriting: 2,
      drawing_prompt: 0,
      story_comprehension: 0,
      story_summary: 0,
      reflection: 2,
      situation_judgment: 0,
    });
    expect(Object.keys(summary.difficultyByType)).toHaveLength(6);
    expect(summary.difficultyByType.handwriting).toBe(1);
  });

  it('includes the exact 30-day boundary in a 30-day window', () => {
    const summary = buildProgressSummary({
      entries,
      allTypes: ACTIVITY_TYPES,
      typeDifficulty,
      now: NOW,
      windowDays: 30,
    });

    expect(summary.assigned).toBe(5);
    expect(summary.byType.drawing_prompt).toBe(1);
  });

  it('ignores invalid timestamps instead of treating them as current activity', () => {
    const summary = buildProgressSummary({
      entries: [
        ...entries,
        { assignedAt: 'not a date', type: 'story_summary', status: 'reviewed', verdict: null },
      ],
      allTypes: ACTIVITY_TYPES,
      typeDifficulty,
      now: NOW,
      windowDays: 7,
    });

    expect(summary.assigned).toBe(4);
    expect(summary.byType.story_summary).toBe(0);
  });

  it('uses null rather than zero for completion rate when nothing was assigned', () => {
    const summary = buildProgressSummary({
      entries: [],
      allTypes: ACTIVITY_TYPES,
      typeDifficulty,
      now: NOW,
      windowDays: 7,
    });

    expect(summary.assigned).toBe(0);
    expect(summary.completed).toBe(0);
    expect(summary.completionRate).toBeNull();
    expect(summary.insights).toEqual([]);
  });

  it('counts only submitted work as awaiting parent review', () => {
    const summary = buildProgressSummary({
      entries: [
        { assignedAt: daysAgo(1), type: 'reflection', status: 'submitted', verdict: null },
        { assignedAt: daysAgo(1), type: 'handwriting', status: 'reviewed', verdict: 'just_right' },
        { assignedAt: daysAgo(1), type: 'drawing_prompt', status: 'in_progress', verdict: null },
      ],
      allTypes: ACTIVITY_TYPES,
      typeDifficulty,
      now: NOW,
      windowDays: 7,
    });

    expect(summary.awaitingReview).toBe(1);
    expect(summary.completed).toBe(2);
  });

  it('returns deterministic insight ids in priority order and caps them at three', () => {
    const summary = buildProgressSummary({
      entries,
      allTypes: ACTIVITY_TYPES,
      typeDifficulty,
      now: NOW,
      windowDays: 7,
    });

    expect(summary.insights).toEqual([
      { id: 'awaiting_review', count: 1 },
      { id: 'untouched_type', type: 'drawing_prompt', windowDays: 7 },
      { id: 'dominant_type', type: 'handwriting', count: 2 },
    ]);
    expect(summary.insights).toHaveLength(3);
  });

  it('does not emit a dominant type when the highest count is tied', () => {
    const summary = buildProgressSummary({
      entries: [
        { assignedAt: daysAgo(1), type: 'reflection', status: 'reviewed', verdict: null },
        { assignedAt: daysAgo(2), type: 'handwriting', status: 'reviewed', verdict: null },
      ],
      allTypes: ACTIVITY_TYPES,
      typeDifficulty,
      now: NOW,
      windowDays: 7,
    });

    expect(summary.insights.some((insight) => insight.id === 'dominant_type')).toBe(false);
  });

  it('fails loudly when the six per-type difficulty rows are incomplete', () => {
    expect(() =>
      buildProgressSummary({
        entries,
        allTypes: ACTIVITY_TYPES,
        typeDifficulty: typeDifficulty.slice(0, 5),
        now: NOW,
        windowDays: 7,
      }),
    ).toThrow(/difficulty/i);
  });

  it('fails loudly when a per-type difficulty row is duplicated', () => {
    expect(() =>
      buildProgressSummary({
        entries,
        allTypes: ACTIVITY_TYPES,
        typeDifficulty: [...typeDifficulty, typeDifficulty[0]!],
        now: NOW,
        windowDays: 7,
      }),
    ).toThrow(/difficulty/i);
  });

  it('returns typed facts and rule ids, not free-form judgement prose', () => {
    const summary = buildProgressSummary({
      entries,
      allTypes: ACTIVITY_TYPES,
      typeDifficulty,
      now: NOW,
      windowDays: 7,
    });

    const serialised = JSON.stringify(summary.insights);
    for (const judgement of ['giỏi', 'kém', 'yếu', 'tiến bộ', 'thụt lùi', 'thông minh']) {
      expect(serialised).not.toContain(judgement);
    }
  });
});

describe('buildWeeklySummary compatibility', () => {
  const summary = buildWeeklySummary(entries, ACTIVITY_TYPES, NOW);

  it('counts only the window', () => {
    expect(summary.assigned).toBe(4);
    expect(summary.byType.drawing_prompt).toBeUndefined();
  });

  it('counts completion as submitted or reviewed', () => {
    expect(summary.completed).toBe(3);
  });

  it('counts what is still waiting on the parent', () => {
    expect(summary.awaitingReview).toBe(1);
  });

  it("counts the parent's own verdicts back", () => {
    expect(summary.verdicts).toEqual({ just_right: 1, too_hard: 1, too_easy: 0 });
  });

  it('lists types the week did not touch', () => {
    expect(summary.untouchedTypes).toContain('story_comprehension');
    expect(summary.untouchedTypes).not.toContain('reflection');
  });

  it('handles an empty week without dividing by zero', () => {
    const empty = buildWeeklySummary([], ACTIVITY_TYPES, NOW);
    expect(empty.assigned).toBe(0);
    expect(empty.untouchedTypes).toHaveLength(6);
  });

  it('ignores unparseable timestamps rather than throwing', () => {
    const bad = buildWeeklySummary(
      [{ assignedAt: 'not a date', type: 'reflection', status: 'reviewed', verdict: null }],
      ACTIVITY_TYPES,
      NOW,
    );
    expect(bad.assigned).toBe(0);
  });
});

/**
 * The legacy weekly prose remains temporarily while the existing history page
 * is migrated in Task 3. The final Phase 10 state removes user-facing prose
 * from the pure domain module.
 */
describe('legacy weekly prose remains non-evaluative during migration', () => {
  const summary = buildWeeklySummary(entries, ACTIVITY_TYPES, NOW);

  it('describes the week in plain counts, with no judgement words', () => {
    const text = describeWeek(summary);
    for (const judgement of ['giỏi', 'kém', 'yếu', 'tiến bộ', 'thụt lùi', 'trung bình']) {
      expect(text, `"${judgement}" is an assessment of the child`).not.toContain(judgement);
    }
    expect(text).toContain('4 hoạt động');
  });
});
