/**
 * The deterministic recommendation engine — PRODUCT_SPEC.md §7.
 *
 * Adaptation is a PURE FUNCTION, not a model. Given a child and the catalog it
 * returns a ranked, reproducible list. AI is a content *source* later, never
 * the control flow (principle P4).
 *
 * Pipeline: hard filter → score → deterministic tie-break → diversify.
 * A template that fails a hard filter can never be surfaced, whatever it scores.
 */
import type { ActivityTemplate, ActivityType, Child } from '@/lib/domain/entities';
import {
  clampDifficultyToBand,
  gradeToIndex,
  resolveBandForChild,
  type AgeBand,
} from '@/lib/domain/policy/age';
import { dateBucketFor, tieBreak } from './prng';

export interface HistoryEntry {
  templateId: string;
  type: ActivityType;
  assignedAt: string;
}

export interface ChildContext {
  child: Child;
  /** Interest slugs the parent chose. */
  interestSlugs: readonly string[];
  /** Per-activity-type difficulty (decision A6). */
  difficultyByType: Readonly<Partial<Record<ActivityType, number>>>;
  history: readonly HistoryEntry[];
}

export interface SuggestOptions {
  count?: number;
  /** Incremented by the parent's "Đổi gợi ý khác" — still reproducible. */
  shuffleSeed?: number;
  now?: Date;
  /** Days a template is suppressed after being assigned to this child. */
  cooldownDays?: number;
}

export interface ScoredTemplate {
  template: ActivityTemplate;
  score: number;
  parts: {
    interestOverlap: number;
    difficultyFit: number;
    typeRotation: number;
    novelty: number;
  };
}

export type SuggestionResult =
  | { exhausted: false; suggestions: ScoredTemplate[] }
  | { exhausted: true; suggestions: ScoredTemplate[]; reason: 'no_eligible_templates' };

const DAY_MS = 86_400_000;
export const DEFAULT_COOLDOWN_DAYS = 21;

const WEIGHTS = {
  interestOverlap: 0.35,
  difficultyFit: 0.3,
  typeRotation: 0.2,
  novelty: 0.15,
} as const;

// ---------------------------------------------------------------------------
// Hard filter
// ---------------------------------------------------------------------------

export interface EligibilityFailure {
  templateId: string;
  reason: string;
}

export function isEligible(
  template: ActivityTemplate,
  ctx: ChildContext,
  band: AgeBand,
  now: Date,
  cooldownDays: number,
): { eligible: true } | { eligible: false; reason: string } {
  const age = ageOf(ctx.child, now);

  if (template.locale !== ctx.child.locale) return { eligible: false, reason: 'locale' };
  if (template.status !== 'approved') return { eligible: false, reason: 'not_approved' };
  if (template.ownerId !== null) return { eligible: false, reason: 'not_global' };
  if (age < template.minAge || age > template.maxAge) return { eligible: false, reason: 'age' };

  const grade = gradeToIndex(ctx.child.grade);
  if (grade < gradeToIndex(template.gradeMin) || grade > gradeToIndex(template.gradeMax)) {
    return { eligible: false, reason: 'grade' };
  }

  if (template.difficulty < band.minDifficulty || template.difficulty > band.maxDifficulty) {
    return { eligible: false, reason: 'difficulty_out_of_band' };
  }

  const lastAssigned = lastAssignedAt(ctx.history, template.id);
  if (lastAssigned !== null && now.getTime() - lastAssigned < cooldownDays * DAY_MS) {
    return { eligible: false, reason: 'cooldown' };
  }

  return { eligible: true };
}

function ageOf(child: Child, now: Date): number {
  const years = now.getUTCFullYear() - child.birthYear;
  const months = now.getUTCMonth() + 1 - child.birthMonth;
  return Math.max(0, months >= 0 ? years : years - 1);
}

