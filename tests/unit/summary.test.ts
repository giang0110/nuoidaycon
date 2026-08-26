import { describe, it, expect } from 'vitest';
import { buildWeeklySummary, describeWeek, type SummaryInput } from '@/lib/domain/engine/summary';
import { ACTIVITY_TYPES } from '@/lib/domain/entities';

const NOW = new Date('2026-08-26T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const entries: SummaryInput[] = [
  { assignedAt: daysAgo(1), type: 'reflection', status: 'reviewed', verdict: 'just_right' },
  { assignedAt: daysAgo(2), type: 'reflection', status: 'submitted', verdict: null },
  { assignedAt: daysAgo(3), type: 'handwriting', status: 'reviewed', verdict: 'too_hard' },
  { assignedAt: daysAgo(4), type: 'handwriting', status: 'assigned', verdict: null },
  { assignedAt: daysAgo(30), type: 'drawing_prompt', status: 'reviewed', verdict: 'too_easy' },
];

describe('buildWeeklySummary', () => {
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
 * The constraint that matters most in this module: it describes a WEEK, never
 * a child. No IQ, EQ, clinical, developmental or personality inference, and no
 * comparison between children.
 */
describe('the summary makes no assessment of the child', () => {
  const summary = buildWeeklySummary(entries, ACTIVITY_TYPES, NOW);

  it('exposes only counts and the parent own verdicts', () => {
    expect(Object.keys(summary).sort()).toEqual([
      'assigned',
      'awaitingReview',
      'byType',
      'completed',
      'untouchedTypes',
      'verdicts',
      'windowDays',
    ]);
  });

  it('has no field that could be read as a score about the child', () => {
    const forbidden =
      /\b(iq|eq|score|grade|rating|percentile|rank|level|ability|talent|personality|diagnos)/i;
    for (const key of Object.keys(summary)) {
      expect(key, `"${key}" reads as an assessment`).not.toMatch(forbidden);
    }
  });

  it('never compares one child to another — it takes one child at a time', () => {
    // The signature accepts a flat list for a single child; there is no
    // cohort, no peer set, and nothing to rank against.
    expect(buildWeeklySummary.length).toBeLessThanOrEqual(4);
  });

  it('describes the week in plain counts, with no judgement words', () => {
    const text = describeWeek(summary);
    for (const judgement of ['giỏi', 'kém', 'yếu', 'tiến bộ', 'thụt lùi', 'trung bình']) {
      expect(text, `"${judgement}" is an assessment of the child`).not.toContain(judgement);
    }
    expect(text).toContain('4 hoạt động');
  });

  it('says something neutral when nothing was assigned', () => {
    const text = describeWeek(buildWeeklySummary([], ACTIVITY_TYPES, NOW));
    expect(text).toMatch(/chưa có hoạt động nào/);
    expect(text).not.toMatch(/giỏi|kém/);
  });
});
