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

  it('protects every route under the parent layout, /ai included', () => {
    // /ai was reachable by the middleware and gated only by the layout. The
    // layout IS the real gate and RLS is the boundary, so this was never a
    // hole — but a parent route missing from the list loses its ?next=
    // round-trip and reads as an oversight.
    expect(isProtectedPath('/ai')).toBe(true);
  });

  it('protects child mode, which must never be reachable unauthenticated', () => {
    // Child mode runs inside the PARENT's session. It is a UX lock, not an
    // auth boundary — so the route must still require a real session.
    expect(isProtectedPath('/play')).toBe(true);
  });
});

describe('isAuthPath', () => {
  it.each(['/login', '/signup', '/forgot-password'])('recognises %s', (path) => {
    expect(isAuthPath(path)).toBe(true);
  });

  it('does NOT bounce an authenticated visitor away from /reset-password', () => {
    // A recovery link signs the parent in before they reach the form. Treating
    // /reset-password as an auth path would redirect the only people who ever
    // arrive there straight to /dashboard, and the reset could never complete.
    expect(isAuthPath('/reset-password')).toBe(false);
  });

  it('leaves the email callback alone so it can complete the exchange', () => {
    expect(isAuthPath('/auth/callback')).toBe(false);
    expect(isProtectedPath('/auth/callback')).toBe(false);
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
