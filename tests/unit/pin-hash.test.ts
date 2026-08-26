import { describe, it, expect } from 'vitest';
import { hashPin, verifyPin } from '@/lib/auth/pin';

describe('PIN hashing', () => {
  it('verifies the correct PIN', async () => {
    const stored = await hashPin('2947');
    expect(await verifyPin('2947', stored)).toBe(true);
  });

  it('rejects a wrong PIN', async () => {
    const stored = await hashPin('2947');
    expect(await verifyPin('2948', stored)).toBe(false);
  });

  it('never stores the PIN in the clear', async () => {
    const stored = await hashPin('2947');
    expect(stored).not.toContain('2947');
    expect(stored.startsWith('scrypt$')).toBe(true);
  });

  it('salts, so the same PIN hashes differently each time', async () => {
    expect(await hashPin('2947')).not.toBe(await hashPin('2947'));
  });

  it('rejects a malformed stored value instead of throwing', async () => {
    for (const bad of ['', 'garbage', 'md5$aa$bb', 'scrypt$only-one-part']) {
      expect(await verifyPin('2947', bad)).toBe(false);
    }
  });
});
