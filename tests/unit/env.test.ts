import { describe, it, expect } from 'vitest';
import { readPublicEnv, readServerEnv } from '@/lib/env';

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
};

describe('readPublicEnv', () => {
  it('accepts a complete environment', () => {
    expect(readPublicEnv(valid)).toEqual(valid);
  });

  it('lists every missing variable rather than failing on the first', () => {
    try {
      readPublicEnv({});
      expect.unreachable('should have thrown');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('NEXT_PUBLIC_SUPABASE_URL');
      expect(message).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }
  });

  it('rejects a malformed url', () => {
    expect(() => readPublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' })).toThrow();
  });

  it('never surfaces the service-role key (decision A3)', () => {
    const parsed = readServerEnv({ ...valid, SUPABASE_SERVICE_ROLE_KEY: 'super-secret' });
    expect(Object.keys(parsed)).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(JSON.stringify(parsed)).not.toContain('super-secret');
  });
});
