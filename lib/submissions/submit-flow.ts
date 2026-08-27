/**
 * The submission flow, expressed against ports rather than Supabase.
 *
 * This exists because `submissions.assignment_id` is UNIQUE and the original
 * action inserted unconditionally, so a second submit — a refresh, a back
 * button, a retry after a photo failed — reached the child as
 * `duplicate key value violates unique constraint "submissions_assignment_id_key"`.
 *
 * Two rules follow from that constraint and are enforced here:
 *
 *  1. An assignment that is already `submitted` or `reviewed` is DONE. A repeat
 *     submit is a no-op that routes to the result screen. Nothing is decoded,
 *     uploaded, or written.
 *
 *  2. An assignment still in flight may have a half-finished submission behind
 *     it. A retry REUSES that row (INSERT ... ON CONFLICT DO UPDATE) instead of
 *     racing the constraint, and rewrites its assets rather than appending to
 *     them.
 *
 * The outcome type is a closed union carrying no free-form text except the
 * domain's own validation messages, so a Postgres error cannot reach the UI
 * even if a port throws one — see `classifyThrow`.
 */
import type { AssignmentStatus } from '@/lib/domain/entities';
import { activitySchema } from '@/lib/domain/activity/schema';
import { validateAnswers, autoScore } from '@/lib/domain/activity/submission';
import type { SanitiseResult } from '@/lib/media/sanitise-image';
import { buildStoragePath } from '@/lib/media/sanitise-image';

/** Statuses that mean "the child has finished; do not submit again". */
const COMPLETED_STATUSES: readonly AssignmentStatus[] = ['submitted', 'reviewed'];

/** The player renders one file input, but a modified client could send more. */
export const MAX_ASSETS = 3;

export interface SubmitPorts {
  parentId: string;

  findAssignment(assignmentId: string): Promise<{
    id: string;
    childId: string;
    status: AssignmentStatus;
    contentSnapshot: unknown;
  } | null>;

  /**
   * Get-or-create, atomically. The implementation must be a single
   * `INSERT ... ON CONFLICT (assignment_id) DO UPDATE` so two concurrent
   * submits cannot both insert — a read-then-insert would still race.
   */
  upsertSubmission(input: {
    assignmentId: string;
    answers: unknown;
    autoScore: unknown;
  }): Promise<{ id: string }>;

  listAssetPaths(submissionId: string): Promise<string[]>;

  /** Replace this submission's asset rows with exactly `rows`. */
  replaceAssets(
    submissionId: string,
    rows: { storagePath: string; mimeType: string; sizeBytes: number }[],
  ): Promise<void>;

  sanitise(raw: Buffer, declaredMime: string): Promise<SanitiseResult>;

  upload(
    storagePath: string,
    data: Buffer,
    mimeType: string,
  ): Promise<{ ok: true } | { ok: false; message: string }>;

  removeObjects(storagePaths: string[]): Promise<void>;

  markSubmitted(assignmentId: string): Promise<void>;

