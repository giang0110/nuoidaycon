'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, requireParentId } from '@/lib/supabase/server';
import {
  createAssignmentRepository,
  createChildRepository,
  createProgressRepository,
  createTemplateRepository,
} from '@/lib/data/supabase/repositories';
import { validateActivity } from '@/lib/domain/activity/validate';
import { assertAssignable, NotAssignableError } from '@/lib/domain/activity/assignable';
import { getMessages } from '@/lib/i18n';

const t = getMessages('vi');

export interface AssignState {
  error?: string;
}

const inputSchema = z.object({
  childId: z.string().uuid(),
  templateId: z.string().uuid(),
});

/**
 * Assign one activity to one child.
 *
 * The single assignment path in the product, and therefore the single place
 * `assertAssignable` runs. Order matters:
 *
 *   1. verify the session      → who is acting
 *   2. verify child ownership  → RLS would refuse anyway; belt and braces
 *   3. re-validate L1–L3       → the catalog is only as good as its last check
 *   4. assertAssignable        → runtime gate (defence in depth layer 2)
 *   5. deep-copy the snapshot  → immutable from here (decision A5)
 */
export async function assignActivityAction(
  _prev: AssignState,
  formData: FormData,
): Promise<AssignState> {
  const parentId = await requireParentId();

  const parsed = inputSchema.safeParse({
    childId: formData.get('childId'),
    templateId: formData.get('templateId'),
  });
  if (!parsed.success) return { error: t.error.generic };

  const db = await createClient();
  const children = createChildRepository(db, parentId);
  const child = await children.findById(parsed.data.childId);
  if (!child) return { error: t.error.notFound };

  const template = await createTemplateRepository(db).findById(parsed.data.templateId);
  if (!template) return { error: t.error.notFound };

  const validation = validateActivity(template.payload);
  if (!validation.ok) {
    // Content that no longer passes its own safety checks is never assigned.
    return { error: t.assign.contentUnavailable };
  }

  try {
    assertAssignable(validation.activity, { actingParentId: parentId });
  } catch (error) {
    if (error instanceof NotAssignableError) return { error: t.assign.contentUnavailable };
    throw error;
  }

  const progress = await createProgressRepository(db).listForChild(child.id);
  const current = progress.find((p) => p.type === validation.activity.type);

  const assignment = await createAssignmentRepository(db).create({
    childId: child.id,
    templateId: template.id,
    assignedBy: parentId,
    difficultyAtAssignment: current?.difficulty ?? validation.activity.difficulty,
    // A deep copy, so nothing shares a reference with the template row.
    contentSnapshot: structuredClone(validation.activity),
    snapshotSchemaVersion: validation.activity.schemaVersion,
  });

  await db.from('audit_events').insert({
    actor_id: parentId,
    action: 'assign',
    subject_type: 'assignment',
    subject_id: assignment.id,
    metadata: { templateId: template.id, childId: child.id },
  });

  revalidatePath('/dashboard');
  redirect(`/children/${child.id}`);
}
