'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient, requireParentId } from '@/lib/supabase/server';
import { createChildRepository, createInterestRepository } from '@/lib/data/supabase/repositories';
import { childProfileSchemaWithTime } from '@/lib/domain/child-profile';
import { getMessages } from '@/lib/i18n';

const t = getMessages('vi');

export interface ChildFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function parseForm(formData: FormData) {
  return childProfileSchemaWithTime().safeParse({
    displayName: formData.get('displayName'),
    birthYear: formData.get('birthYear'),
    birthMonth: formData.get('birthMonth'),
    grade: formData.get('grade'),
    avatarKey: formData.get('avatarKey') ?? 'cat',
    interestIds: formData.getAll('interestIds').filter((v): v is string => typeof v === 'string'),
  });
}

function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '');
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function createChildAction(
  _prev: ChildFormState,
  formData: FormData,
): Promise<ChildFormState> {
  const parentId = await requireParentId();
  const parsed = parseForm(formData);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const db = await createClient();
  const children = createChildRepository(db, parentId);
  const interests = createInterestRepository(db);

  try {
    // parent_id comes from the verified session, never from the form — a
    // client cannot create a child under someone else's account. RLS would
    // refuse it anyway (defence in depth).
    const child = await children.create({ parentId, ...parsed.data });
    if (parsed.data.interestIds.length > 0) {
      await interests.setForChild(child.id, parsed.data.interestIds);
    }
    revalidatePath('/children');
    redirect(`/children/${child.id}`);
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    if (typeof error === 'object' && error !== null && 'digest' in error) throw error;
    return { error: t.error.generic };
  }
}

export async function updateChildAction(
  childId: string,
  _prev: ChildFormState,
  formData: FormData,
): Promise<ChildFormState> {
  const parentId = await requireParentId();
  const parsed = parseForm(formData);
  if (!parsed.success) return { fieldErrors: toFieldErrors(parsed.error.issues) };

  const db = await createClient();
  const children = createChildRepository(db, parentId);
  const interests = createInterestRepository(db);

  // Re-assert ownership in the action as well as relying on RLS.
  const existing = await children.findById(childId);
  if (!existing) return { error: t.error.notFound };

  try {
    await children.update(childId, parsed.data);
    await interests.setForChild(childId, parsed.data.interestIds);
    revalidatePath(`/children/${childId}`);
    redirect(`/children/${childId}`);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'digest' in error) throw error;
    return { error: t.error.generic };
  }
}

/** Archive, never hard delete: completed work and its history survive. */
export async function archiveChildAction(formData: FormData): Promise<void> {
  const parentId = await requireParentId();
  const childId = formData.get('childId');
  if (typeof childId !== 'string') return;

  const db = await createClient();
  const children = createChildRepository(db, parentId);
  if (!(await children.findById(childId))) return;

  await children.archive(childId);
  revalidatePath('/children');
  redirect('/children');
}
