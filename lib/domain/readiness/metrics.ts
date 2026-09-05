import type { ProductReport } from '@/lib/domain/metrics/product';
import type { ReadinessCheck } from '@/lib/domain/readiness/report';

function percentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function metricsReadinessChecks(report: ProductReport): ReadinessCheck[] {
  return [
    {
      id: 'families',
      label: 'Families measured',
      status: report.familiesTotal === 0 ? 'insufficient_data' : 'pass',
      detail: String(report.familiesTotal),
    },
    {
      id: 'completion-rate',
      label: 'Completion rate',
      status: report.completionRate === null ? 'insufficient_data' : 'pass',
      detail: report.completionRate === null ? 'no denominator yet' : percentage(report.completionRate),
    },
    {
      id: 'week-one-return',
      label: 'Returned after week one',
      status: report.returnedAfterFirstWeek === null ? 'insufficient_data' : 'pass',
      detail:
        report.returnedAfterFirstWeek === null
          ? 'no eligible families yet'
          : percentage(report.returnedAfterFirstWeek),
    },
    {
      id: 'catalog-pressure',
      label: 'Children at or above 80% of their age-band catalog',
      status: 'pass',
      detail: String(report.childrenNearingExhaustion),
    },
  ];
}
