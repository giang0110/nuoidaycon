import { describe, it, expect } from 'vitest';
import { isProtectedPath, isAuthPath } from '@/lib/supabase/middleware';

describe('isProtectedPath', () => {
  it.each([
    '/dashboard',
    '/children',
    '/children/abc-123',
    '/children/abc-123/edit',
    '/library',
    '/library/xyz',
    '/settings',
    '/settings/safety',
    '/assign',
    '/assignments/abc',
    '/play',
    '/play/abc',
    '/print/abc',
  ])('protects %s', (path) => {
    expect(isProtectedPath(path)).toBe(true);
  });

  it.each(['/', '/privacy', '/safety', '/login', '/signup'])('leaves %s public', (path) => {
    expect(isProtectedPath(path)).toBe(false);
  });

  it('does not protect a path that merely starts with the same letters', () => {
    expect(isProtectedPath('/childrenish')).toBe(false);
    expect(isProtectedPath('/settings-public')).toBe(false);
    expect(isProtectedPath('/playground')).toBe(false);
  });

  it('protects child mode, which must never be reachable unauthenticated', () => {
    // Child mode runs inside the PARENT's session. It is a UX lock, not an
    // auth boundary — so the route must still require a real session.
    expect(isProtectedPath('/play')).toBe(true);
  });
});

describe('isAuthPath', () => {
  it.each(['/login', '/signup', '/forgot-password', '/reset-password'])('recognises %s', (path) => {
    expect(isAuthPath(path)).toBe(true);
  });

  it('does not treat protected or marketing routes as auth routes', () => {
    expect(isAuthPath('/dashboard')).toBe(false);
    expect(isAuthPath('/')).toBe(false);
  });

  it('never overlaps with protected paths', () => {
    const samples = ['/login', '/signup', '/dashboard', '/children', '/play', '/'];
    for (const path of samples) {
      expect(isAuthPath(path) && isProtectedPath(path)).toBe(false);
    }
  });
});
