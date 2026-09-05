import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const historyPage = readFileSync(
  'app/(parent)/children/[childId]/history/page.tsx',
  'utf8',
);
const dashboardPage = readFileSync('app/(parent)/dashboard/page.tsx', 'utf8');
const childPage = readFileSync('app/(parent)/children/[childId]/page.tsx', 'utf8');
const summaryModule = readFileSync('lib/domain/engine/summary.ts', 'utf8');

const historyBlock = (source: string) => {
  const match = source.match(/history:\s*\{([\s\S]*?)\n\s*\},\n\s*(?:print|ai|library|dashboard):/);
  return match?.[1] ?? '';
};

const viMessages = readFileSync('lib/i18n/messages.vi.ts', 'utf8');
const enMessages = readFileSync('lib/i18n/messages.en.ts', 'utf8');

describe('Phase 10 parent progress page contract', () => {
  it('keeps the existing history route and exposes both supported windows', () => {
    expect(historyPage).toContain("rawWindow === '30' ? 30 : 7");
    expect(historyPage).toContain('history?window=7');
    expect(historyPage).toContain('history?window=30');
  });

  it('builds the screen through repositories and the pure progress summary', () => {
    expect(historyPage).toContain('createReviewRepository');
    expect(historyPage).toContain('createProgressRepository');
    expect(historyPage).toContain('buildProgressSummary');
    expect(historyPage).not.toContain(".from('assignment_reviews')");
  });

  it('renders all six type rows from the canonical activity-type list', () => {
    expect(historyPage).toContain('ACTIVITY_TYPES.map');
    expect(historyPage).toContain('summary.byType[type]');
    expect(historyPage).toContain('summary.difficultyByType[type]');
  });

  it('links to the upgraded screen from both child detail and dashboard', () => {
    expect(childPage).toContain(`/children/${child.id}/history`);
    expect(dashboardPage).toContain(`/children/${child.id}/history`);
  });

  it('moves all new user-facing progress copy into both i18n catalogues', () => {
    const requiredKeys = [
      'window7',
      'window30',
      'assigned',
      'completed',
      'completionRate',
      'awaitingReview',
      'distribution',
      'insights',
      'difficulty',
      'recent',
      'progressLink',
      'insightAwaitingReview',
      'insightUntouchedType',
      'insightDominantType',
      'insightDifficulty',
    ];

    const viHistory = historyBlock(viMessages);
    const enHistory = historyBlock(enMessages);
    for (const key of requiredKeys) {
      expect(viHistory, `Vietnamese history key ${key}`).toContain(`${key}:`);
      expect(enHistory, `English history key ${key}`).toContain(`${key}:`);
    }
  });

  it('leaves no Vietnamese user-facing weekly prose in the pure domain module', () => {
    expect(summaryModule).not.toContain('Tuần này');
    expect(summaryModule).not.toContain('bố mẹ');
    expect(summaryModule).not.toContain('con hoàn thành');
    expect(summaryModule).not.toContain('describeWeek');
  });
});
