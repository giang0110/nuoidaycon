/**
 * Deterministic tie-breaking (PRODUCT_SPEC.md §7 step 3).
 *
 * The same child, on the same day, against the same catalog must get the same
 * suggestions — otherwise the engine cannot be tested, and a parent who
 * refreshes sees the list shuffle for no reason. `Math.random()` is therefore
 * banned from the engine; this seeded PRNG replaces it.
 */

/** FNV-1a. Small, fast, and stable across runs and platforms. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32 — a well-behaved 32-bit PRNG for tie-breaking. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable per-candidate jitter, so ordering is reproducible but not alphabetical. */
export function tieBreak(
  childId: string,
  dateBucket: string,
  templateId: string,
  shuffleSeed: number,
): number {
  return seededRandom(hashString(`${childId}|${dateBucket}|${templateId}|${shuffleSeed}`))();
}

/** UTC day, so a suggestion set is stable for the whole day. */
export function dateBucketFor(now: Date): string {
  return now.toISOString().slice(0, 10);
}
