import { describe, it, expect } from 'vitest';
import { activitySchema } from '@/lib/domain/activity/schema';
import { validateActivity } from '@/lib/domain/activity/validate';
import {
  ALL_FIXTURES,
  reflectionFixture,
  comprehensionFixture,
  situationFixture,
  handwritingFixture,
} from '@/tests/fixtures/activities';

const clone = <T>(v: T): T => structuredClone(v);

describe('L1 — structural validation', () => {
  it('accepts every fixture, covering all six activity types', () => {
    const types = new Set<string>();
    for (const fixture of ALL_FIXTURES) {
      const result = activitySchema.safeParse(fixture);
      expect(result.success, `${fixture.slug}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
      types.add(fixture.type);
    }
    expect(types.size).toBe(6);
  });

  it('rejects an unknown activity type', () => {
    const bad = { ...clone(reflectionFixture), type: 'mind_reading' };
    expect(activitySchema.safeParse(bad).success).toBe(false);
  });

  it('rejects difficulty outside 1–5', () => {
    for (const difficulty of [0, 6, -1]) {
      expect(activitySchema.safeParse({ ...clone(reflectionFixture), difficulty }).success).toBe(
        false,
      );
    }
  });

  it('requires a human reviewer on every activity', () => {
    const bad = clone(reflectionFixture);
    bad.safety = { ...bad.safety, reviewedBy: '' };
    expect(activitySchema.safeParse(bad).success).toBe(false);
  });

  it('requires printable.supported to be literally true — every activity prints (P7)', () => {
    const bad = clone(reflectionFixture) as unknown as { printable: { supported: boolean } };
    bad.printable.supported = false;
    expect(activitySchema.safeParse(bad).success).toBe(false);
  });
});

describe('AI provenance requires a parent approval at the schema layer', () => {
  it('rejects AI content with no approving parent', () => {
    const bad = clone(reflectionFixture) as unknown as { provenance: Record<string, unknown> };
    bad.provenance = {
      source: 'ai',
      model: 'some-model',
      promptTemplateId: 'reflection-v1',
      promptTemplateVersion: '1.0.0',
      generatedAt: '2026-08-26T00:00:00Z',
      // approvedByParentId deliberately missing
      approvedAt: '2026-08-26T00:00:00Z',
    };
    expect(activitySchema.safeParse(bad).success).toBe(false);
  });

  it('accepts AI content that a specific parent approved', () => {
    const ok = clone(reflectionFixture) as unknown as { provenance: Record<string, unknown> };
    ok.provenance = {
      source: 'ai',
      model: 'some-model',
      promptTemplateId: 'reflection-v1',
      promptTemplateVersion: '1.0.0',
      generatedAt: '2026-08-26T00:00:00Z',
      approvedByParentId: 'parent-1',
      approvedAt: '2026-08-26T00:00:00Z',
    };
    expect(activitySchema.safeParse(ok).success).toBe(true);
  });
});

describe('situation_judgment carries a trusted-adult path by construction', () => {
  it('cannot be parsed without one', () => {
    const bad = clone(situationFixture) as unknown as { payload: Record<string, unknown> };
    delete bad.payload.trustedAdultPath;
    expect(activitySchema.safeParse(bad).success).toBe(false);
  });

  it('rejects guided mode with fewer than two options', () => {
    const bad = clone(situationFixture) as unknown as {
      payload: { options: unknown[] };
    };
    bad.payload.options = [bad.payload.options[0]];
    expect(activitySchema.safeParse(bad).success).toBe(false);
  });

  it('requires at least one constructive option (L2)', () => {
    const bad = clone(situationFixture) as unknown as {
      payload: { options: { isConstructive: boolean }[] };
    };
    for (const option of bad.payload.options) option.isConstructive = false;
    const result = validateActivity(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.some((f) => f.rule === 'situation.no_constructive_option')).toBe(true);
    }
  });
});

describe('handwriting items are restricted to Vietnamese text', () => {
  it('accepts Vietnamese words with diacritics', () => {
    expect(activitySchema.safeParse(handwritingFixture).success).toBe(true);
  });

  it.each([
    ['a URL', 'https://example.com'],
    ['an email', 'me@example.com'],
    ['an at-handle', '@someone'],
  ])('rejects %s in the items a child must copy', (_label, item) => {
    const bad = clone(handwritingFixture) as unknown as { payload: { items: string[] } };
    bad.payload.items = [item];
    expect(activitySchema.safeParse(bad).success).toBe(false);
  });
});

describe('L2 — referential validation', () => {
  it('rejects an answer key that is not one of the choices', () => {
    const bad = clone(comprehensionFixture) as unknown as {
      payload: { questions: { answerKey?: string }[] };
    };
    bad.payload.questions[0]!.answerKey = 'does-not-exist';
    const result = validateActivity(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.some((f) => f.rule === 'question.answer_key_missing')).toBe(true);
    }
  });

  it('rejects difficulty outside the declared age band', () => {
    // lower_primary allows 1–3; 5 is out of range.
    const bad = { ...clone(reflectionFixture), difficulty: 5 };
    const result = validateActivity(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.some((f) => f.rule === 'difficulty.out_of_band')).toBe(true);
    }
  });

  it('rejects an audience wider than its declared band', () => {
    const bad = clone(reflectionFixture);
    bad.audience = { ...bad.audience, minAge: 4, maxAge: 12 };
    const result = validateActivity(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.some((f) => f.rule === 'audience.band_mismatch')).toBe(true);
    }
  });

  it('rejects a text answer longer than the band permits', () => {
    const bad = clone(reflectionFixture) as unknown as {
      response: { fields: { maxWords: number }[] };
    };
    bad.response.fields[0]!.maxWords = 300; // lower_primary caps at 40
    const result = validateActivity(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.some((f) => f.rule === 'response.answer_too_long')).toBe(true);
    }
  });

  it('rejects a response mode the band does not allow', () => {
    // `early` permits none/choice/photo only — no free text.
    const bad = clone(reflectionFixture);
    bad.safety = { ...bad.safety, ageBand: 'early' };
    bad.audience = { ...bad.audience, minAge: 5, maxAge: 6 };
    bad.difficulty = 1;
    const result = validateActivity(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.some((f) => f.rule === 'response.mode_not_allowed')).toBe(true);
    }
  });
});

describe('validateActivity composes all layers and fails closed', () => {
  it('passes clean fixtures', () => {
    for (const fixture of ALL_FIXTURES) {
      const result = validateActivity(fixture);
      expect(
        result.ok,
        `${fixture.slug}: ${result.ok ? '' : JSON.stringify(result.failures, null, 2)}`,
      ).toBe(true);
    }
  });

  it('rejects a non-object outright', () => {
    for (const input of [null, undefined, 42, 'text', []]) {
      expect(validateActivity(input).ok).toBe(false);
    }
  });

  it('reports the failing layer so an author knows where to look', () => {
    const result = validateActivity({ ...clone(reflectionFixture), difficulty: 99 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.every((f) => ['L1', 'L2', 'L3'].includes(f.layer))).toBe(true);
    }
  });
});
