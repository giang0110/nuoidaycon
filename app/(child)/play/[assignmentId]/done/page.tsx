import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient, requireParentId } from '@/lib/supabase/server';
import {
  createAssignmentRepository,
  createSubmissionRepository,
} from '@/lib/data/supabase/repositories';
import { encouragementFor } from '@/lib/domain/activity/submission';
import type { AutoScore } from '@/lib/domain/activity/submission';
import { isChildModeUnlocked } from '../../actions';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default async function DonePage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const t = getMessages(DEFAULT_LOCALE);
  const { assignmentId } = await params;
  await requireParentId();
  if (!(await isChildModeUnlocked())) redirect('/play');

  const db = await createClient();
  const assignment = await createAssignmentRepository(db).findById(assignmentId);
  if (!assignment) notFound();

  const submission = await createSubmissionRepository(db).findByAssignment(assignmentId);

  /**
   * The child sees ENCOURAGEMENT, never a score (open question Q8, principle
   * P6). The parent sees the score on the review screen.
   */
  const message = encouragementFor((submission?.autoScore as AutoScore | null) ?? null);

  return (
    <section className="flex flex-1 flex-col items-start justify-center gap-6">
      <p className="text-5xl" aria-hidden>
        🌿
      </p>
      <h1 className="text-2xl font-semibold">{t.play.finishedTitle}</h1>
      <p className="text-xl text-pretty">{message}</p>
      <Link
        href={`/play?childId=${assignment.childId}`}
        className="bg-child-accent min-h-14 rounded-xl px-8 py-4 text-lg font-medium text-white"
      >
        {t.play.backToList}
      </Link>
    </section>
  );
}
