/**
 * Decision A9 / non-goal #1 (docs/product/PRODUCT_SPEC.md §8, §10).
 *
 * The MVP is Phases 0–7 and ships no AI. Making that a CI check rather than a
 * matter of discipline is the whole point: scope creep into AI is the largest
 * risk to both the schedule and the child-safety story.
 *
 * This check is lifted DELIBERATELY at Phase 8, in the same pull request that
 * adds the SDK — never by drift, and never by quietly editing this list.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BANNED_PACKAGES = [
  '@anthropic-ai/sdk',
  '@anthropic-ai/bedrock-sdk',
  '@anthropic-ai/vertex-sdk',
  'openai',
  '@azure/openai',
  '@google/generative-ai',
  '@google/genai',
  '@google-cloud/aiplatform',
  '@mistralai/mistralai',
  'cohere-ai',
  'replicate',
  'ollama',
  'langchain',
  '@langchain/core',
  '@langchain/openai',
  '@langchain/anthropic',
  'llamaindex',
  'ai',
  '@ai-sdk/openai',
  '@ai-sdk/anthropic',
  '@ai-sdk/google',
];

function main(): void {
  const pkgPath = resolve(process.cwd(), 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };

  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ]);

  const directHits = BANNED_PACKAGES.filter((name) => declared.has(name));

  // Also scan the lockfile, so a banned package cannot arrive as a transitive
  // dependency of something innocuous.
  let lockHits: string[] = [];
  try {
    const lock = readFileSync(resolve(process.cwd(), 'pnpm-lock.yaml'), 'utf8');
    lockHits = BANNED_PACKAGES.filter((name) =>
      new RegExp(`^\\s{2,}(?:')?${escapeRegExp(name)}(?:')?@`, 'm').test(lock),
    );
  } catch {
    // No lockfile yet (fresh clone before install) — the direct check still runs.
  }

  const hits = [...new Set([...directHits, ...lockHits])];

  if (hits.length > 0) {
    console.error('\n✗ LLM provider dependency detected — this violates decision A9.\n');
    for (const hit of hits) console.error(`    ${hit}`);
    console.error(
      '\n  The MVP (Phases 0–7) ships no AI. If this is intentional Phase 8 work,\n' +
        '  remove this check in the same pull request that adds the SDK, and say so\n' +
        '  in the commit message. See docs/product/AI_CONTENT_RULES.md §8 for the\n' +
        '  preconditions that must hold first.\n',
    );
    process.exit(1);
  }

  console.log(`✓ no-llm-dependency: clean (${BANNED_PACKAGES.length} packages checked)`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main();
