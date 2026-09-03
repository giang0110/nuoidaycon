/**
 * Product metrics, computed from rows the product already writes.
 *
 * CHILD_SAFETY.md §S5 bans third-party behavioural-analytics SDKs. That rule
 * is right and stays — but it left no way to answer the only questions that
 * decide whether this product works: does a family come back after the first
 * week, and do they run out of activities before they do?
 *
 * So the measurement is first-party and aggregate. Nothing here reads a name,
 * an email, a birth month, or the content of a child's answer; the inputs are
 * ids, timestamps and statuses. A report is safe to paste into a planning
 * document.
 *
 * Pure by decision A1 — no Supabase, no clock of its own. `now` is passed in
 * so a test can fix it.
 */
import type { AgeBand } from '@/lib/domain/content/coverage';
import { BANDS } from '@/lib/domain/content/coverage';

const DAY_MS = 86_400_000;

/** A child has effectively finished a band once they have seen this much of it. */
const EXHAUSTION_THRESHOLD = 0.8;

export interface MetricsInput {
  families: { parentId: string; createdAt: string }[];
  children: { childId: string; parentId: string; ageBand: AgeBand }[];
  assignments: {
    childId: string;
    assignedAt: string;
    status: 'assigned' | 'in_progress' | 'submitted' | 'reviewed' | 'skipped';
  }[];
}

export interface ExhaustionRow {
  childId: string;
  ageBand: AgeBand;
  seen: number;
  available: number;
  /** null when the band has no content — undefined is not the same as zero. */
  share: number | null;
}

export interface ProductReport {
  generatedAt: string;
  familiesTotal: number;
  childrenTotal: number;
  activeFamilies7d: number;
  activeFamilies28d: number;
  assignmentsTotal: number;
  /** null when nothing has been assigned yet, so "no data" cannot read as "nobody finishes". */
  completionRate: number | null;
  /**
   * Of families past their first fortnight, the share that came back at all
   * after week one. null until at least one family is old enough to judge.
   */
  returnedAfterFirstWeek: number | null;
  exhaustion: ExhaustionRow[];
  childrenNearingExhaustion: number;
}

/** Activities available per band. Defaults to zero so the caller must supply real numbers. */
export type BandSupply = Record<AgeBand, number>;

const EMPTY_SUPPLY: BandSupply = {
  early: 0,
  lower_primary: 0,
  upper_primary: 0,
  preteen: 0,
};

const COMPLETED = new Set(['submitted', 'reviewed']);

export function summariseProduct(
  input: MetricsInput,
  now: Date,
  supply: BandSupply = EMPTY_SUPPLY,
): ProductReport {
  const childToParent = new Map(input.children.map((c) => [c.childId, c.parentId]));
  const nowMs = now.getTime();

  /** Parents with at least one assignment inside the window. */
  const activeParentsWithin = (days: number): Set<string> => {
    const cutoff = nowMs - days * DAY_MS;
    const parents = new Set<string>();
    for (const a of input.assignments) {
      if (Date.parse(a.assignedAt) < cutoff) continue;
      const parentId = childToParent.get(a.childId);
      if (parentId) parents.add(parentId);
    }
    return parents;
  };

  const completedCount = input.assignments.filter((a) => COMPLETED.has(a.status)).length;

  const exhaustion = buildExhaustion(input, supply);

  return {
    generatedAt: now.toISOString(),
    familiesTotal: input.families.length,
    childrenTotal: input.children.length,
    activeFamilies7d: activeParentsWithin(7).size,
    activeFamilies28d: activeParentsWithin(28).size,
    assignmentsTotal: input.assignments.length,
    completionRate:
      input.assignments.length === 0 ? null : completedCount / input.assignments.length,
    returnedAfterFirstWeek: returnedAfterFirstWeek(input, childToParent, nowMs),
    exhaustion,
    childrenNearingExhaustion: exhaustion.filter(
      (row) => row.share !== null && row.share >= EXHAUSTION_THRESHOLD,
    ).length,
  };
}

/**
 * Of the families old enough to judge, how many came back after week one.
 *
 * Deliberately "at any point after day seven" rather than "during days 7–14".
 * A family still using the product on day 20 has plainly been retained, and a
 * fixed second-week window would score them as churned — which is the kind of
 * metric that reports a crisis that is not happening.
 *
 * Families younger than 14 days are excluded rather than counted as churned:
 * judging them now would report a failure that has not had time to happen.
 */
function returnedAfterFirstWeek(
  input: MetricsInput,
  childToParent: Map<string, string>,
  nowMs: number,
): number | null {
  const eligible = input.families.filter((f) => nowMs - Date.parse(f.createdAt) >= 14 * DAY_MS);
  if (eligible.length === 0) return null;

  const retained = eligible.filter((family) => {
    const afterFirstWeek = Date.parse(family.createdAt) + 7 * DAY_MS;
    return input.assignments.some(
      (a) =>
        childToParent.get(a.childId) === family.parentId &&
        Date.parse(a.assignedAt) >= afterFirstWeek,
    );
  });

  return retained.length / eligible.length;
}

/**
 * How much of their own age band each child has already been given.
 *
 * This is the leading indicator for the catalogue risk: a child at 0.8 will
 * start seeing repeats within days, and the parent will notice before any
 * retention number moves.
 */
function buildExhaustion(input: MetricsInput, supply: BandSupply): ExhaustionRow[] {
  const seenByChild = new Map<string, number>();
  for (const a of input.assignments) {
    seenByChild.set(a.childId, (seenByChild.get(a.childId) ?? 0) + 1);
  }

  return input.children
    .map((child) => {
      const available = supply[child.ageBand] ?? 0;
      const seen = seenByChild.get(child.childId) ?? 0;
      return {
        childId: child.childId,
        ageBand: child.ageBand,
        seen,
        available,
        share: available === 0 ? null : Math.min(1, seen / available),
      };
    })
    .sort((a, b) => (b.share ?? -1) - (a.share ?? -1));
}

/** Bands in a stable order, for report rendering. */
export const REPORT_BANDS = BANDS;
