'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { buildEmailRedirect, resolveSiteOrigin, safeNextPath } from '@/lib/auth/redirects';
import { getMessages } from '@/lib/i18n';

const t = getMessages('vi');

export interface AuthState {
  error?: string;
  notice?: string;
}

const credentialsSchema = z.object({
  email: z.string().trim().email(t.auth.invalidEmail),
  password: z.string().min(8, t.auth.weakPassword),
});

const signUpSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(1).max(80),
});

/**
 * Sign up a PARENT. There is no child signup path anywhere in this codebase —
 * children are rows under this account, never accounts (principle P1, A7).
 *
 * The `profiles` row is created by a database trigger on `auth.users` insert,
 * so it exists even if this action is interrupted after the auth call.
 */
export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    displayName: formData.get('displayName'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t.error.generic };
  }

  const supabase = await createClient();
  const origin = resolveSiteOrigin(await headers());

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      /**
       * Without this the confirmation link returns to the project's Site URL,
       * which is a page — and a page cannot exchange the code for a session.
       * It must come back through the callback route.
       */
      emailRedirectTo: buildEmailRedirect(origin, '/children/new') ?? undefined,
    },
  });

  if (error) {
    // Never echo the provider's message verbatim — it can disclose whether an
    // address is registered.
    return { error: error.status === 422 ? t.auth.emailInUse : t.error.generic };
  }

  /**
   * With email confirmations ON there is no session yet, so redirecting to
   * /dashboard would bounce straight back to /login and look like the signup
   * failed. Tell the parent to go and read their email instead.
   */
  if (!data.session) return { notice: t.auth.confirmSent };

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function logInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: t.auth.invalidCredentials };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // One message for both "no such user" and "wrong password", so the form is
  // not an account-existence oracle.
  if (error) return { error: t.auth.invalidCredentials };

  revalidatePath('/', 'layout');
  // safeNextPath, not startsWith('/'): '//evil.example' passes that check and
  // is a protocol-relative URL pointing at another host.
  redirect(safeNextPath(formData.get('next')));
}

export async function logOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}

export async function requestPasswordResetAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = z.string().trim().email().safeParse(formData.get('email'));
  // Always the same reply, whether or not the address exists.
  if (!email.success) return { notice: t.auth.resetSent };

  const supabase = await createClient();
  const origin = resolveSiteOrigin(await headers());

  // Same reason as signup: the recovery link has to land on the callback route
  // so the code becomes a session before /reset-password renders its form.
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: buildEmailRedirect(origin, '/reset-password') ?? undefined,
  });
  return { notice: t.auth.resetSent };
}

export async function updatePasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = z.string().min(8, t.auth.weakPassword).safeParse(formData.get('password'));
  if (!password.success) return { error: t.auth.weakPassword };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return { error: t.error.generic };

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}
