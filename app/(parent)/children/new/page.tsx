import { createClient, requireParentId } from '@/lib/supabase/server';
import { createInterestRepository } from '@/lib/data/supabase/repositories';
import { ChildForm } from '@/components/child-form';
import { createChildAction } from '../actions';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default async function NewChildPage() {
  const t = getMessages(DEFAULT_LOCALE);
  await requireParentId();
  const db = await createClient();
  const interests = await createInterestRepository(db).listAll();

  return (
    <>
      <h1 className="text-2xl font-semibold">{t.child.addFirst}</h1>
      <ChildForm
        action={createChildAction}
        submitLabel={t.child.create}
        interests={interests.map((i) => ({ id: i.id, label: i.labelVi }))}
      />
    </>
  );
}
