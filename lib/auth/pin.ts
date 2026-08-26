import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Child-mode PIN hashing. Lives outside lib/domain because it needs crypto;
 * the POLICY (length, trivial PINs, attempt throttling) is pure and lives in
 * lib/domain/child-mode.ts.
 *
 * scrypt rather than a fast hash: a four-digit PIN has only 10,000 values, so
 * the work factor is the only thing standing between a leaked hash and the PIN.
 * That said — the PIN is a UX lock, not an authorization boundary, and nothing
 * of value is behind it (PRODUCT_SPEC.md §5).
 */
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(pin, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;

  const derived = await scrypt(pin, Buffer.from(saltHex, 'hex'), KEY_LENGTH);
  const expected = Buffer.from(hashHex, 'hex');
  if (derived.length !== expected.length) return false;

  // Constant time, so a wrong PIN cannot be found byte by byte from timing.
  return timingSafeEqual(derived, expected);
}
