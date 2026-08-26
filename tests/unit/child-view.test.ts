import { describe, it, expect } from 'vitest';
import { activitySchema } from '@/lib/domain/activity/schema';
import { toChildView, feedbackForChoice } from '@/lib/domain/activity/child-view';
import { collectStrings } from '@/lib/domain/safety/detectors';
import {
  ALL_FIXTURES,
  comprehensionFixture,
  situationFixture,
  summaryFixture,
} from '@/tests/fixtures/activities';

const parse = (input: unknown) => activitySchema.parse(input);

/** Keys that must never appear anywhere in a child-facing payload. */
const FORBIDDEN_KEYS = [
  'answerKey',
  'rationale',
  'exemplarAnswer',
  'mustMention',
  'isConstructive',
  'feedback',
  'parentNote',
  'safety',
  'provenance',
  'status',
  'audience',
];

function allKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      allKeys(v, out);
    }
  }
  return out;
}

describe('toChildView strips every parent-only field', () => {
  it.each(ALL_FIXTURES.map((f) => [f.type, f] as const))(
    'removes them from a %s activity',
    (_type, fixture) => {
      const view = toChildView(parse(fixture));
      const keys = allKeys(view);
      for (const forbidden of FORBIDDEN_KEYS) {
        expect(keys, `${forbidden} leaked into the child view`).not.toContain(forbidden);
      }
    },
  );

  it('never serialises an answer key value, even as a bare string', () => {
    const activity = parse(comprehensionFixture);
    const view = toChildView(activity);
    const serialised = JSON.stringify(view);

    // The rationale and exemplar text must be absent verbatim.
    expect(serialised).not.toContain('Câu đầu tiên của truyện');
    expect(serialised).not.toContain('Chú ra sân phơi nắng.');
  });

  it('keeps what the child legitimately needs', () => {
    const view = toChildView(parse(comprehensionFixture));
    expect(view.title).toBe('Hoạt động mẫu');
    expect(view.instructions.length).toBeGreaterThan(0);
    if (view.type === 'story_comprehension') {
      expect(view.payload.story.paragraphs.length).toBeGreaterThan(0);
      expect(view.payload.questions).toHaveLength(2);
      const mc = view.payload.questions.find((q) => q.kind === 'multiple_choice');
      expect(mc && 'choices' in mc ? mc.choices.length : 0).toBe(2);
    }
  });

  it('keeps the trusted-adult path visible to the child', () => {
    const view = toChildView(parse(situationFixture));
    if (view.type === 'situation_judgment') {
      expect(view.payload.trustedAdultPath.present).toBe(true);
      expect(view.payload.trustedAdultPath.text.length).toBeGreaterThan(0);
    }
  });

  it('withholds option feedback until the child has chosen', () => {
    const view = toChildView(parse(situationFixture));
    const serialised = JSON.stringify(view);
    expect(serialised).not.toContain('Rủ bạn cùng chơi là một cách rất ấm áp');
    if (view.type === 'situation_judgment') {
      expect(view.payload.options?.every((o) => !('feedback' in o))).toBe(true);
      expect(view.payload.options?.every((o) => !('isConstructive' in o))).toBe(true);
    }
  });

  it('drops the parent-facing mustMention checklist from a summary', () => {
    const view = toChildView(parse(summaryFixture));
    if (view.type === 'story_summary') {
      // Asserted structurally, not by substring: mustMention lists phrases
      // FROM the story, which the child legitimately reads. The leak that
      // matters is the checklist itself telling them what to write.
      expect(view.payload.guidance).not.toHaveProperty('mustMention');
      expect(Object.keys(view.payload.guidance).sort()).toEqual([
        'maxWords',
        'minWords',
        'promptHints',
      ]);
      expect(view.payload.guidance.promptHints.length).toBeGreaterThan(0);
    }
  });

  it('finds no parent-only string anywhere in any child view', () => {
    for (const fixture of ALL_FIXTURES) {
      const activity = parse(fixture);
      const view = toChildView(activity);
      const viewStrings = collectStrings(view).map(([, s]) => s);
      // parentNote is optional in fixtures; the structural key check above
      // covers it. Here we assert on rationale/exemplar text specifically.
      if (activity.type === 'story_comprehension') {
        for (const q of activity.payload.questions) {
          if (q.kind === 'multiple_choice') expect(viewStrings).not.toContain(q.rationale);
          else expect(viewStrings).not.toContain(q.exemplarAnswer);
        }
      }
    }
  });
});

describe('feedbackForChoice resolves server-side', () => {
  it('returns the feedback for the option the child chose', () => {
    const activity = parse(situationFixture);
    expect(feedbackForChoice(activity, 'a')).toMatch(/ấm áp/);
    expect(feedbackForChoice(activity, 'b')).toMatch(/lạc lõng/);
  });

  it('returns null for an unknown option or a non-situation activity', () => {
    expect(feedbackForChoice(parse(situationFixture), 'zzz')).toBeNull();
    expect(feedbackForChoice(parse(comprehensionFixture), 'a')).toBeNull();
  });
});
