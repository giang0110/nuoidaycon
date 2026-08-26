/**
 * Validation layer L3 — content safety (ACTIVITY_MODEL.md §6).
 *
 * Deterministic and FAIL-CLOSED: content that cannot be validated is rejected,
 * never "allowed with a warning". Runs identically in the seed CI job, the
 * database write path, and (from Phase 8) the AI pipeline — one implementation,
 * not three.
 */
import { DENYLIST } from './denylist';
import { collectProse, detectForbiddenPatterns } from './detectors';
import { countWords, longestSentenceWords } from './readability';
import type { AgeBand } from '@/lib/domain/policy/age';

export interface SafetyFailure {
  readonly rule: string;
  readonly path: string;
  readonly detail: string;
}

export interface SafetyResult {
  readonly ok: boolean;
  readonly failures: readonly SafetyFailure[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Word-boundary-ish match that also works for Vietnamese multi-word terms. */
function containsTerm(haystack: string, term: string): boolean {
  const pattern = new RegExp(`(^|[^\\p{L}])${escapeRegExp(term)}([^\\p{L}]|$)`, 'iu');
  return pattern.test(haystack);
}

export function checkDenylist(value: unknown): SafetyFailure[] {
  const failures: SafetyFailure[] = [];
  for (const [path, text] of collectProse(value)) {
    for (const category of DENYLIST) {
      for (const term of category.terms) {
        if (containsTerm(text, term)) {
          failures.push({
            rule: `denylist:${category.id}`,
            path,
            detail: `${category.label} — "${term}"`,
          });
        }
      }
    }
  }
  return failures;
}

export function checkForbiddenPatterns(value: unknown): SafetyFailure[] {
  const failures: SafetyFailure[] = [];
  for (const [path, text] of collectProse(value)) {
    for (const hit of detectForbiddenPatterns(text)) {
      failures.push({ rule: `pattern:${hit.kind}`, path, detail: hit.match });
    }
  }
  return failures;
}

/**
 * Length and sentence caps for the band. Applied to the story text and to the
 * child-facing instructions — the two places a child actually has to read.
 */
export function checkReadability(
  texts: readonly { path: string; text: string; isStory?: boolean }[],
  band: AgeBand,
): SafetyFailure[] {
  const failures: SafetyFailure[] = [];
  for (const { path, text, isStory } of texts) {
    const longest = longestSentenceWords(text);
    if (longest > band.maxSentenceWords) {
      failures.push({
        rule: 'readability:sentence_length',
        path,
        detail: `longest sentence ${longest} words, band allows ${band.maxSentenceWords}`,
      });
    }
    if (isStory) {
      const words = countWords(text);
      if (words > band.maxStoryWords) {
        failures.push({
          rule: 'readability:story_length',
          path,
          detail: `${words} words, band allows ${band.maxStoryWords}`,
        });
      }
    }
  }
  return failures;
}

export { DENYLIST, DENYLIST_CATEGORY_IDS } from './denylist';
export { detectForbiddenPatterns, collectStrings, collectProse } from './detectors';
export { measureReadability, longestSentenceWords, countWords } from './readability';
