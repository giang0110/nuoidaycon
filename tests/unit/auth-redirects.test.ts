/**
 * Auth redirect safety and email-link routing.
 *
 * Two things are pinned here:
 *
 *  1. Where a post-login or post-confirmation redirect is allowed to send the
 *     browser. `startsWith('/')` is NOT sufficient — `//evil.example` starts
 *     with a slash and is a protocol-relative URL, so a browser reads it as an
 *     absolute address on someone else's host.
 *
 *  2. Which origin the confirmation and recovery emails point back at. Supabase
 *     also checks this against its Redirect URLs allowlist, but the app should
 *     not be asking for something it would not accept.
 */
import { describe, it, expect } from 'vitest';
import { safeNextPath, resolveSiteOrigin, buildEmailRedirect } from '@/lib/auth/redirects';

describe('safeNextPath', () => {
  it('keeps an ordinary in-app path', () => {
    expect(safeNextPath('/children/new')).toBe('/children/new');
    expect(safeNextPath('/dashboard')).toBe('/dashboard');
  });

  it('rejects a protocol-relative URL, which a browser treats as another host', () => {
    // The bug: '//evil.example'.startsWith('/') === true.
    expect(safeNextPath('//evil.example')).toBe('/dashboard');
    expect(safeNextPath('//evil.example/path')).toBe('/dashboard');
  });

  it('rejects backslash variants that some parsers normalise to //', () => {
    expect(safeNextPath('/\\evil.example')).toBe('/dashboard');
    expect(safeNextPath('\\\\evil.example')).toBe('/dashboard');
  });

  it('rejects an absolute URL on any scheme', () => {
    for (const value of [
      'https://evil.example',
      'http://evil.example',
      'javascript:alert(1)',
      'data:text/html,<script>',
      'HTTPS://evil.example',
    ]) {
      expect(safeNextPath(value), value).toBe('/dashboard');
    }
  });

  it('rejects anything that is not a string, or is empty', () => {
    expect(safeNextPath(undefined)).toBe('/dashboard');
    expect(safeNextPath(null)).toBe('/dashboard');
    expect(safeNextPath('')).toBe('/dashboard');
    expect(safeNextPath(42 as never)).toBe('/dashboard');
  });

  it('rejects a path that does not start with a slash', () => {
    expect(safeNextPath('dashboard')).toBe('/dashboard');
    expect(safeNextPath('evil.example')).toBe('/dashboard');
  });

  it('accepts an explicit fallback for flows that do not end at the dashboard', () => {
    expect(safeNextPath('//evil.example', '/reset-password')).toBe('/reset-password');
  });

  it('strips a fragment, which the server can neither see nor trust', () => {
    expect(safeNextPath('/dashboard#/../../evil')).toBe('/dashboard');
  });
});

describe('resolveSiteOrigin', () => {
  it('prefers the Origin header, which Next already validates for server actions', () => {
    const origin = resolveSiteOrigin(
      new Headers({ origin: 'https://staging.example.app', host: 'ignored.example' }),
    );
    expect(origin).toBe('https://staging.example.app');
  });

  it('falls back to the forwarded host and proto behind a proxy', () => {
    const origin = resolveSiteOrigin(
      new Headers({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'staging.example.app' }),
    );
    expect(origin).toBe('https://staging.example.app');
  });

  it('falls back to Host when nothing is forwarded', () => {
    expect(resolveSiteOrigin(new Headers({ host: 'localhost:3000' }))).toBe(
      'http://localhost:3000',
    );
  });

  it('assumes https for a non-local host with no proto hint', () => {
    expect(resolveSiteOrigin(new Headers({ host: 'staging.example.app' }))).toBe(
      'https://staging.example.app',
    );
  });

  it('returns null rather than guessing when there is no host at all', () => {
    expect(resolveSiteOrigin(new Headers())).toBeNull();
  });

  it('ignores an Origin header that is not a valid absolute URL', () => {
    expect(resolveSiteOrigin(new Headers({ origin: 'null', host: 'staging.example.app' }))).toBe(
      'https://staging.example.app',
    );
  });
});

describe('buildEmailRedirect', () => {
  it('points the email link at the callback route, carrying the destination', () => {
    const url = buildEmailRedirect('https://staging.example.app', '/children/new');
    expect(url).toBe('https://staging.example.app/auth/callback?next=%2Fchildren%2Fnew');
  });

  it('never lets a caller smuggle another host into next', () => {
    const url = buildEmailRedirect('https://staging.example.app', '//evil.example');
    expect(url).toBe('https://staging.example.app/auth/callback?next=%2Fdashboard');
    expect(url).not.toContain('evil.example');
  });

  it('returns null when the origin could not be resolved, rather than a broken link', () => {
    // A confirmation email with a malformed link is worse than one the caller
    // knows it could not build.
    expect(buildEmailRedirect(null, '/dashboard')).toBeNull();
  });
});
