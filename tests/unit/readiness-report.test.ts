import { describe, expect, it } from 'vitest';
import { buildReadinessReport } from '@/lib/domain/readiness/report';

const GENERATED_AT = '2026-09-05T00:00:00.000Z';

describe('readiness report', () => {
  it('preserves pending and insufficient states instead of upgrading them to pass', () => {
    const report = buildReadinessReport(
      [
        { id: 'http', label: 'HTTP smoke', status: 'pass' },
        { id: 'smtp', label: 'SMTP round-trip', status: 'pending_human' },
        { id: 'retention', label: 'Retention', status: 'insufficient_data' },
      ],
      GENERATED_AT,
    );

    expect(report.checks.map((check) => check.status)).toEqual([
      'pass',
      'pending_human',
      'insufficient_data',
    ]);
    expect(report.counts.pass).toBe(1);
    expect(report.counts.pending_human).toBe(1);
    expect(report.counts.insufficient_data).toBe(1);
    expect(report.counts.fail).toBe(0);
    expect(report.counts.not_applicable).toBe(0);
    expect(report.machineReady).toBe(true);
  });

  it('marks the report not machine-ready when any machine check fails', () => {
    const report = buildReadinessReport(
      [{ id: 'headers', label: 'Security headers', status: 'fail' }],
      GENERATED_AT,
    );

    expect(report.machineReady).toBe(false);
    expect(report.counts.fail).toBe(1);
  });

  it('preserves check order and generated time for stable JSON output', () => {
    const report = buildReadinessReport(
      [
        { id: 'z-last-name', label: 'First supplied', status: 'pass' },
        { id: 'a-first-name', label: 'Second supplied', status: 'not_applicable' },
      ],
      GENERATED_AT,
    );

    expect(report.generatedAt).toBe(GENERATED_AT);
    expect(report.checks.map((check) => check.id)).toEqual(['z-last-name', 'a-first-name']);
  });
});
