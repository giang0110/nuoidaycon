import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient, requireParentId } from '@/lib/supabase/server';
import { createTemplateRepository } from '@/lib/data/supabase/repositories';
import { ActivityPreview } from '@/components/activity-preview';
import { validateActivity } from '@/lib/domain/activity/validate';
import { DEFAULT_LOCALE, getMessages } from '@/lib/i18n';

export default async function TemplatePreviewPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const t = getMessages(DEFAULT_LOCALE);
  const { templateId } = await params;
  await requireParentId();

  const db = await createClient();
  const template = await createTemplateRepository(db).findById(templateId);
  if (!template) notFound();

  // The stored payload IS the complete validated Activity document — nothing
  // is reconstructed here. It is re-validated on read because the catalog is
  // only as trustworthy as the last time it was checked.
  const result = validateActivity(template.payload);
  if (!result.ok) notFound();

  return (
    <>
      <Link href="/library" className="text-parent-muted text-sm">
        ← {t.library.title}
      </Link>
      <p className="text-parent-muted text-sm text-pretty">{t.library.previewNote}</p>
      <ActivityPreview activity={result.activity} />
    </>
  );
}
