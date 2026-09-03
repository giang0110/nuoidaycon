/**
 * Product metrics.
 *
 * The safety policy bans third-party behavioural-analytics SDKs (S5), which is
 * right — and left the product with no way to tell whether anyone comes back.
 * These aggregates are computed from rows the product already writes, so the
 * ban costs nothing.
 *
 * The aggregation is pure and lives in lib/domain so it can be tested against
 * fixed clocks instead of "whatever the database said today".
 */
import { describe, it, expect } from 'vitest';
import { summariseProduct } from '@/lib/domain/metrics/product';
import type { MetricsInput } from '@/lib/domain/metrics/product';

const NOW = new Date('2026-09-03T00:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function input(overrides: Partial<MetricsInput> = {}): MetricsInput {
  return { families: [], children: [], assignments: [], ...overrides };
}

describe('active families', () => {
  it('counts a family active when one of its children was assigned work recently', () => {
    const report = summariseProduct(
      input({
        families: [{ parentId: 'p1', createdAt: daysAgo(30) }],
        children: [{ childId: 'c1', parentId: 'p1', ageBand: 'early' }],
        assignments: [{ childId: 'c1', assignedAt: daysAgo(2), status: 'submitted' }],
      }),
      NOW,
    );

    expect(report.familiesTotal).toBe(1);
    expect(report.activeFamilies7d).toBe(1);
    expect(report.activeFamilies28d).toBe(1);
  });

  it('does not count a family whose last activity is outside the window', () => {
    const report = summariseProduct(
      input({
        families: [{ parentId: 'p1', createdAt: daysAgo(60) }],
        children: [{ childId: 'c1', parentId: 'p1', ageBand: 'early' }],
        assignments: [{ childId: 'c1', assignedAt: daysAgo(40), status: 'submitted' }],
      }),
      NOW,
    );

    expect(report.familiesTotal).toBe(1);
    expect(report.activeFamilies7d).toBe(0);
    expect(report.activeFamilies28d).toBe(0);
  });

  it('counts a family once however many assignments it has', () => {
    const report = summariseProduct(
      input({
        families: [{ parentId: 'p1', createdAt: daysAgo(10) }],
        children: [{ childId: 'c1', parentId: 'p1', ageBand: 'early' }],
        assignments: [1, 2, 3].map(() => ({
          childId: 'c1',
          assignedAt: daysAgo(1),
          status: 'submitted' as const,
        })),
      }),
      NOW,
    );
    expect(report.activeFamilies7d).toBe(1);
  });
});

describe('completion rate', () => {
  it('is the share of assignments the child actually finished', () => {
    const report = summariseProduct(
      input({
        families: [{ parentId: 'p1', createdAt: daysAgo(10) }],
        children: [{ childId: 'c1', parentId: 'p1', ageBand: 'early' }],
        assignments: [
          { childId: 'c1', assignedAt: daysAgo(3), status: 'submitted' },
          { childId: 'c1', assignedAt: daysAgo(3), status: 'reviewed' },
          { childId: 'c1', assignedAt: daysAgo(3), status: 'assigned' },
          { childId: 'c1', assignedAt: daysAgo(3), status: 'skipped' },
        ],
      }),
      NOW,
    );
    expect(report.completionRate).toBeCloseTo(0.5);
  });

  it('is null rather than zero when nothing has been assigned', () => {
    // Zero would read as "everybody abandons"; null reads as "no data yet".
    expect(summariseProduct(input(), NOW).completionRate).toBeNull();
  });
});

describe('returning after week one — the number that decides the product', () => {
  it('counts a family that came back at all after its first week', () => {
    const report = summariseProduct(
      input({
        families: [
          { parentId: 'stayed', createdAt: daysAgo(30) },
          { parentId: 'left', createdAt: daysAgo(30) },
        ],
        children: [
          { childId: 'c1', parentId: 'stayed', ageBand: 'early' },
          { childId: 'c2', parentId: 'left', ageBand: 'early' },
        ],
        assignments: [
          { childId: 'c1', assignedAt: daysAgo(29), status: 'submitted' },
          { childId: 'c1', assignedAt: daysAgo(10), status: 'submitted' },
          // 'left' only ever used it in week one.
          { childId: 'c2', assignedAt: daysAgo(29), status: 'submitted' },
        ],
      }),
      NOW,
    );

    expect(report.returnedAfterFirstWeek).toBeCloseTo(0.5);
  });

  it('excludes families too new to judge, rather than scoring them as churned', () => {
    const report = summariseProduct(
      input({
        families: [{ parentId: 'brand-new', createdAt: daysAgo(3) }],
        children: [{ childId: 'c1', parentId: 'brand-new', ageBand: 'early' }],
        assignments: [{ childId: 'c1', assignedAt: daysAgo(1), status: 'submitted' }],
      }),
      NOW,
    );
    // Judging them now would report a failure that has not had time to happen.
    expect(report.returnedAfterFirstWeek).toBeNull();
  });
});

describe('library exhaustion — the risk this product actually carries', () => {
  it('reports the share of a band a child has already been given', () => {
    const report = summariseProduct(
      input({
        families: [{ parentId: 'p1', createdAt: daysAgo(20) }],
        children: [{ childId: 'c1', parentId: 'p1', ageBand: 'early' }],
        assignments: [1, 2, 3].map(() => ({
          childId: 'c1',
          assignedAt: daysAgo(2),
          status: 'submitted' as const,
        })),
      }),
      NOW,
      { early: 4, lower_primary: 10, upper_primary: 5, preteen: 3 },
    );

    // 3 of the 4 activities available to a 5-year-old.
    expect(report.exhaustion[0]?.childId).toBe('c1');
    expect(report.exhaustion[0]?.share).toBeCloseTo(0.75);
  });

  it('flags children who have seen almost everything their age offers', () => {
    const report = summariseProduct(
      input({
        families: [{ parentId: 'p1', createdAt: daysAgo(20) }],
        children: [{ childId: 'c1', parentId: 'p1', ageBand: 'preteen' }],
        assignments: [1, 2, 3].map(() => ({
          childId: 'c1',
          assignedAt: daysAgo(2),
          status: 'submitted' as const,
        })),
      }),
      NOW,
      { early: 4, lower_primary: 10, upper_primary: 5, preteen: 3 },
    );

    expect(report.childrenNearingExhaustion).toBe(1);
  });

  it('does not divide by zero for a band with no content', () => {
    const report = summariseProduct(
      input({
        families: [{ parentId: 'p1', createdAt: daysAgo(20) }],
        children: [{ childId: 'c1', parentId: 'p1', ageBand: 'preteen' }],
        assignments: [{ childId: 'c1', assignedAt: daysAgo(2), status: 'submitted' }],
      }),
      NOW,
      { early: 4, lower_primary: 10, upper_primary: 5, preteen: 0 },
    );
    expect(report.exhaustion[0]?.share).toBeNull();
  });
});

describe('the report carries no personal data', () => {
  it('contains no name, email or date of birth', () => {
    const report = summariseProduct(
      input({
        families: [{ parentId: 'p1', createdAt: daysAgo(20) }],
        children: [{ childId: 'c1', parentId: 'p1', ageBand: 'early' }],
        assignments: [{ childId: 'c1', assignedAt: daysAgo(1), status: 'submitted' }],
      }),
      NOW,
    );

    const serialised = JSON.stringify(report);
    for (const forbidden of ['@', 'displayName', 'birthYear', 'birthMonth', 'email']) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});
