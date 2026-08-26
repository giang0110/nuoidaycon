import { describe, it, expect } from 'vitest';
import {
  validatePin,
  isLockedOut,
  recordFailure,
  recordSuccess,
  remainingAttempts,
  INITIAL_ATTEMPT_STATE,
  MAX_PIN_ATTEMPTS,
  LOCKOUT_MS,
} from '@/lib/domain/child-mode';

describe('validatePin', () => {
  it('accepts a four-digit PIN', () => {
    expect(validatePin('2947')).toEqual({ valid: true });
  });

  it.each(['123', '12345', ''])('rejects the wrong length: %s', (pin) => {
    expect(validatePin(pin)).toEqual({ valid: false, reason: 'length' });
  });

  it.each(['12a4', 'abcd', '12 4'])('rejects non-numeric: %s', (pin) => {
    expect(validatePin(pin).valid).toBe(false);
  });

  it.each(['0000', '1111', '1234', '4321'])('rejects the trivial PIN %s', (pin) => {
    expect(validatePin(pin)).toEqual({ valid: false, reason: 'too_simple' });
  });
});

describe('attempt throttling', () => {
  const NOW = 1_000_000;

  it('starts unlocked with the full allowance', () => {
    expect(isLockedOut(INITIAL_ATTEMPT_STATE, NOW)).toBe(false);
    expect(remainingAttempts(INITIAL_ATTEMPT_STATE)).toBe(MAX_PIN_ATTEMPTS);
  });

  it('counts failures down without locking early', () => {
    let state = INITIAL_ATTEMPT_STATE;
    for (let i = 1; i < MAX_PIN_ATTEMPTS; i += 1) {
      state = recordFailure(state, NOW);
      expect(isLockedOut(state, NOW)).toBe(false);
      expect(remainingAttempts(state)).toBe(MAX_PIN_ATTEMPTS - i);
    }
  });

  it('locks out on the final failure', () => {
    let state = INITIAL_ATTEMPT_STATE;
    for (let i = 0; i < MAX_PIN_ATTEMPTS; i += 1) state = recordFailure(state, NOW);
    expect(isLockedOut(state, NOW)).toBe(true);
    expect(isLockedOut(state, NOW + LOCKOUT_MS + 1)).toBe(false);
  });

  it('clears the count on success', () => {
    const failed = recordFailure(INITIAL_ATTEMPT_STATE, NOW);
    expect(recordSuccess()).toEqual(INITIAL_ATTEMPT_STATE);
    expect(failed.failedAttempts).toBe(1);
  });
});
