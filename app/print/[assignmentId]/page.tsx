import { notFound } from 'next/navigation';
import { createClient, requireParentId } from '@/lib/supabase/server';
import {
  createAssignmentRepository,
  createChildRepository,
} from '@/lib/data/supabase/repositories';
import { activitySchema } from '@/lib/domain/activity/schema';
import { toChildView } from '@/lib/domain/activity/child-view';
import { Worksheet } from '@/components/worksheet';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default async function PrintAssignmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ answers?: string }>;
}) {
  const t = getMessages(DEFAULT_LOCALE);
  const { assignmentId } = await params;
  const { answers } = await searchParams;
  const parentId = await requireParentId();

  const db = await createClient();
  const assignment = await createAssignmentRepository(db).findById(assignmentId);
  if (!assignment) notFound();

  const parsed = activitySchema.safeParse(assignment.contentSnapshot);
  if (!parsed.success) notFound();

  const child = await createChildRepository(db, parentId).findById(assignment.childId);

  /**
   * The child's sheet is printed from the SAME projection the screen uses, so
   * a printed worksheet can no more carry an answer key than the player can.
   * The parent answer sheet is an explicit, separately requested variant.
   */
  const wantsAnswers = answers === '1';
  const childView = toChildView(parsed.data);

  return (
    <>
      <Worksheet activity={childView} childName={child?.displayName ?? ''} />

      {wantsAnswers && parsed.data.type === 'story_comprehension' && (
        <article className="sheet" style={{ pageBreakBefore: 'always' }}>
          <header className="sheet__header">
            <h1 className="sheet__title">{t.print.answerSheet}</h1>
            <span className="sheet__meta">{parsed.data.title}</span>
          </header>
          {parsed.data.payload.questions.map((q, index) => (
            <section key={q.id} className="sheet__section">
              <p className="sheet__question">
                {index + 1}. {q.prompt}
              </p>
              <p className="sheet__question">
                {q.kind === 'multiple_choice'
                  ? `→ ${q.choices.find((c) => c.id === q.answerKey)?.text} — ${q.rationale}`
                  : `→ ${q.exemplarAnswer}`}
              </p>
            </section>
          ))}
        </article>
      )}

      <p className="print-hint">{t.print.hint}</p>
    </>
  );
}
