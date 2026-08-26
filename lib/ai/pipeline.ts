/**
 * The eight-stage generation pipeline — AI_CONTENT_RULES.md §3.
 *
 *   1 parent request  → 2 age policy   → 3 approved template
 *   → 4 generation    → 5 zod (L1/L2)  → 6 safety (L3)
 *   → 7 parent preview → 8 assign
 *
 * Stages 1-6 live here. Stage 7 is a human decision in the UI; stage 8 is the
 * existing assignment path, unchanged — AI content goes through exactly the
 * same snapshotting as seeded content.
 *
 * FAILS CLOSED at every stage (invariant AI4). There is no degraded path that
 * ships unvalidated content, and no "allow with a warning".
 */
import { z } from 'zod';
import type { ActivityType, GradeLevel } from '@/lib/domain/entities';
import { getAgeBand, resolveAgeBand, POLICY_VERSION, type AgeBand } from '@/lib/domain/policy/age';
import { validateActivity } from '@/lib/domain/activity/validate';
import type { Activity } from '@/lib/domain/activity/schema';
import { findTemplate, buildUserPrompt, type PromptTemplate } from './prompt-templates';
import { delimitUntrusted, type ContentProvider } from './provider';
import { checkLimits, type UsageSnapshot } from './limits';
import { checkDenylist, checkForbiddenPatterns } from '@/lib/domain/safety';

/** Stage 1. A closed set of choices — there is NO free-text prompt field. */
export const generationRequestSchema = z.object({
  childId: z.string().uuid(),
  type: z.enum(['reflection', 'drawing_prompt', 'situation_judgment']),
  interestSlugs: z
    .array(z.string().regex(/^[a-z0-9-]+$/))
    .max(6)
    .default([]),
  /**
   * Optional hint. Length-capped, denylist-filtered, and passed as DATA inside
   * a delimited block — never as instructions (invariant AI5).
   */
  note: z.string().trim().max(200).optional(),
});

export type GenerationRequestInput = z.infer<typeof generationRequestSchema>;

export interface ChildConstraints {
  birthYear: number;
  birthMonth: number;
  grade: GradeLevel;
  difficulty: number;
}

export type PipelineOutcome =
  'generated' | 'schema_rejected' | 'safety_rejected' | 'provider_error';

export interface PipelineFailure {
  ok: false;
  outcome: Exclude<PipelineOutcome, 'generated'> | 'rate_limited' | 'no_template';
  rules: string[];
  detail: string;
}

export interface PipelineSuccess {
  ok: true;
  outcome: 'generated';
  activity: Activity;
  promptTemplate: PromptTemplate;
  model: string;
  durationMs: number;
}

export type PipelineResult = PipelineSuccess | PipelineFailure;

/** Bounded (invariant AI4): at most two attempts, then fail. */
export const MAX_ATTEMPTS = 2;

export interface PipelineDeps {
  provider: ContentProvider;
  usage: UsageSnapshot;
  generationEnabled: boolean;
  now: Date;
  /** Injected so the pipeline stays deterministic under test. */
  newId: () => string;
}

export async function runGenerationPipeline(
  rawRequest: unknown,
  child: ChildConstraints,
  deps: PipelineDeps,
): Promise<PipelineResult> {
  // ---- Stage 1: parent request -----------------------------------------
  const parsed = generationRequestSchema.safeParse(rawRequest);
  if (!parsed.success) {
    return {
      ok: false,
      outcome: 'schema_rejected',
      rules: ['request_invalid'],
      detail: 'bad request',
    };
  }
  const request = parsed.data;

  const limit = checkLimits(deps.usage, deps.generationEnabled);
  if (!limit.allowed) {
    return { ok: false, outcome: 'rate_limited', rules: [limit.reason], detail: limit.reason };
  }

  // ---- Stage 2: age policy ---------------------------------------------
  const age = deriveAge(child, deps.now);
  const band = getAgeBand(resolveAgeBand(age));
  const difficulty = clamp(child.difficulty, band.minDifficulty, band.maxDifficulty);

  // ---- Stage 3: approved prompt template --------------------------------
  const promptTemplate = findTemplate(request.type);
  if (!promptTemplate) {
    return { ok: false, outcome: 'no_template', rules: ['no_template'], detail: request.type };
  }

  // The parent's note is filtered BEFORE it is sent. If it fails, it is
  // dropped entirely rather than sanitised into something else.
  const safeNote = safeNoteOrUndefined(request.note);

  const userPrompt = buildUserPrompt({
    type: request.type,
    band,
    grade: child.grade,
    difficulty,
    interestSlugs: request.interestSlugs,
  });

  let lastFailure: PipelineFailure = {
    ok: false,
    outcome: 'provider_error',
    rules: ['no_attempt'],
    detail: 'pipeline did not run',
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    // ---- Stage 4: generation -------------------------------------------
    const generated = await deps.provider.generate({
      systemPrompt: promptTemplate.system,
      userPrompt,
      ...(safeNote ? { untrustedNote: delimitUntrusted(safeNote) } : {}),
      outputSchema: outputSchemaFor(request.type),
      maxTokens: 4000,
      timeoutMs: 60_000,
    });

    if (!generated.ok) {
      lastFailure = {
        ok: false,
        outcome: 'provider_error',
        rules: [`provider:${generated.reason}`],
        detail: generated.detail,
      };
      continue;
    }

    // ---- Stage 5 + 6: schema then safety, both fail-closed --------------
    const candidate = assembleEnvelope(generated.content, {
      id: deps.newId(),
      type: request.type,
      band,
      difficulty,
      grade: child.grade,
      interestSlugs: request.interestSlugs,
      model: deps.provider.model,
      promptTemplate,
      now: deps.now,
    });

    const validation = validateActivity(candidate);
    if (!validation.ok) {
      const isSafety = validation.failures.some((f) => f.layer === 'L3');
      lastFailure = {
        ok: false,
        outcome: isSafety ? 'safety_rejected' : 'schema_rejected',
        rules: validation.failures.map((f) => f.rule),
        detail: validation.failures.map((f) => `${f.rule}@${f.path}`).join(', '),
      };
      continue;
    }

    return {
      ok: true,
      outcome: 'generated',
      activity: validation.activity,
      promptTemplate,
      model: deps.provider.model,
      durationMs: generated.durationMs,
    };
  }

  return lastFailure;
}

