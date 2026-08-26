'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { createClient, requireParentId } from '@/lib/supabase/server';
import { createChildRepository, createProgressRepository } from '@/lib/data/supabase/repositories';
import { runGenerationPipeline, generationRequestSchema } from '@/lib/ai/pipeline';
import { createAnthropicProvider } from '@/lib/ai/anthropic-provider';
import { isGenerationEnabled } from '@/lib/ai/limits';
import { getAiConfig } from '@/lib/ai/config';
import { validateActivity } from '@/lib/domain/activity/validate';
import { getMessages } from '@/lib/i18n';

const t = getMessages('vi');

export interface GenerateState {
  error?: string;
  draftId?: string;
}

/**
 * Stages 1-6, then persist as a DRAFT owned by this parent.
 *
 * Nothing here can produce approved content: the pipeline never sets an
 * approver, the RLS insert policy requires `status = 'draft'`, and the check
 * constraint refuses approved AI rows without one. Three layers, same rule.
 */
export async function generateDraftAction(
  _prev: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  const parentId = await requireParentId();
  const config = getAiConfig();

  if (!isGenerationEnabled(config.env)) return { error: t.ai.disabled };

  const parsed = generationRequestSchema.safeParse({
    childId: formData.get('childId'),
    type: formData.get('type'),
    interestSlugs: formData
      .getAll('interestSlugs')
      .filter((v): v is string => typeof v === 'string'),
    note: formData.get('note') || undefined,
  });
  if (!parsed.success) return { error: t.error.generic };

  const db = await createClient();
  const child = await createChildRepository(db, parentId).findById(parsed.data.childId);
  if (!child) return { error: t.error.notFound };

  const progress = await createProgressRepository(db).listForChild(child.id);
  const current = progress.find((p) => p.type === parsed.data.type);

  // Usage is counted from the audit table, so the caps survive a restart.
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { data: events } = await db
    .from('ai_generation_events')
    .select('created_at')
    .eq('parent_id', parentId)
    .gte('created_at', since);

  const rows = (events ?? []) as { created_at: string }[];
  const usage = {
    parentToday: rows.length,
    parentLastHour: rows.filter((r) => r.created_at >= hourAgo).length,
    globalToday: 0,
  };

  const result = await runGenerationPipeline(
    parsed.data,
    {
      birthYear: child.birthYear,
      birthMonth: child.birthMonth,
      grade: child.grade,
      difficulty: current?.difficulty ?? 1,
    },
    {
      provider: createAnthropicProvider(),
      usage,
      generationEnabled: true,
      now: new Date(),
      newId: () => randomUUID(),
    },
  );

  // Every attempt is recorded, including failures — rule ids only, never content.
  await db.from('ai_generation_events').insert({
    parent_id: parentId,
    child_id: child.id,
    activity_type: parsed.data.type,
    age_band: result.ok ? result.activity.safety.ageBand : 'unknown',
    prompt_template_id: result.ok ? result.promptTemplate.id : 'n/a',
    prompt_template_version: result.ok ? result.promptTemplate.version : 'n/a',
    model: result.ok ? result.model : config.model,
    outcome: result.ok ? 'generated' : result.outcome,
    failure_rules: result.ok ? [] : result.rules,
    duration_ms: result.ok ? result.durationMs : null,
  });

  if (!result.ok) {
    return { error: result.outcome === 'rate_limited' ? t.ai.rateLimited : t.ai.unavailable };
  }

  const activity = result.activity;
  const { data: inserted, error } = await db
    .from('activity_templates')
    .insert({
      id: activity.id,
      slug: activity.slug,
      type: activity.type,
      locale: activity.locale,
      title: activity.title,
      instructions: activity.instructions,
      min_age: activity.audience.minAge,
      max_age: activity.audience.maxAge,
      grade_min: activity.audience.gradeMin,
      grade_max: activity.audience.gradeMax,
      difficulty: activity.difficulty,
      estimated_minutes: activity.estimatedMinutes,
      interest_tags: activity.interestTags,
      response_mode: activity.response.mode,
      payload: activity,
      status: 'draft',
      source: 'ai',
      owner_id: parentId,
      schema_version: activity.schemaVersion,
      policy_version: activity.safety.policyVersion,
      provenance: activity.provenance,
    })
    .select('id')
    .single();

  if (error) return { error: t.error.generic };

  revalidatePath('/ai');
  return { draftId: (inserted as { id: string }).id };
}

/**
 * Stage 7 → 8: the parent approves. THE ONLY PLACE approval happens.
 *
 * There is no auto-approve, no bulk approve, no "trusted parent" bypass
 * (invariant AI3). The approver is taken from the verified session, and the
 * RLS update policy independently requires it to match.
 */
export async function approveDraftAction(formData: FormData): Promise<void> {
  const parentId = await requireParentId();
  const draftId = String(formData.get('draftId') ?? '');
  if (!draftId) return;

  const db = await createClient();
  const { data: row } = await db
    .from('activity_templates')
    .select('payload')
    .eq('id', draftId)
    .eq('owner_id', parentId)
    .maybeSingle();
  if (!row) return;

  const now = new Date().toISOString();
  const draft = (row as { payload: Record<string, unknown> }).payload;

  // Re-validate at approval, with the approval fields filled in. A draft that
  // no longer passes L1-L3 cannot be approved.
  const approved = {
    ...draft,
    status: 'approved',
    safety: { ...(draft.safety as object), reviewedBy: `parent:${parentId}`, reviewedAt: now },
    provenance: {
      ...(draft.provenance as object),
      approvedByParentId: parentId,
      approvedAt: now,
    },
  };

  const validation = validateActivity(approved);
  if (!validation.ok) return;

  await db
    .from('activity_templates')
    .update({
      status: 'approved',
      approved_by_parent_id: parentId,
      payload: validation.activity,
      provenance: validation.activity.provenance,
    })
    .eq('id', draftId)
    .eq('owner_id', parentId);

  await db.from('ai_generation_events').insert({
    parent_id: parentId,
    activity_type: validation.activity.type,
    age_band: validation.activity.safety.ageBand,
    prompt_template_id:
      validation.activity.provenance.source === 'ai'
        ? validation.activity.provenance.promptTemplateId
        : 'n/a',
    prompt_template_version:
      validation.activity.provenance.source === 'ai'
        ? validation.activity.provenance.promptTemplateVersion
        : 'n/a',
    model:
      validation.activity.provenance.source === 'ai' ? validation.activity.provenance.model : 'n/a',
    outcome: 'approved',
  });

  revalidatePath('/ai');
}

export async function discardDraftAction(formData: FormData): Promise<void> {
  const parentId = await requireParentId();
  const draftId = String(formData.get('draftId') ?? '');
  if (!draftId) return;

  const db = await createClient();
  await db.from('activity_templates').delete().eq('id', draftId).eq('owner_id', parentId);
  revalidatePath('/ai');
}