  appendAudit(event: {
    actorId: string;
    action: string;
    subjectType: string;
    subjectId: string | null;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

export interface SubmitInput {
  assignmentId: string;
  answers: { text: Record<string, string>; choice: Record<string, string> };
  photos: { bytes: Buffer; mimeType: string }[];
}

/**
 * Deliberately a closed union. `invalid_answers` is the only member that
 * carries text, and that text comes from the pure domain validator — there is
 * no shape in which a database message could be returned.
 */
export type SubmitOutcome =
  | { status: 'submitted'; submissionId: string }
  | { status: 'already_submitted' }
  | { status: 'error'; reason: 'invalid_answers'; messages: string[] }
  | {
      status: 'error';
      reason: 'not_found' | 'invalid_snapshot' | 'photo_rejected' | 'storage_failed' | 'unexpected';
    };

/**
 * A throw from a port is either the unique-constraint race or something we do
 * not understand. Both collapse to a safe outcome; neither is forwarded.
 *
 * The race: two submits pass the completed-status check together, and one
 * loses. Losing means the work is already recorded, so the honest answer to
 * the loser is "already submitted".
 */
function classifyThrow(error: unknown): SubmitOutcome {
  const message = error instanceof Error ? error.message : '';
  const isUniqueViolation =
    message.includes('submissions_assignment_id_key') ||
    (message.includes('duplicate key') && message.includes('submissions'));
  return isUniqueViolation
    ? { status: 'already_submitted' }
    : { status: 'error', reason: 'unexpected' };
}

export async function runSubmission(
  ports: SubmitPorts,
  input: SubmitInput,
): Promise<SubmitOutcome> {
  const assignment = await ports.findAssignment(input.assignmentId);
  if (!assignment) return { status: 'error', reason: 'not_found' };

  /**
   * The idempotency gate. It comes FIRST — before parsing, decoding or
   * uploading — so a double-tap costs one indexed read rather than a re-run of
   * the whole pipeline against work that is already finished.
   */
  if (COMPLETED_STATUSES.includes(assignment.status)) {
    return { status: 'already_submitted' };
  }

  const parsedSnapshot = activitySchema.safeParse(assignment.contentSnapshot);
  if (!parsedSnapshot.success) return { status: 'error', reason: 'invalid_snapshot' };
  const activity = parsedSnapshot.data;

  // Everything is decided from the STORED SNAPSHOT, never from the request.
  const validation = validateAnswers(activity, input.answers);
  if (!validation.ok) {
    return { status: 'error', reason: 'invalid_answers', messages: validation.errors };
  }
  const score = autoScore(activity, validation.answers);

  let submissionId: string;
  try {
    const submission = await ports.upsertSubmission({
      assignmentId: input.assignmentId,
      answers: validation.answers,
      autoScore: score,
    });
    submissionId = submission.id;
  } catch (error) {
    return classifyThrow(error);
  }

  try {
    const photoOutcome = await writePhotos(ports, {
      submissionId,
      childId: assignment.childId,
      photos: input.photos,
    });
    if (photoOutcome) return photoOutcome;

    await ports.markSubmitted(input.assignmentId);
    await ports.appendAudit({
      actorId: ports.parentId,
      action: 'submit',
      subjectType: 'submission',
      subjectId: submissionId,
      metadata: { assignmentId: input.assignmentId },
    });
  } catch (error) {
    return classifyThrow(error);
  }

  return { status: 'submitted', submissionId };
}

/**
 * Sanitise, upload and record the photos. Returns an outcome on failure and
 * `null` on success.
 *
 * The paths are deterministic — `{parent}/{child}/{submission}/{index}.jpg` —
 * and the submission id is now stable across retries, so re-uploading index 0
 * OVERWRITES the previous object instead of leaving a second one behind. The
 * asset rows are then replaced wholesale rather than appended, which is what
 * keeps a retry from duplicating them.
 *
 * A request carrying no photos leaves existing assets untouched. The file
 * input is empty on every fresh page load, so treating "no photo attached" as
 * "delete the photo" would silently destroy the child's work on a retry that
 * was only meant to fix a typo.
 */
async function writePhotos(
  ports: SubmitPorts,
  args: { submissionId: string; childId: string; photos: SubmitInput['photos'] },
): Promise<SubmitOutcome | null> {
  const photos = args.photos.slice(0, MAX_ASSETS);
  if (photos.length === 0) return null;

  const rows: { storagePath: string; mimeType: string; sizeBytes: number }[] = [];

  for (const [index, photo] of photos.entries()) {
    // Decode and re-encode on the server: EXIF (which carries GPS) cannot
    // survive this, and the client is never trusted to have stripped it.
    const clean = await ports.sanitise(photo.bytes, photo.mimeType);
    if (!clean.ok) return { status: 'error', reason: 'photo_rejected' };

    const storagePath = buildStoragePath({
      parentId: ports.parentId,
      childId: args.childId,
      submissionId: args.submissionId,
      index,
    });

    const uploaded = await ports.upload(storagePath, clean.data, clean.mimeType);
    if (!uploaded.ok) return { status: 'error', reason: 'storage_failed' };

    rows.push({ storagePath, mimeType: clean.mimeType, sizeBytes: clean.bytes });
  }

  const previousPaths = await ports.listAssetPaths(args.submissionId);
  await ports.replaceAssets(args.submissionId, rows);

  /**
   * A retry with fewer photos than the first attempt leaves the tail objects
   * (index 1, 2…) with no row pointing at them. Nothing would ever read them
   * again and nothing would ever delete them, so they go now.
   */
  const written = new Set(rows.map((r) => r.storagePath));
  const orphaned = previousPaths.filter((p) => !written.has(p));
  if (orphaned.length > 0) await ports.removeObjects(orphaned);

  return null;
}
