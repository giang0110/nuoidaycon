'use server';

import { redirect } from 'next/navigation';
import { createClient, requireParentId } from '@/lib/supabase/server';
import { getMessages } from '@/lib/i18n';

const t = getMessages('vi');

export interface DataState {
  error?: string;
  exportJson?: string;
}

/**
 * Export everything this family's account holds — CHILD_SAFETY.md §3.
 *
 * Every query is RLS-scoped to the caller, so the export cannot accidentally
 * reach beyond one family even if a filter were wrong.
 *
 * Photos are referenced by signed URL rather than embedded: a multi-megabyte
 * base64 blob in a JSON file is unusable, and the URLs expire.
 */
export async function exportFamilyDataAction(): Promise<DataState> {
  const parentId = await requireParentId();
  const db = await createClient();

  const [profile, children, interests, assignments, submissions, reviews, reports, audit] =
    await Promise.all([
      db
        .from('profiles')
        .select('id, display_name, locale, created_at')
        .eq('id', parentId)
        .maybeSingle(),
      db.from('children').select('*'),
      db.from('child_interests').select('child_id, interest_id'),
      db.from('assignments').select('*'),
      db.from('submissions').select('*'),
      db.from('assignment_reviews').select('*'),
      db.from('content_reports').select('*'),
      db.from('audit_events').select('action, subject_type, created_at'),
    ]);

  const { data: assets } = await db
    .from('submission_assets')
    .select('id, submission_id, storage_path, created_at');

  const photos: { id: string; submissionId: string; url: string }[] = [];
  for (const asset of (assets ?? []) as {
    id: string;
    submission_id: string;
    storage_path: string;
  }[]) {
    const { data } = await db.storage.from('submissions').createSignedUrl(asset.storage_path, 3600);
    if (data?.signedUrl) {
      photos.push({ id: asset.id, submissionId: asset.submission_id, url: data.signedUrl });
    }
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    note: 'Ảnh được cung cấp qua liên kết có hiệu lực 1 giờ. Bố mẹ tải về ngay sau khi xuất dữ liệu nhé.',
    parent: profile.data,
    children: children.data ?? [],
    childInterests: interests.data ?? [],
    assignments: assignments.data ?? [],
    submissions: submissions.data ?? [],
    reviews: reviews.data ?? [],
    contentReports: reports.data ?? [],
    auditTrail: audit.data ?? [],
    photos,
  };

  return { exportJson: JSON.stringify(payload, null, 2) };
}

/**
 * Delete the account and everything under it.
 *
 * Order matters: Storage objects are removed FIRST, because once the rows are
 * gone their paths are gone too and the files would be orphaned forever.
 * Database rows then cascade from `profiles` (CHILD_SAFETY.md §3).
 */
export async function deleteAccountAction(formData: FormData): Promise<void> {
  const parentId = await requireParentId();
  if (String(formData.get('confirm') ?? '') !== 'XOA') return;

  const db = await createClient();

  const { data: assets } = await db.from('submission_assets').select('storage_path');
  const paths = (assets ?? []).map((a) => (a as { storage_path: string }).storage_path);
  if (paths.length > 0) {
    await db.storage.from('submissions').remove(paths);
  }

  // Removing the profile cascades to children, assignments, submissions,
  // assets, reviews, reports and AI drafts.
  await db.from('profiles').delete().eq('id', parentId);
  await db.auth.signOut();

  redirect('/?deleted=1');
}
