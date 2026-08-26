import { describe, it, expect } from 'vitest';
import { activitySchema } from '@/lib/domain/activity/schema';
import { validateAnswers, autoScore, encouragementFor } from '@/lib/domain/activity/submission';
import {
  comprehensionFixture,
  reflectionFixture,
  situationFixture,
  drawingFixture,
} from '@/tests/fixtures/activities';

const comprehension = activitySchema.parse(comprehensionFixture);
const reflection = activitySchema.parse(reflectionFixture);
const situation = activitySchema.parse(situationFixture);
const drawing = activitySchema.parse(drawingFixture);

describe('autoScore', () => {
  it('scores multiple choice against the stored answer key', () => {
    const score = autoScore(comprehension, { text: {}, choice: { q1: 'a' } });
    expect(score).toEqual({ correct: 1, total: 1, perQuestion: { q1: true } });
  });

  it('marks a wrong choice without throwing', () => {
    const score = autoScore(comprehension, { text: {}, choice: { q1: 'b' } });
    expect(score?.correct).toBe(0);
    expect(score?.perQuestion.q1).toBe(false);
  });

  it('treats an unanswered question as incorrect, not as an error', () => {
    expect(autoScore(comprehension, { text: {}, choice: {} })?.correct).toBe(0);
  });

  it('returns null — not zero — when there is no choice component', () => {
    expect(autoScore(reflection, { text: {}, choice: {} })).toBeNull();
    expect(autoScore(drawing, { text: {}, choice: {} })).toBeNull();
  });

  it('never scores free text', () => {
    const score = autoScore(comprehension, {
      text: { q2: 'một câu trả lời rất hay' },
      choice: { q1: 'a' },
    });
    // q2 is a short_text question and must not appear in the score at all.
    expect(Object.keys(score!.perQuestion)).toEqual(['q1']);
    expect(score!.total).toBe(1);
  });

  it('cannot be influenced by a client-supplied answer key', () => {
    const tampered = { text: {}, choice: { q1: 'b' }, answerKey: 'b' } as unknown;
    const score = autoScore(comprehension, tampered as never);
    expect(score?.correct).toBe(0);
  });
});

describe('validateAnswers', () => {
  it('accepts a well-formed submission', () => {
    const result = validateAnswers(comprehension, {
      text: { q2: 'chú ra sân' },
      choice: { q1: 'a' },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects a choice that is not one of the options', () => {
    const result = validateAnswers(comprehension, { text: {}, choice: { q1: 'zzz' } });
    expect(result.ok).toBe(false);
  });

  it('rejects an answer to a question that does not exist', () => {
    const result = validateAnswers(comprehension, { text: {}, choice: { 'made-up': 'a' } });
    expect(result.ok).toBe(false);
  });

  it('enforces the word limit server-side, not just in the UI', () => {
    const tooLong = Array.from({ length: 60 }, () => 'từ').join(' ');
    const result = validateAnswers(reflection, { text: { q1: tooLong }, choice: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/dài quá/);
  });

  it('accepts an answer at exactly the limit', () => {
    const exact = Array.from({ length: 30 }, () => 'từ').join(' ');
    expect(validateAnswers(reflection, { text: { q1: exact }, choice: {} }).ok).toBe(true);
  });

  it('rejects an invalid situation option', () => {
    expect(validateAnswers(situation, { text: {}, choice: { situation: 'nope' } }).ok).toBe(false);
    expect(validateAnswers(situation, { text: {}, choice: { situation: 'a' } }).ok).toBe(true);
  });

  it('rejects a malformed payload outright', () => {
    expect(validateAnswers(reflection, 'not an object').ok).toBe(false);
    expect(validateAnswers(reflection, { text: { q1: 123 }, choice: {} }).ok).toBe(false);
  });
});

describe('encouragementFor', () => {
  it('never shows the child a score', () => {
    for (const score of [
      null,
      { correct: 0, total: 3, perQuestion: {} },
      { correct: 3, total: 3, perQuestion: {} },
    ]) {
      const message = encouragementFor(score);
      expect(message).not.toMatch(/\d/);
      expect(message.length).toBeGreaterThan(0);
    }
  });
});
