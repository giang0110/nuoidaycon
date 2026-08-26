'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient, requireParentId } from '@/lib/supabase/server';
import {
  createAssignmentRepository,
  createSubmissionRepository,
} from '@/lib/data/supabase/repositories';
import { activitySchema } from '@/lib/domain/activity/schema';
import { validateAnswers, autoScore } from '@/lib/domain/activity/submission';
import { sanitiseImage, buildStoragePath } from '@/lib/media/sanitise-image';
import { getMessages } from '@/lib/i18n';

const t = getMessages('vi');

export interface SubmitState {
  error?: string;
}

const MAX_ASSETS = 3;

/**
 * Submit a child's work.
 *
 * Everything is decided from the STORED SNAPSHOT, never from the request:
 *
 *  - answers are validated against the snapshot's response spec
 *  - multiple choice is scored against the snapshot's answer key, which the
 *    child's copy never contained (toChildView)
 *  - photos are decoded and RE-ENCODED SERVER-SIDE so EXIF cannot survive
 *
 * RLS constrains every write to this parent's own rows regardless.
 */
export async function submitAssignmentAction(
  assignmentId: string,
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const parentId = await requireParentId();
  const db = await createClient();

  const assignments = createAssignmentRepository(db);
  const assignment = await assignments.findById(assignmentId);
  if (!assignment) return { error: t.error.notFound };

  const parsedSnapshot = activitySchema.safeParse(assignment.contentSnapshot);
  if (!parsedSnapshot.success) return { error: t.error.generic };
  const activity = parsedSnapshot.data;

  const text: Record<string, string> = {};
  const choice: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== 'string') continue;
    if (key.startsWith('text.')) text[key.slice(5)] = value;
    if (key.startsWith('choice.')) choice[key.slice(7)] = value;
  }

  const validation = validateAnswers(activity, { text, choice });
  if (!validation.ok) return { error: validation.errors[0] ?? t.error.generic };

  const score = autoScore(activity, validation.answers);

  const submission = await createSubmissionRepository(db).create({
    assignmentId,
    answers: validation.answers,
    autoScore: score,
  });

  // --- photos ------------------------------------------------------------
  const photos = formData
    .getAll('photos')
    .filter((f): f is File => f instanceof File && f.size > 0);

  for (const [index, file] of photos.slice(0, MAX_ASSETS).entries()) {
    const raw = Buffer.from(await file.arrayBuffer());
    const clean = await sanitiseImage(raw, file.type);
    if (!clean.ok) return { error: t.play.photoRejected };

    const storagePath = buildStoragePath({
      parentId,
      childId: assignment.childId,
      submissionId: submission.id,
      index,
    });

    const { error: uploadError } = await db.storage
      .from('submissions')
      .upload(storagePath, clean.data, { contentType: clean.mimeType, upsert: true });
    if (uploadError) return { error: t.error.generic };

    await db.from('submission_assets').insert({
      submission_id: submission.id,
      storage_path: storagePath,
      mime_type: clean.mimeType,
      size_bytes: clean.bytes,
    });
  }

  await assignments.updateStatus(assignmentId, 'submitted');

  await db.from('audit_events').insert({
    actor_id: parentId,
    action: 'submit',
    subject_type: 'submission',
    subject_id: submission.id,
    metadata: { assignmentId },
  });

  revalidatePath('/play');
  redirect(`/play/${assignmentId}/done`);
}
