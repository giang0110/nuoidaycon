import { createClient, requireParentId } from '@/lib/supabase/server';
import { createParentRepository } from '@/lib/data/supabase/repositories';
import { PinForm } from '@/components/pin-form';
import { setChildModePinAction } from './actions';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default async function SafetySettingsPage() {
  const t = getMessages(DEFAULT_LOCALE);
  const parentId = await requireParentId();
  const db = await createClient();
  const parent = await createParentRepository(db).findById(parentId);

  return (
    <>
      <h1 className="text-2xl font-semibold">{t.safety.title}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">{t.safety.pinTitle}</h2>
        {/* Stated plainly, not buried: the PIN is a UX lock, not security. */}
        <p className="text-parent-muted text-sm text-pretty">{t.safety.pinExplain}</p>
        <p className="text-sm">
          {parent?.hasChildModePin ? `✓ ${t.safety.pinSet}` : t.safety.pinNotSet}
        </p>
        <PinForm
          action={setChildModePinAction}
          label={t.safety.pinLabel}
          submit={t.safety.pinSave}
        />
      </section>
    </>
  );
}
