/**
 * Content depth per age band.
 *
 * The catalogue is easy to misread. "22 activities, MVP target 20–25" looks
 * healthy — but the four age bands do not overlap, so a five-year-old only
 * ever sees the `early` slice of it. At the time this was written that slice
 * held four activities: under a week of use before the child has seen
 * everything.
 *
 * These tests pin the arithmetic that makes that visible, so the number a
 * reviewer reads is the number a child actually experiences.
 */
import { describe, it, expect } from 'vitest';
import { assessCoverage, DEVELOPMENT_FLOOR, LAUNCH_FLOOR } from '@/lib/domain/content/coverage';
import type { CoverageInput } from '@/lib/domain/content/coverage';

/** `count` activities in one band, spread over `types` distinct types. */
function band(ageBand: CoverageInput['ageBand'], count: number, types = 6): CoverageInput[] {
  return Array.from({ length: count }, (_, i) => ({
    ageBand,
    type: `type_${i % types}`,
  }));
}

const FULL = [
  ...band('early', 15),
  ...band('lower_primary', 15),
  ...band('upper_primary', 15),
  ...band('preteen', 15),
];

describe('per-band depth, not the headline total', () => {
  it('counts each band separately because the bands do not overlap', () => {
    const report = assessCoverage([...band('early', 4), ...band('lower_primary', 10)]);

    expect(report.bands.early.count).toBe(4);
    expect(report.bands.lower_primary.count).toBe(10);
    expect(report.bands.upper_primary.count).toBe(0);
    expect(report.total).toBe(14);
  });

  it('reports days of supply, which is what a parent actually experiences', () => {
    // One activity a day is the product's own cadence.
    const report = assessCoverage(band('early', 4));
    expect(report.bands.early.daysOfSupply).toBe(4);
  });

  it('counts how many of the six activity types a band offers', () => {
    const report = assessCoverage(band('early', 4, 2));
    expect(report.bands.early.typeCount).toBe(2);
  });
});

describe('the development floor keeps the build usable', () => {
  it('passes when every band clears the development floor', () => {
    const report = assessCoverage(FULL);
    expect(report.meetsDevelopmentFloor).toBe(true);
    expect(report.developmentShortfalls).toEqual([]);
  });

  it('fails when a band is emptier than the development floor', () => {
    const report = assessCoverage([...band('early', DEVELOPMENT_FLOOR - 1), ...band('preteen', 9)]);
    expect(report.meetsDevelopmentFloor).toBe(false);
    expect(report.developmentShortfalls.map((s) => s.ageBand)).toContain('early');
  });

  it('treats a band with no content at all as a shortfall, not as absent', () => {
    // A missing band is the worst case, not an exemption.
    const report = assessCoverage(band('early', 20));
    expect(report.developmentShortfalls.map((s) => s.ageBand)).toEqual(
      expect.arrayContaining(['lower_primary', 'upper_primary', 'preteen']),
    );
  });
});

describe('the launch floor is the gate before outside users', () => {
  it('is stricter than the development floor', () => {
    expect(LAUNCH_FLOOR).toBeGreaterThan(DEVELOPMENT_FLOOR);
  });

  it('is not met by a catalogue that merely clears the headline total', () => {
    // 22 activities passes "MVP target 20–25" and still fails this.
    const shipped = [
      ...band('early', 4),
      ...band('lower_primary', 10),
      ...band('upper_primary', 5),
      ...band('preteen', 3),
    ];
    const report = assessCoverage(shipped);

    expect(report.total).toBe(22);
    expect(report.meetsLaunchFloor).toBe(false);
    expect(report.launchShortfalls.map((s) => s.ageBand).sort()).toEqual([
      'early',
      'lower_primary',
      'preteen',
      'upper_primary',
    ]);
  });

  it('says exactly how many activities each band still needs', () => {
    const report = assessCoverage(band('early', 4));
    const early = report.launchShortfalls.find((s) => s.ageBand === 'early');
    expect(early?.missing).toBe(LAUNCH_FLOOR - 4);
  });

  it('totals the remaining authoring work, so the cost is one number', () => {
    const report = assessCoverage([
      ...band('early', 4),
      ...band('lower_primary', 10),
      ...band('upper_primary', 5),
      ...band('preteen', 3),
    ]);
    expect(report.totalMissingForLaunch).toBe(LAUNCH_FLOOR * 4 - 22);
  });

  it('passes once every band is deep enough', () => {
    const report = assessCoverage(FULL);
    expect(report.meetsLaunchFloor).toBe(true);
    expect(report.totalMissingForLaunch).toBe(0);
  });
});

describe('narrowing the launch to one band is a supported answer', () => {
  it('reports which bands would ship if only the ready ones were offered', () => {
    const report = assessCoverage([
      ...band('early', 4),
      ...band('lower_primary', 16),
      ...band('upper_primary', 5),
      ...band('preteen', 3),
    ]);

    // Shipping lower_primary alone is a real option, and the report should
    // say so rather than only reporting failure.
    expect(report.launchReadyBands).toEqual(['lower_primary']);
  });

  it('returns an empty list when no band is ready, without throwing', () => {
    expect(assessCoverage(band('early', 1)).launchReadyBands).toEqual([]);
  });
});
