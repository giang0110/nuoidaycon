/**
 * How deep the catalogue is for a child of a given age.
 *
 * The headline total is misleading. `ACTIVITY_MODEL.md` bands are disjoint —
 * early is 4–6, lower_primary 7–8, upper_primary 9–10, preteen 11–12 — so a
 * child never draws from more than one of them. "22 activities" is therefore
 * not 22 activities for anybody; it is four, ten, five and three for four
 * different children.
 *
 * This module reports the number that matters, in days of supply, and states
 * the gap to a catalogue deep enough to open to people outside the team.
 */

export const BANDS = ['early', 'lower_primary', 'upper_primary', 'preteen'] as const;
export type AgeBand = (typeof BANDS)[number];

/**
 * Below this a band is too thin to develop against — the engine's cooldown and
 * novelty scoring have nothing to work with, so the tests stop being
 * meaningful. Kept low deliberately: it is a floor, not a goal.
 */
export const DEVELOPMENT_FLOOR = 3;

/**
 * The gate before real families use the product.
 *
 * Fifteen is roughly two weeks at the product's one-activity-a-day cadence —
 * long enough for a parent to form a habit before the library runs dry, and
 * short enough to be reachable. It is a judgement, not a measurement; revisit
 * it once there is retention data to argue with.
 */
export const LAUNCH_FLOOR = 15;

/** One activity, reduced to the two fields that decide coverage. */
export interface CoverageInput {
  ageBand: AgeBand;
  type: string;
}

export interface BandCoverage {
  count: number;
  /** Distinct activity types, out of six. A band of one type feels repetitive. */
  typeCount: number;
  /** At the product's one-a-day cadence, how long before a child sees everything. */
  daysOfSupply: number;
}

export interface Shortfall {
  ageBand: AgeBand;
  have: number;
  need: number;
  missing: number;
}

export interface CoverageReport {
  total: number;
  bands: Record<AgeBand, BandCoverage>;
  meetsDevelopmentFloor: boolean;
  developmentShortfalls: Shortfall[];
  meetsLaunchFloor: boolean;
  launchShortfalls: Shortfall[];
  /** Total activities still to be authored to clear the launch floor everywhere. */
  totalMissingForLaunch: number;
  /**
   * Bands that could open to real families today.
   *
   * Present because "narrow the launch to the band that is ready" is a sound
   * answer to a thin catalogue, and a report that only ever says "not enough"
   * hides it.
   */
  launchReadyBands: AgeBand[];
}

export function assessCoverage(activities: readonly CoverageInput[]): CoverageReport {
  const bands = {} as Record<AgeBand, BandCoverage>;

  for (const ageBand of BANDS) {
    const inBand = activities.filter((a) => a.ageBand === ageBand);
    bands[ageBand] = {
      count: inBand.length,
      typeCount: new Set(inBand.map((a) => a.type)).size,
      daysOfSupply: inBand.length,
    };
  }

  const shortfallsAgainst = (floor: number): Shortfall[] =>
    BANDS.filter((b) => bands[b].count < floor).map((ageBand) => ({
      ageBand,
      have: bands[ageBand].count,
      need: floor,
      missing: floor - bands[ageBand].count,
    }));

  const developmentShortfalls = shortfallsAgainst(DEVELOPMENT_FLOOR);
  const launchShortfalls = shortfallsAgainst(LAUNCH_FLOOR);

  return {
    total: activities.length,
    bands,
    meetsDevelopmentFloor: developmentShortfalls.length === 0,
    developmentShortfalls,
    meetsLaunchFloor: launchShortfalls.length === 0,
    launchShortfalls,
    totalMissingForLaunch: launchShortfalls.reduce((sum, s) => sum + s.missing, 0),
    launchReadyBands: BANDS.filter((b) => bands[b].count >= LAUNCH_FLOOR),
  };
}
