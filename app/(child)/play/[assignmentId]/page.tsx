import { notFound, redirect } from 'next/navigation';
import { createClient, requireParentId } from '@/lib/supabase/server';
import { createAssignmentRepository } from '@/lib/data/supabase/repositories';
import { activitySchema } from '@/lib/domain/activity/schema';
import { toChildView } from '@/lib/domain/activity/child-view';
import { ActivityPlayer } from '@/components/activity-player';
import { isChildModeUnlocked } from '../actions';
import { submitAssignmentAction } from './actions';

export default async function PlayActivityPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  await requireParentId();
  if (!(await isChildModeUnlocked())) redirect('/play');

  const db = await createClient();
  const assignment = await createAssignmentRepository(db).findById(assignmentId);
  if (!assignment) notFound();

  const parsed = activitySchema.safeParse(assignment.contentSnapshot);
  if (!parsed.success) notFound();

  /**
   * The projection happens HERE, on the server. Only `childView` crosses into
   * the client bundle, so answer keys, rationales, exemplars and option
   * feedback never appear in a network response the child could read
   * (decision A12).
   */
  const childView = toChildView(parsed.data);
  const action = submitAssignmentAction.bind(null, assignmentId);

  return (
    <ActivityPlayer activity={childView} action={action} printHref={`/print/${assignmentId}`} />
  );
}
