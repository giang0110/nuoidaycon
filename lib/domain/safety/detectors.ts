/**
 * Deterministic detectors for things that must never reach a child: links,
 * contact details, and anything that invites them online (CHILD_SAFETY.md S6, S7).
 *
 * Regex-based and intentionally broad. A false positive costs an author one
 * rewrite; a false negative puts a URL in front of a seven-year-old.
 */

export interface Detection {
  readonly kind: string;
  readonly match: string;
}

const PATTERNS: readonly { kind: string; pattern: RegExp }[] = [
  { kind: 'url', pattern: /\b(?:https?:\/\/|www\.)\S+/gi },
  { kind: 'url', pattern: /\b[a-z0-9-]+\.(?:com|net|org|vn|io|co|app|dev|xyz)\b(?:\/\S*)?/gi },
  { kind: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  // Vietnamese mobile and landline shapes, plus generic long digit runs.
  { kind: 'phone', pattern: /(?:\+?84|0)(?:\d[\s.-]?){8,10}\b/g },
  { kind: 'social_handle', pattern: /(?:^|\s)@[A-Za-z0-9_]{3,}/g },
  { kind: 'qr_or_scan', pattern: /\b(?:qr\s?code|quét mã|mã vạch)\b/gi },
];

export function detectForbiddenPatterns(text: string): Detection[] {
  const found: Detection[] = [];
  for (const { kind, pattern } of PATTERNS) {
    // Fresh regex per call: /g patterns carry lastIndex between uses.
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      found.push({ kind, match: match[0].trim() });
      if (match.index === re.lastIndex) re.lastIndex += 1;
    }
  }
  return found;
}

/**
 * Structural fields that are identifiers, enums or timestamps rather than prose.
 *
 * These must be skipped by the safety scan: a UUID is digits and hyphens, so a
 * phone-number detector matches it every time, and a slug is not something a
 * child reads. Scanning them produces noise that would train authors to ignore
 * the checker — the worst possible outcome for a safety gate.
 */
const STRUCTURAL_KEYS = new Set([
  'id',
  'slug',
  'locale',
  'status',
  'version',
  'schemaVersion',
  'snapshotSchemaVersion',
  'policyVersion',
  'ageBand',
  'reviewedBy',
  'reviewedAt',
  'authoredBy',
  'sourceRef',
  'source',
  'model',
  'promptTemplateId',
  'promptTemplateVersion',
  'generatedAt',
  'approvedByParentId',
  'approvedAt',
  'answerKey',
  'layout',
  'ruling',
  'script',
  'unit',
  'theme',
  'mode',
  'kind',
  'band',
  'interestTags',
  'checks',
  'suggestedMedium',
  'parts',
]);

function isStructuralPath(path: string): boolean {
  // Trailing [n] indices belong to the parent key.
  const segments = path.split('.').map((s) => s.replace(/\[\d+\]$/, ''));
  return segments.some((segment) => STRUCTURAL_KEYS.has(segment));
}

/**
 * Walk every string in a nested structure, including inside arrays, skipping
 * structural identifiers. Pass `{ includeStructural: true }` to scan everything.
 */
export function collectProse(value: unknown): [string, string][] {
  return collectStrings(value).filter(([path]) => !isStructuralPath(path));
}

/** Walk every string in a nested structure, including inside arrays. */
export function collectStrings(value: unknown, path = '', out: [string, string][] = []) {
  if (typeof value === 'string') {
    out.push([path, value]);
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => collectStrings(item, `${path}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      collectStrings(child, path ? `${path}.${key}` : key, out);
    }
  }
  return out;
}
