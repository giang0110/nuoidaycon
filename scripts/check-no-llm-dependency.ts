/**
 * Decision A9 / non-goal #1 (docs/product/PRODUCT_SPEC.md §8, §10).
 *
 * ── LIFTED AT PHASE 8 ──────────────────────────────────────────────────────
 * Through Phase 7 this check failed the build if ANY LLM SDK appeared in the
 * dependency tree. Phase 8 adds `@anthropic-ai/sdk` deliberately, in the same
 * change that adds the pipeline, so the Anthropic SDK is now allowed.
 *
 * The check is NOT deleted. Its job changes rather than ending:
 *
 *   1. Every OTHER provider stays banned. AI_CONTENT_RULES.md requires a single
 *      provider abstraction, and a second SDK appearing in the tree means
 *      someone bypassed it.
 *   2. The Anthropic SDK must be imported by exactly ONE file
 *      (lib/ai/anthropic-provider.ts). Scattered SDK calls are the thing the
 *      abstraction exists to prevent, and a lint rule cannot see a transitive
 *      import — this can.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/** The one permitted SDK, and the one file allowed to import it. */
const ALLOWED_SDK = '@anthropic-ai/sdk';
const ALLOWED_IMPORTER = 'lib/ai/anthropic-provider.ts';

const BANNED_PACKAGES = [
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

  // The provider abstraction is only real if it is the sole import site.
  const importers = findSdkImporters();
  const strays = importers.filter((file) => file !== ALLOWED_IMPORTER);
  if (strays.length > 0) {
    console.error(`\n✗ ${ALLOWED_SDK} is imported outside the provider adapter.\n`);
    for (const file of strays) console.error(`    ${file}`);
    console.error(
      `\n  AI_CONTENT_RULES.md requires ONE provider abstraction. Add what you need\n` +
        `  to the ContentProvider interface and implement it in ${ALLOWED_IMPORTER}.\n`,
    );
    process.exit(1);
  }

  console.log(
    `✓ llm-dependency: ${BANNED_PACKAGES.length} providers banned; ` +
      `${ALLOWED_SDK} imported only by ${ALLOWED_IMPORTER}`,
  );
}

/** Walk the source tree for import sites of the permitted SDK. */
function findSdkImporters(): string[] {
  const roots = ['app', 'lib', 'components', 'scripts', 'tests'];
  const found: string[] = [];

  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = `${dir}/${entry}`;
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(full)) {
        const source = readFileSync(full, 'utf8');
        if (new RegExp(`from ['\"]${escapeRegExp(ALLOWED_SDK)}`).test(source)) found.push(full);
      }
    }
  };

  for (const root of roots) walk(root);
  return found;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main();
