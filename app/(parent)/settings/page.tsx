import { createClient, requireParentId } from '@/lib/supabase/server';
import { createParentRepository } from '@/lib/data/supabase/repositories';
import { logOutAction } from '@/app/(auth)/actions';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default async function SettingsPage() {
  const t = getMessages(DEFAULT_LOCALE);
  const parentId = await requireParentId();
  const db = await createClient();
  const parent = await createParentRepository(db).findById(parentId);

  return (
    <>
      <h1 className="text-2xl font-semibold">{t.settings.title}</h1>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">{t.settings.account}</h2>
        <p className="text-parent-muted text-sm">{parent?.displayName}</p>
      </section>
      <form action={logOutAction}>
        <button type="submit" className="text-parent-muted text-sm underline">
          {t.auth.logOut}
        </button>
      </form>
    </>
  );
}