// ---------------------------------------------------------------------------

function deriveAge(child: ChildConstraints, now: Date): number {
  const years = now.getUTCFullYear() - child.birthYear;
  const months = now.getUTCMonth() + 1 - child.birthMonth;
  return Math.max(0, months >= 0 ? years : years - 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Drop the note entirely if it trips any safety rule. Never "clean" it. */
function safeNoteOrUndefined(note: string | undefined): string | undefined {
  if (!note) return undefined;
  const failures = [...checkDenylist({ note }), ...checkForbiddenPatterns({ note })];
  return failures.length === 0 ? note : undefined;
}

/**
 * The envelope is built HERE, from validated constraints — the model supplies
 * only the payload and the presentation text. It cannot set its own age band,
 * difficulty, status, or provenance, so it cannot declare itself approved.
 */
function assembleEnvelope(
  content: unknown,
  ctx: {
    id: string;
    type: ActivityType;
    band: AgeBand;
    difficulty: number;
    grade: GradeLevel;
    interestSlugs: readonly string[];
    model: string;
    promptTemplate: PromptTemplate;
    now: Date;
  },
): unknown {
  const generated = (content ?? {}) as Record<string, unknown>;
  const iso = ctx.now.toISOString();

  return {
    schemaVersion: 1,
    id: ctx.id,
    slug: `ai-${ctx.type.replace(/_/g, '-')}-${ctx.id.slice(0, 8)}`,
    type: ctx.type,
    locale: 'vi',
    version: 1,
    title: generated.title,
    instructions: generated.instructions,
    audience: {
      minAge: ctx.band.minAge,
      maxAge: ctx.band.maxAge,
      gradeMin: ctx.grade,
      gradeMax: ctx.grade,
    },
    difficulty: ctx.difficulty,
    estimatedMinutes: 12,
    interestTags: ctx.interestSlugs,
    response: generated.response,
    printable: { supported: true, layout: 'prompt_card', pageEstimate: 1 },
    safety: {
      policyVersion: POLICY_VERSION,
      ageBand: ctx.band.key,
      // A human still has to look at it. The value here names the gate, and the
      // gate is the parent preview — nothing reaches a child on this alone.
      reviewedBy: 'pending-parent-preview',
      reviewedAt: iso,
      checks: ['L1', 'L2', 'L3'],
    },
    provenance: {
      source: 'ai',
      model: ctx.model,
      promptTemplateId: ctx.promptTemplate.id,
      promptTemplateVersion: ctx.promptTemplate.version,
      generatedAt: iso,
      // Deliberately absent until a parent approves. An activity without these
      // fails zod validation, so a draft cannot masquerade as approved.
    },
    status: 'draft',
    payload: generated.payload,
  };
}

/** JSON Schema for the model's structured output. Payload and text only. */
function outputSchemaFor(type: ActivityType): Record<string, unknown> {
  const base = {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'instructions', 'response', 'payload'],
    properties: {
      title: { type: 'string', minLength: 3, maxLength: 120 },
      instructions: { type: 'string', minLength: 10, maxLength: 600 },
      response: { type: 'object' },
      payload: { type: 'object' },
    },
  };
  return { ...base, description: `Hoạt động loại ${type}` };
}
