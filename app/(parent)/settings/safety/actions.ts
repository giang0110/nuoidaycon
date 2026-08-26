'use server';

import { revalidatePath } from 'next/cache';
import { createClient, requireParentId } from '@/lib/supabase/server';
import { createParentRepository } from '@/lib/data/supabase/repositories';
import { validatePin } from '@/lib/domain/child-mode';
import { hashPin } from '@/lib/auth/pin';
import { getMessages } from '@/lib/i18n';

const t = getMessages('vi');

export interface PinState {
  error?: string;
  notice?: string;
}

export async function setChildModePinAction(
  _prev: PinState,
  formData: FormData,
): Promise<PinState> {
  const parentId = await requireParentId();
  const pin = String(formData.get('pin') ?? '');

  const validation = validatePin(pin);
  if (!validation.valid) {
    const message = validation.reason === 'too_simple' ? t.safety.pinTooSimple : t.safety.pinFormat;
    return { error: message };
  }

  const db = await createClient();
  // Only the hash is ever stored. The PIN itself is never logged.
  await createParentRepository(db).setChildModePinHash(parentId, await hashPin(pin));

  revalidatePath('/settings/safety');
  return { notice: t.safety.pinSaved };
}
