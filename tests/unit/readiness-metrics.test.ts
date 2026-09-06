import { describe, expect, it } from 'vitest';
import { summariseProduct, type ProductReport } from '@/lib/domain/metrics/product';
import { metricsReadinessChecks } from '@/lib/domain/readiness/metrics';

function checkById(checks: ReturnType<typeof metricsReadinessChecks>, id: string) {
  const check = checks.find((item) => item.id === id);
  expect(check, `missing readiness check ${id}`).toBeDefined();
  return check!;
}

describe('metrics readiness semantics', () => {
  it('distinguishes zero families from zero-percent performance', () => {
    const product = summariseProduct(
      { families: [], children: [], assignments: [] },
      new Date('2026-09-06T00:00:00Z'),
      { early: 15, lower_primary: 15, upper_primary: 15, preteen: 15 },
    );
    const checks = metricsReadinessChecks(product);

    expect(product.familiesTotal).toBe(0);
    expect(product.completionRate).toBeNull();
    expect(product.returnedAfterFirstWeek).toBeNull();
    expect(checkById(checks, 'families').status).toBe('insufficient_data');
    expect(checkById(checks, 'completion-rate').status).toBe('insufficient_data');
    expect(checkById(checks, 'week-one-return').status).toBe('insufficient_data');
    expect(checkById(checks, 'catalog-pressure').status).toBe('pass');
  });

  it('reports measured rates as facts without applying unconfirmed thresholds', () => {
    const product: ProductReport = {
      generatedAt: '2026-09-06T00:00:00.000Z',
      familiesTotal: 3,
      childrenTotal: 3,
      activeFamilies7d: 2,
      activeFamilies28d: 3,
      assignmentsTotal: 4,
      completionRate: 0.25,
      returnedAfterFirstWeek: 0.4,
      exhaustion: [],
      childrenNearingExhaustion: 1,
    };

    const checks = metricsReadinessChecks(product);
    expect(checkById(checks, 'families').status).toBe('pass');
    expect(checkById(checks, 'completion-rate')).toMatchObject({ status: 'pass', detail: '25%' });
    expect(checkById(checks, 'week-one-return')).toMatchObject({ status: 'pass', detail: '40%' });
    expect(checkById(checks, 'catalog-pressure')).toMatchObject({ status: 'pass', detail: '1' });
    expect(checks.every((check) => check.status !== 'fail')).toBe(true);
  });

  it('never exposes child ids from the exhaustion rows', () => {
    const product: ProductReport = {
      generatedAt: '2026-09-06T00:00:00.000Z',
      familiesTotal: 1,
      childrenTotal: 1,
      activeFamilies7d: 1,
      activeFamilies28d: 1,
      assignmentsTotal: 1,
      completionRate: 1,
      returnedAfterFirstWeek: null,
      exhaustion: [
        { childId: 'private-child-id', ageBand: 'early', seen: 12, available: 15, share: 0.8 },
      ],
      childrenNearingExhaustion: 1,
    };

    expect(JSON.stringify(metricsReadinessChecks(product))).not.toContain('private-child-id');
  });
});