function lastAssignedAt(history: readonly HistoryEntry[], templateId: string): number | null {
  let latest: number | null = null;
  for (const entry of history) {
    if (entry.templateId !== templateId) continue;
    const t = Date.parse(entry.assignedAt);
    if (!Number.isNaN(t) && (latest === null || t > latest)) latest = t;
  }
  return latest;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Jaccard overlap. 1 when the parent picked no interests, so it stays neutral. */
export function interestOverlap(
  templateTags: readonly string[],
  childInterests: readonly string[],
): number {
  if (childInterests.length === 0) return 1;
  if (templateTags.length === 0) return 0;
  const child = new Set(childInterests);
  const shared = templateTags.filter((t) => child.has(t)).length;
  const union = new Set([...templateTags, ...childInterests]).size;
  return union === 0 ? 0 : shared / union;
}

export function difficultyFit(templateDifficulty: number, childDifficulty: number): number {
  return 1 - Math.abs(templateDifficulty - childDifficulty) / 4;
}

/** Penalises types the child has done recently, to keep a varied week. */
export function typeRotation(
  type: ActivityType,
  history: readonly HistoryEntry[],
  now: Date,
  windowDays = 7,
): number {
  const since = now.getTime() - windowDays * DAY_MS;
  const recent = history.filter((h) => h.type === type && Date.parse(h.assignedAt) >= since).length;
  return 1 / (1 + recent);
}

/** Decays with recency of this exact template. 1 when never assigned. */
export function novelty(
  templateId: string,
  history: readonly HistoryEntry[],
  now: Date,
  horizonDays = 90,
): number {
  const last = lastAssignedAt(history, templateId);
  if (last === null) return 1;
  const ageDays = (now.getTime() - last) / DAY_MS;
  return Math.min(1, ageDays / horizonDays);
}

export function scoreTemplate(
  template: ActivityTemplate,
  ctx: ChildContext,
  now: Date,
): ScoredTemplate {
  const childDifficulty = ctx.difficultyByType[template.type] ?? 1;
  const parts = {
    interestOverlap: interestOverlap(template.interestTags, ctx.interestSlugs),
    difficultyFit: difficultyFit(template.difficulty, childDifficulty),
    typeRotation: typeRotation(template.type, ctx.history, now),
    novelty: novelty(template.id, ctx.history, now),
  };

  const score =
    WEIGHTS.interestOverlap * parts.interestOverlap +
    WEIGHTS.difficultyFit * parts.difficultyFit +
    WEIGHTS.typeRotation * parts.typeRotation +
    WEIGHTS.novelty * parts.novelty;

  return { template, score, parts };
}

// ---------------------------------------------------------------------------
// Suggest
// ---------------------------------------------------------------------------

export function suggestActivities(
  ctx: ChildContext,
  catalog: readonly ActivityTemplate[],
  options: SuggestOptions = {},
): SuggestionResult {
  const now = options.now ?? new Date();
  const count = options.count ?? 3;
  const shuffleSeed = options.shuffleSeed ?? 0;
  const cooldownDays = options.cooldownDays ?? DEFAULT_COOLDOWN_DAYS;
  const band = resolveBandForChild(ctx.child, now);
  const bucket = dateBucketFor(now);

  const eligible = catalog.filter((t) => isEligible(t, ctx, band, now, cooldownDays).eligible);

  if (eligible.length === 0) {
    return { exhausted: true, suggestions: [], reason: 'no_eligible_templates' };
  }

  const scored = eligible
    .map((t) => scoreTemplate(t, ctx, now))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Deterministic tie-break, never Math.random().
      const ja = tieBreak(ctx.child.id, bucket, a.template.id, shuffleSeed);
      const jb = tieBreak(ctx.child.id, bucket, b.template.id, shuffleSeed);
      if (ja !== jb) return ja - jb;
      return a.template.id.localeCompare(b.template.id);
    });

  // Diversify: at most one per type in the proposal.
  const seenTypes = new Set<ActivityType>();
  const picked: ScoredTemplate[] = [];
  for (const candidate of scored) {
    if (seenTypes.has(candidate.template.type)) continue;
    picked.push(candidate);
    seenTypes.add(candidate.template.type);
    if (picked.length === count) break;
  }

  // If diversity starved the list, top it up in score order.
  if (picked.length < count) {
    for (const candidate of scored) {
      if (picked.includes(candidate)) continue;
      picked.push(candidate);
      if (picked.length === count) break;
    }
  }

  return { exhausted: false, suggestions: picked };
}

/** The "why this was picked" line shown on the assign card. */
export function explainSuggestion(scored: ScoredTemplate, ctx: ChildContext): string {
  const { parts, template } = scored;
  const shared = template.interestTags.filter((t) => ctx.interestSlugs.includes(t));
  if (shared.length > 0) return `Phù hợp với sở thích: ${shared.join(', ')}`;
  if (parts.difficultyFit >= 0.9) return 'Vừa với mức độ hiện tại của con';
  if (parts.novelty === 1) return 'Con chưa làm hoạt động này';
  return 'Giúp con đổi sang dạng hoạt động khác';
}

export { clampDifficultyToBand };
