/**
 * Kill switch, rate limits and cost caps — AI_CONTENT_RULES.md §7, AI8.
 *
 * Built BEFORE the first generation call, not after. Pure logic so the limits
 * are testable without a clock, a database or a provider.
 */

export const DAILY_GENERATIONS_PER_PARENT = 10;
export const HOURLY_GENERATIONS_PER_PARENT = 4;
/** Global ceiling. Tripping it disables generation for everyone. */
export const DAILY_GENERATIONS_GLOBAL = 5000;

export type LimitDecision =
  | { allowed: true }
  | { allowed: false; reason: 'kill_switch' | 'parent_daily' | 'parent_hourly' | 'global_daily' };

export interface UsageSnapshot {
  parentToday: number;
  parentLastHour: number;
  globalToday: number;
}

/**
 * A single server-side flag that disables generation globally without a deploy.
 *
 * Read from the environment rather than a database row on purpose: a kill
 * switch that lives in the same database the application is failing on is not
 * much of a kill switch.
 */
export function isGenerationEnabled(env: Record<string, string | undefined>): boolean {
  return env.AI_GENERATION_ENABLED === 'true';
}

export function checkLimits(usage: UsageSnapshot, enabled: boolean): LimitDecision {
  if (!enabled) return { allowed: false, reason: 'kill_switch' };
  if (usage.globalToday >= DAILY_GENERATIONS_GLOBAL) {
    return { allowed: false, reason: 'global_daily' };
  }
  if (usage.parentToday >= DAILY_GENERATIONS_PER_PARENT) {
    return { allowed: false, reason: 'parent_daily' };
  }
  if (usage.parentLastHour >= HOURLY_GENERATIONS_PER_PARENT) {
    return { allowed: false, reason: 'parent_hourly' };
  }
  return { allowed: true };
}

/** Drafts expire, so an unreviewed generation cannot sit around indefinitely. */
export const DRAFT_TTL_HOURS = 48;

export function isDraftExpired(createdAt: string, now: Date): boolean {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return true;
  return now.getTime() - created > DRAFT_TTL_HOURS * 3_600_000;
}
