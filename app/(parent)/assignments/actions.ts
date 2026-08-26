'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient, requireParentId } from '@/lib/supabase/server';
import {
  createAssignmentRepository,
  createChildRepository,
  createProgressRepository,
  createSubmissionRepository,
} from '@/lib/data/supabase/repositories';
import { activitySchema } from '@/lib/domain/activity/schema';
import { applyReview } from '@/lib/domain/engine/adapt';
import { resolveBandForChild } from '@/lib/domain/policy/age';
import { getMessages } from '@/lib/i18n';

const t = getMessages('vi');

export interface ReviewState {
  error?: string;
}

const reviewSchema = z.object({
  verdict: z.enum(['too_easy', 'just_right', 'too_hard']),
  note: z.string().trim().max(2000).optional(),
});

/**
 * Record the parent's verdict and adapt the child's difficulty.
 *
 * The verdict is the parent's observation about the ACTIVITY ("hơi khó cho
 * con"), not a judgement of the child, and it only ever moves a
 * content-selection level. Adaptation is clamped to the age band, so it can
 * never push a child outside content approved for their age.
 */
export async function reviewAssignmentAction(
  assignmentId: string,
  _prev: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  const parentId = await requireParentId();

  const parsed = reviewSchema.safeParse({
    verdict: formData.get('verdict'),
    note: formData.get('note') ?? undefined,
  });
  if (!parsed.success) return { error: t.error.generic };

  const db = await createClient();
  const assignments = createAssignmentRepository(db);

  const assignment = await assignments.findById(assignmentId);
  if (!assignment) return { error: t.error.notFound };

  const child = await createChildRepository(db, parentId).findById(assignment.childId);
  if (!child) return { error: t.error.notFound };

  const snapshot = activitySchema.safeParse(assignment.contentSnapshot);
  if (!snapshot.success) return { error: t.error.generic };

  const { error: reviewError } = await db.from('assignment_reviews').insert({
    assignment_id: assignmentId,
    reviewer_id: parentId,
    verdict: parsed.data.verdict,
    note: parsed.data.note || null,
  });
  if (reviewError) return { error: t.error.generic };

  // --- close the adaptation loop ----------------------------------------
  const progressRepo = createProgressRepository(db);
  const progress = await progressRepo.listForChild(child.id);
  const current = progress.find((p) => p.type === snapshot.data.type);

  if (current) {
    const band = resolveBandForChild(child);
    await progressRepo.upsert(applyReview(current, parsed.data.verdict, band));
  }

  await assignments.updateStatus(assignmentId, 'reviewed');

  await db.from('audit_events').insert({
    actor_id: parentId,
    action: 'review',
    subject_type: 'assignment',
    subject_id: assignmentId,
    metadata: { verdict: parsed.data.verdict },
  });

  revalidatePath('/dashboard');
  revalidatePath(`/children/${child.id}`);
  return {};
}

/**
 * Delete a child's submission and its photos.
 *
 * An approved parent capability (Phase 0 §3). Assets cascade in the database;
 * the Storage objects are removed explicitly, because a row disappearing does
 * not delete a file.
 */
export async function deleteSubmissionAction(formData: FormData): Promise<void> {
  const parentId = await requireParentId();
  const assignmentId = String(formData.get('assignmentId') ?? '');
  if (!assignmentId) return;

  const db = await createClient();
  const submissions = createSubmissionRepository(db);
  const submission = await submissions.findByAssignment(assignmentId);
  if (!submission) return;

  const { data: assets } = await db
    .from('submission_assets')
    .select('storage_path')
    .eq('submission_id', submission.id);

  const paths = (assets ?? []).map((a) => (a as { storage_path: string }).storage_path);
  if (paths.length > 0) {
    await db.storage.from('submissions').remove(paths);
  }

  await submissions.delete(submission.id);

  await db.from('audit_events').insert({
    actor_id: parentId,
    action: 'delete_submission',
    subject_type: 'submission',
    subject_id: submission.id,
    metadata: { assignmentId, assetCount: paths.length },
  });

  revalidatePath(`/assignments/${assignmentId}`);
  redirect('/dashboard');
}

/** Flag content for review. Archiving a template never alters existing snapshots. */
export async function reportContentAction(formData: FormData): Promise<void> {
  const parentId = await requireParentId();
  const templateId = String(formData.get('templateId') ?? '');
  const reason = String(formData.get('reason') ?? 'other');
  const assignmentId = String(formData.get('assignmentId') ?? '') || null;
  if (!templateId) return;

  const db = await createClient();
  await db.from('content_reports').insert({
    reporter_id: parentId,
    template_id: templateId,
    assignment_id: assignmentId,
    reason,
    details: String(formData.get('details') ?? '').slice(0, 2000) || null,
  });

  revalidatePath(`/assignments/${assignmentId ?? ''}`);
}
