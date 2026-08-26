/**
 * Child-mode PIN policy — pure rules, no crypto and no I/O.
 *
 * ⚠️ THE PIN IS A UX BOUNDARY, NOT AN AUTHORIZATION BOUNDARY.
 *
 * The parent's session is live behind it. A determined child on an unlocked
 * device can leave child mode, and that is accepted: the PIN keeps the app on
 * the child's activity, it does not protect data. Everything that must be
 * enforced — what content exists, what rows are reachable — is enforced
 * server-side by RLS and the age policy (PRODUCT_SPEC.md §5, CHILD_SAFETY.md §6).
 *
 * This is stated to the parent in the setup copy, not buried here.
 */

export const PIN_LENGTH = 4;
export const MAX_PIN_ATTEMPTS = 5;
export const LOCKOUT_MS = 60_000;

export type PinValidation =
  { valid: true } | { valid: false; reason: 'length' | 'non_numeric' | 'too_simple' };

/** Rejects the handful of PINs that offer no protection at all. */
const TRIVIAL_PINS = new Set([
  '0000',
  '1111',
  '2222',
  '3333',
  '4444',
  '5555',
  '6666',
  '7777',
  '8888',
  '9999',
  '1234',
  '4321',
  '0123',
]);

export function validatePin(pin: string): PinValidation {
  if (pin.length !== PIN_LENGTH) return { valid: false, reason: 'length' };
  if (!/^\d+$/.test(pin)) return { valid: false, reason: 'non_numeric' };
  if (TRIVIAL_PINS.has(pin)) return { valid: false, reason: 'too_simple' };
  return { valid: true };
}

export interface AttemptState {
  failedAttempts: number;
  lockedUntil: number | null;
}

export const INITIAL_ATTEMPT_STATE: AttemptState = { failedAttempts: 0, lockedUntil: null };

export function isLockedOut(state: AttemptState, now: number): boolean {
  return state.lockedUntil !== null && state.lockedUntil > now;
}

export function recordFailure(state: AttemptState, now: number): AttemptState {
  const failedAttempts = state.failedAttempts + 1;
  return failedAttempts >= MAX_PIN_ATTEMPTS
    ? { failedAttempts: 0, lockedUntil: now + LOCKOUT_MS }
    : { failedAttempts, lockedUntil: null };
}

export function recordSuccess(): AttemptState {
  return INITIAL_ATTEMPT_STATE;
}

export function remainingAttempts(state: AttemptState): number {
  return Math.max(0, MAX_PIN_ATTEMPTS - state.failedAttempts);
}
