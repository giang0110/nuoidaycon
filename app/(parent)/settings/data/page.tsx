import { requireParentId } from '@/lib/supabase/server';
import { ExportTool, DeleteAccountTool } from '@/components/data-tools';
import { exportFamilyDataAction, deleteAccountAction } from './actions';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default async function DataSettingsPage() {
  const t = getMessages(DEFAULT_LOCALE);
  await requireParentId();

  return (
    <>
      <h1 className="text-2xl font-semibold">{t.data.title}</h1>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">{t.data.exportTitle}</h2>
        <p className="text-parent-muted text-sm text-pretty">{t.data.exportHint}</p>
        <ExportTool action={exportFamilyDataAction} />
      </section>

      <section className="border-parent-border flex flex-col gap-3 border-t pt-6">
        <h2 className="font-medium">{t.data.deleteTitle}</h2>
        <p className="text-parent-muted text-sm text-pretty">{t.data.deleteHint}</p>
        <DeleteAccountTool action={deleteAccountAction} />
      </section>
    </>
  );
}
