import { notFound } from 'next/navigation';
import { createClient, requireParentId } from '@/lib/supabase/server';
import { createChildRepository, createInterestRepository } from '@/lib/data/supabase/repositories';
import { ChildForm } from '@/components/child-form';
import { updateChildAction } from '../../actions';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default async function EditChildPage({ params }: { params: Promise<{ childId: string }> }) {
  const t = getMessages(DEFAULT_LOCALE);
  const { childId } = await params;
  const parentId = await requireParentId();
  const db = await createClient();

  const child = await createChildRepository(db, parentId).findById(childId);
  if (!child) notFound();

  const interestRepo = createInterestRepository(db);
  const [all, mine] = await Promise.all([
    interestRepo.listAll(),
    interestRepo.listForChild(childId),
  ]);

  const action = updateChildAction.bind(null, childId);

  return (
    <>
      <h1 className="text-2xl font-semibold">{t.child.edit}</h1>
      <ChildForm
        action={action}
        submitLabel={t.common.save}
        interests={all.map((i) => ({ id: i.id, label: i.labelVi }))}
        defaults={{
          displayName: child.displayName,
          birthYear: child.birthYear,
          birthMonth: child.birthMonth,
          grade: child.grade,
          avatarKey: child.avatarKey,
          interestIds: mine.map((i) => i.id),
        }}
      />
    </>
  );
}
