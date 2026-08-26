'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient, requireParentId } from '@/lib/supabase/server';
import { createParentRepository } from '@/lib/data/supabase/repositories';
import { verifyPin } from '@/lib/auth/pin';
import {
  INITIAL_ATTEMPT_STATE,
  isLockedOut,
  recordFailure,
  type AttemptState,
} from '@/lib/domain/child-mode';
import { getMessages } from '@/lib/i18n';

const t = getMessages('vi');

const UNLOCK_COOKIE = 'child_mode_unlocked';
const ATTEMPTS_COOKIE = 'child_mode_attempts';
const UNLOCK_TTL_SECONDS = 60 * 60 * 3;

export interface UnlockState {
  error?: string;
}

async function readAttempts(): Promise<AttemptState> {
  const raw = (await cookies()).get(ATTEMPTS_COOKIE)?.value;
  if (!raw) return INITIAL_ATTEMPT_STATE;
  try {
    const parsed = JSON.parse(raw) as AttemptState;
    return typeof parsed.failedAttempts === 'number' ? parsed : INITIAL_ATTEMPT_STATE;
  } catch {
    return INITIAL_ATTEMPT_STATE;
  }
}

/**
 * Unlock child mode.
 *
 * ⚠️ The cookie set here is a UX flag, not an authorization token. It does not
 * grant access to anything: every query behind it still runs as the parent and
 * is still constrained by RLS. Forging it would let a child see their own
 * activities — which is the point of the screen.
 */
export async function unlockChildModeAction(
  _prev: UnlockState,
  formData: FormData,
): Promise<UnlockState> {
  const parentId = await requireParentId();
  const jar = await cookies();

  const attempts = await readAttempts();
  if (isLockedOut(attempts, Date.now())) return { error: t.play.pinLocked };

  const db = await createClient();
  const { data } = await db
    .from('profiles')
    .select('child_mode_pin_hash')
    .eq('id', parentId)
    .maybeSingle();

  const storedHash = (data as { child_mode_pin_hash: string | null } | null)?.child_mode_pin_hash;
  if (!storedHash) return { error: t.play.pinNotSet };

  const pin = String(formData.get('pin') ?? '');
  if (!(await verifyPin(pin, storedHash))) {
    const next = recordFailure(attempts, Date.now());
    jar.set(ATTEMPTS_COOKIE, JSON.stringify(next), { httpOnly: true, sameSite: 'lax', path: '/' });
    return { error: isLockedOut(next, Date.now()) ? t.play.pinLocked : t.play.pinWrong };
  }

  jar.set(ATTEMPTS_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  jar.set(UNLOCK_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: UNLOCK_TTL_SECONDS,
  });

  redirect('/play');
}

/** Leaving child mode clears the flag, so returning requires the PIN again. */
export async function lockChildModeAction(): Promise<void> {
  const jar = await cookies();
  jar.set(UNLOCK_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  redirect('/dashboard');
}

export async function isChildModeUnlocked(): Promise<boolean> {
  return (await cookies()).get(UNLOCK_COOKIE)?.value === '1';
}

export async function requireParentRepo() {
  const db = await createClient();
  return createParentRepository(db);
}
