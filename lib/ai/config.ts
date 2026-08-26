/**
 * AI configuration, read in the one module allowed to touch `process.env`
 * alongside lib/env.ts.
 *
 * The kill switch lives here rather than in a database row on purpose: a kill
 * switch that lives in the system it is meant to disable is not much of a
 * kill switch (AI_CONTENT_RULES.md AI8).
 */
export interface AiConfig {
  env: Record<string, string | undefined>;
  model: string;
}

export function getAiConfig(): AiConfig {
  return {
    env: { AI_GENERATION_ENABLED: process.env.AI_GENERATION_ENABLED },
    model: 'claude-opus-5',
  };
}
