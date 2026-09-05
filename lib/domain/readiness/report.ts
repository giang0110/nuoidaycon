export const READINESS_STATUSES = [
  'pass',
  'fail',
  'pending_human',
  'not_applicable',
  'insufficient_data',
] as const;

export type ReadinessStatus = (typeof READINESS_STATUSES)[number];

export interface ReadinessCheck {
  id: string;
  label: string;
  status: ReadinessStatus;
  detail?: string;
}

export interface ReadinessReport {
  generatedAt: string;
  checks: ReadinessCheck[];
  counts: Record<ReadinessStatus, number>;
  machineReady: boolean;
}

export function buildReadinessReport(
  checks: readonly ReadinessCheck[],
  generatedAt: string,
): ReadinessReport {
  const counts = Object.fromEntries(READINESS_STATUSES.map((status) => [status, 0])) as Record<
    ReadinessStatus,
    number
  >;

  for (const check of checks) counts[check.status] += 1;

  return {
    generatedAt,
    checks: [...checks],
    counts,
    machineReady: counts.fail === 0,
  };
}
