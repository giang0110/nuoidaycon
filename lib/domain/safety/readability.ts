/**
 * Vietnamese reading-level heuristic.
 *
 * ⚠️ This is a HEURISTIC, not a validated metric. English readability formulas
 * (Flesch and friends) do not transfer: they assume English syllable structure
 * and word length. Vietnamese is written in syllables separated by spaces, so
 * "syllables per word" behaves quite differently.
 *
 * What this measures is deliberately simple and explainable:
 *   - average syllables per sentence (proxy for sentence complexity)
 *   - average syllables per orthographic word
 *
 * Thresholds come from CHILD_SAFETY.md §4 and are enforced as CAPS, not as a
 * score. Human review remains authoritative (validation layer L4).
 */

export interface ReadingMetrics {
  sentences: number;
  words: number;
  syllables: number;
  avgWordsPerSentence: number;
  avgSyllablesPerWord: number;
}

const SENTENCE_SPLIT = /[.!?…]+/;

export function measureReadability(text: string): ReadingMetrics {
  const sentences = text
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter(Boolean);

  const words = text
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);

  // In Vietnamese orthography a space-separated token is one syllable, so
  // syllable count and token count coincide for native text. Latin loanwords
  // and numerals are counted as one syllable each, which is close enough for a
  // cap and never under-counts native text.
  const syllables = words.length;

  const sentenceCount = Math.max(1, sentences.length);
  const wordCount = Math.max(1, words.length);

  return {
    sentences: sentences.length,
    words: words.length,
    syllables,
    avgWordsPerSentence: wordCount / sentenceCount,
    avgSyllablesPerWord: syllables / wordCount,
  };
}

/** Longest sentence in words — the cap that actually protects young readers. */
export function longestSentenceWords(text: string): number {
  return text
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim().split(/\s+/).filter(Boolean).length)
    .reduce((max, n) => Math.max(max, n), 0);
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
