import { describe, it, expect } from 'vitest';
import {
  assertAssignable,
  isAssignable,
  NotAssignableError,
} from '@/lib/domain/activity/assignable';
import { activitySchema, type Activity } from '@/lib/domain/activity/schema';
import { reflectionFixture } from '@/tests/fixtures/activities';

const PARENT = 'parent-abc';
const ctx = { actingParentId: PARENT };
const approved = activitySchema.parse(reflectionFixture);

describe('assertAssignable is a RUNTIME guard, not a type guard', () => {
  it('accepts approved seed content', () => {
    expect(() => assertAssignable(approved, ctx)).not.toThrow();
  });

  it('rejects content that is not approved', () => {
    for (const status of ['draft', 'in_review', 'archived']) {
      const candidate = { ...structuredClone(approved), status };
      expect(() => assertAssignable(candidate, ctx)).toThrow(NotAssignableError);
    }
  });

  /**
   * The point of these tests: the objects are cast PAST the compiler, exactly
   * as a value from JSON.parse or a raw SQL row would arrive. If the guard
   * relied on types, every one of these would slip through.
   */
  it('rejects AI content with no approving parent, cast past the type system', () => {
    const smuggled = {
      ...structuredClone(approved),
      provenance: {
        source: 'ai',
        model: 'm',
        promptTemplateId: 't',
        promptTemplateVersion: '1',
        generatedAt: '2026-08-26T00:00:00Z',
      },
    } as unknown as Activity;

    expect(() => assertAssignable(smuggled, ctx)).toThrow(/requires an explicit parent approval/);
  });

  it('rejects AI content approved by a DIFFERENT parent', () => {
    const otherParents = {
      ...structuredClone(approved),
      provenance: {
        source: 'ai',
        model: 'm',
        promptTemplateId: 't',
        promptTemplateVersion: '1',
        generatedAt: '2026-08-26T00:00:00Z',
        approvedByParentId: 'someone-else',
        approvedAt: '2026-08-26T00:00:00Z',
      },
    } as unknown as Activity;

    expect(() => assertAssignable(otherParents, ctx)).toThrow(/only be assigned by the parent/);
  });

  it('accepts AI content the acting parent approved', () => {
    const mine = {
      ...structuredClone(approved),
      provenance: {
        source: 'ai',
        model: 'm',
        promptTemplateId: 't',
        promptTemplateVersion: '1',
        generatedAt: '2026-08-26T00:00:00Z',
        approvedByParentId: PARENT,
        approvedAt: '2026-08-26T00:00:00Z',
      },
    } as unknown as Activity;

    expect(() => assertAssignable(mine, ctx)).not.toThrow();
  });

  it('rejects an activity with no human reviewer', () => {
    const unreviewed = structuredClone(approved) as unknown as {
      safety: { reviewedBy: string };
    };
    unreviewed.safety.reviewedBy = '';
    expect(() => assertAssignable(unreviewed, ctx)).toThrow(/human reviewer/);
  });

  it('rejects an unknown provenance source', () => {
    const weird = {
      ...structuredClone(approved),
      provenance: { source: 'scraped-from-the-web' },
    } as unknown as Activity;
    expect(() => assertAssignable(weird, ctx)).toThrow(/Unknown content source/);
  });

  it('rejects raw JSON that never went through zod at all', () => {
    // Simulates a row read straight from the database and handed on.
    const fromJson = JSON.parse(
      JSON.stringify({
        status: 'approved',
        provenance: { source: 'ai' },
        safety: { reviewedBy: 'x' },
      }),
    );
    expect(() => assertAssignable(fromJson, ctx)).toThrow(NotAssignableError);
  });

  it.each([null, undefined, 42, 'approved', []])('rejects the non-object %s', (input) => {
    expect(() => assertAssignable(input, ctx)).toThrow(NotAssignableError);
  });

  it('names the rule that failed, so a caller can log it', () => {
    try {
      assertAssignable({ ...structuredClone(approved), status: 'draft' }, ctx);
      expect.unreachable();
    } catch (error) {
      expect((error as NotAssignableError).rule).toBe('status_not_approved');
    }
  });
});

describe('isAssignable', () => {
  it('mirrors assertAssignable without throwing', () => {
    expect(isAssignable(approved, ctx)).toBe(true);
    expect(isAssignable({ ...structuredClone(approved), status: 'draft' }, ctx)).toBe(false);
  });
});
