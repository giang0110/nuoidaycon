import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient, requireParentId } from '@/lib/supabase/server';
import {
  createAssignmentRepository,
  createSubmissionRepository,
} from '@/lib/data/supabase/repositories';
import { activitySchema } from '@/lib/domain/activity/schema';
import type { AutoScore, SubmissionAnswers } from '@/lib/domain/activity/submission';
import { ActivityPreview } from '@/components/activity-preview';
import { ReviewForm } from '@/components/review-form';
import { reviewAssignmentAction, deleteSubmissionAction } from '../actions';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

/** Short-lived: a photo of a child's work should not be linkable for long. */
const SIGNED_URL_TTL_SECONDS = 300;

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const t = getMessages(DEFAULT_LOCALE);
  const { assignmentId } = await params;
  await requireParentId();

  const db = await createClient();
  const assignment = await createAssignmentRepository(db).findById(assignmentId);
  if (!assignment) notFound();

  const snapshot = activitySchema.safeParse(assignment.contentSnapshot);
  if (!snapshot.success) notFound();
  const activity = snapshot.data;

  const submission = await createSubmissionRepository(db).findByAssignment(assignmentId);
  const answers = (submission?.answers ?? { text: {}, choice: {} }) as SubmissionAnswers;
  const score = (submission?.autoScore ?? null) as AutoScore | null;

  const { data: reviewRow } = await db
    .from('assignment_reviews')
    .select('verdict, note')
    .eq('assignment_id', assignmentId)
    .maybeSingle();
  const existingReview = reviewRow as { verdict: string; note: string | null } | null;

  // Photos: private bucket, signed on demand, never a public URL (decision A10).
  const { data: assetRows } = await db
    .from('submission_assets')
    .select('id, storage_path')
    .eq('submission_id', submission?.id ?? '00000000-0000-0000-0000-000000000000');

  const photos: { id: string; url: string }[] = [];
  for (const row of (assetRows ?? []) as { id: string; storage_path: string }[]) {
    const { data } = await db.storage
      .from('submissions')
      .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
    if (data?.signedUrl) photos.push({ id: row.id, url: data.signedUrl });
  }

  const action = reviewAssignmentAction.bind(null, assignmentId);

  return (
    <>
      <Link href={`/children/${assignment.childId}`} className="text-parent-muted text-sm">
        ← {t.review.title}
      </Link>

      <section className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">{activity.title}</h1>
        {existingReview && <p className="text-feedback-positive text-sm">✓ {t.review.reviewed}</p>}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium">{t.review.childAnswer}</h2>

        {!submission ? (
          <p className="text-parent-muted">{t.review.noSubmission}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Score is shown to the PARENT only; the child saw encouragement. */}
            {score && (
              <p className="text-sm">
                {t.review.score}: {score.correct}/{score.total}
              </p>
            )}

            {activity.type === 'story_comprehension' &&
              activity.payload.questions.map((q) => {
                const chosen = answers.choice[q.id];
                const text = answers.text[q.id];
                return (
                  <div key={q.id} className="flex flex-col gap-1">
                    <p className="font-medium">{q.prompt}</p>
                    {q.kind === 'multiple_choice' ? (
                      <p className="text-sm">
                        {q.choices.find((c) => c.id === chosen)?.text ?? '—'}{' '}
                        <span
                          className={
                            chosen === q.answerKey ? 'text-feedback-positive' : 'text-parent-muted'
                          }
                        >
                          ({chosen === q.answerKey ? t.review.correct : t.review.incorrect})
                        </span>
                      </p>
                    ) : (
                      <p className="text-parent-muted text-sm text-pretty">{text ?? '—'}</p>
                    )}
                  </div>
                );
              })}

            {Object.entries(answers.text)
              .filter(([key]) => activity.type !== 'story_comprehension' || !key.startsWith('q'))
              .map(([key, value]) => (
                <p key={key} className="text-pretty">
                  {value}
                </p>
              ))}

            {photos.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-medium">{t.review.photos}</h3>
                <div className="flex flex-wrap gap-3">
                  {photos.map((photo) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={photo.id}
                      src={photo.url}
                      alt={t.review.photos}
                      className="border-parent-border max-h-72 rounded-xl border"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <ReviewForm action={action} existingVerdict={existingReview?.verdict ?? null} />
      </section>

      <details className="flex flex-col gap-3">
        <summary className="text-parent-muted cursor-pointer text-sm">{t.review.assigned}</summary>
        <div className="pt-4">
          <ActivityPreview activity={activity} />
        </div>
      </details>

      {submission && (
        <form action={deleteSubmissionAction}>
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <button type="submit" className="text-parent-muted text-sm underline">
            {t.review.deleteSubmission}
          </button>
        </form>
      )}
    </>
  );
}
