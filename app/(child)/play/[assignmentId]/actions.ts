'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient, requireParentId } from '@/lib/supabase/server';
import {
  createAssignmentRepository,
  createSubmissionRepository,
} from '@/lib/data/supabase/repositories';
import { sanitiseImage } from '@/lib/media/sanitise-image';
import { runSubmission, MAX_ASSETS, type SubmitPorts } from '@/lib/submissions/submit-flow';
import { getMessages } from '@/lib/i18n';

const t = getMessages('vi');

export interface SubmitState {
  error?: string;
}

/**
 * Submit a child's work.
 *
 * This is an adapter and nothing more: it reads the form, binds the Supabase
 * client into ports, and turns the flow's outcome into a redirect or a
 * message. The rules — idempotency, retry reuse, ordering — live in
 * lib/submissions/submit-flow.ts, where they are unit tested.
 *
 * RLS constrains every write below to this parent's own rows regardless.
 */
export async function submitAssignmentAction(
  assignmentId: string,
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const parentId = await requireParentId();
  const db = await createClient();

  const assignments = createAssignmentRepository(db);
  const submissions = createSubmissionRepository(db);

  const text: Record<string, string> = {};
  const choice: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== 'string') continue;
    if (key.startsWith('text.')) text[key.slice(5)] = value;
    if (key.startsWith('choice.')) choice[key.slice(7)] = value;
  }

  const files = formData
    .getAll('photos')
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_ASSETS);

  const photos = await Promise.all(
    files.map(async (file) => ({
      bytes: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type,
    })),
  );

  const ports: SubmitPorts = {
    parentId,

    async findAssignment(id) {
      const assignment = await assignments.findById(id);
      return assignment
        ? {
            id: assignment.id,
            childId: assignment.childId,
            status: assignment.status,
            contentSnapshot: assignment.contentSnapshot,
          }
        : null;
    },

    async upsertSubmission(input) {
      const submission = await submissions.upsertByAssignment(input);
      return { id: submission.id };
    },

    async listAssetPaths(submissionId) {
      const { data, error } = await db
        .from('submission_assets')
        .select('storage_path')
        .eq('submission_id', submissionId);
      if (error) throw new Error(`submission_assets.list: ${error.message}`);
      return (data ?? []).map((row) => row.storage_path as string);
    },

    async replaceAssets(submissionId, rows) {
      // Replace rather than append: the request carries the complete set of
      // photos for this submission, so a retry must not stack a second copy.
      const { error: deleteError } = await db
        .from('submission_assets')
        .delete()
        .eq('submission_id', submissionId);
      if (deleteError) throw new Error(`submission_assets.delete: ${deleteError.message}`);

      if (rows.length === 0) return;
      const { error: insertError } = await db.from('submission_assets').insert(
        rows.map((row) => ({
          submission_id: submissionId,
          storage_path: row.storagePath,
          mime_type: row.mimeType,
          size_bytes: row.sizeBytes,
        })),
      );
      if (insertError) throw new Error(`submission_assets.insert: ${insertError.message}`);
    },

    sanitise: sanitiseImage,

    async upload(storagePath, data, mimeType) {
      const { error } = await db.storage
        .from('submissions')
        // upsert, because the path is deterministic and a retry rewrites the
        // same object instead of leaving the previous one orphaned.
        .upload(storagePath, data, { contentType: mimeType, upsert: true });
      return error ? { ok: false, message: error.message } : { ok: true };
    },

    async removeObjects(storagePaths) {
      await db.storage.from('submissions').remove(storagePaths);
    },

    async markSubmitted(id) {
      await assignments.updateStatus(id, 'submitted');
    },

    async appendAudit(event) {
      await db.from('audit_events').insert({
        actor_id: event.actorId,
        action: event.action,
        subject_type: event.subjectType,
        subject_id: event.subjectId,
        metadata: event.metadata,
      });
    },
  };

  const outcome = await runSubmission(ports, {
    assignmentId,
    answers: { text, choice },
    photos,
  });

  if (outcome.status === 'error') {
    return { error: errorMessageFor(outcome) };
  }

  /**
   * Both a fresh submission and a repeat of a finished one land on the same
   * screen. From the child's side there is no difference worth showing: the
   * work is in, and a second tap should feel like the first one worked.
   */
  revalidatePath('/play');
  redirect(`/play/${assignmentId}/done`);
}

/**
 * The flow returns a closed set of reasons, never a database message, so this
 * mapping is total and nothing raw can slip through it.
 */
function errorMessageFor(outcome: { reason: string; messages?: string[] }): string {
  switch (outcome.reason) {
    case 'not_found':
      return t.error.notFound;
    case 'invalid_answers':
      return outcome.messages?.[0] ?? t.error.generic;
    case 'photo_rejected':
    case 'storage_failed':
      return t.play.photoRejected;
    default:
      return t.error.generic;
  }
}
