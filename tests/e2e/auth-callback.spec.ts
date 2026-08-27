import { test, expect } from '@playwright/test';

/**
 * The email-link callback, exercised over HTTP.
 *
 * These cases never reach the auth server: a link with no credential, or one
 * Supabase has already marked failed, is decided before any exchange is
 * attempted. That makes them runnable without a project, which is exactly what
 * makes them worth having — the mailbox-dependent half cannot be automated.
 */
test.describe('/auth/callback', () => {
  test('sends a link with no credential back to login', async ({ page }) => {
    await page.goto('/auth/callback');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('explains an expired link instead of failing silently', async ({ page }) => {
    await page.goto('/auth/callback?error=access_denied&error_code=otp_expired');
    await expect(page).toHaveURL(/\/login\?notice=link_expired/);
    await expect(page.getByText(/Liên kết đã hết hạn/)).toBeVisible();
  });

  test('explains an otherwise invalid link', async ({ page }) => {
    await page.goto('/auth/callback?error=server_error&error_code=validation_failed');
    await expect(page).toHaveURL(/\/login\?notice=link_invalid/);
    await expect(page.getByText(/Liên kết không dùng được/)).toBeVisible();
  });

  test('never echoes the credential into the destination URL', async ({ page }) => {
    await page.goto('/auth/callback?error=access_denied&error_code=otp_expired&token_hash=SECRET');
    expect(page.url()).not.toContain('SECRET');
    expect(page.url()).not.toContain('token_hash');
  });

  test('keeps an off-site next out of the redirect', async ({ page }) => {
    await page.goto('/auth/callback?next=//evil.example');
    expect(page.url()).not.toContain('evil.example');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('is never cached — the URL carries a credential and the reply sets a session', async ({
    request,
  }) => {
    const response = await request.get(
      '/auth/callback?error=access_denied&error_code=otp_expired',
      {
        maxRedirects: 0,
      },
    );
    expect(response.headers()['cache-control']).toContain('no-store');
  });
});

test.describe('login redirect target', () => {
  test('does not forward a protocol-relative next into the form', async ({ page }) => {
    await page.goto('/login?next=//evil.example');
    // The hidden field is the sink the action reads; it must be absent or safe.
    const hidden = page.locator('input[name="next"]');
    if ((await hidden.count()) > 0) {
      expect(await hidden.inputValue()).not.toContain('evil.example');
    }
  });

  test('still preserves a legitimate destination', async ({ page }) => {
    await page.goto('/login?next=%2Fchildren%2Fnew');
    await expect(page.locator('input[name="next"]')).toHaveValue('/children/new');
  });
});

test.describe('reset-password stays reachable', () => {
  test('is not treated as a page to bounce away from', async ({ page }) => {
    // Unauthenticated it simply renders; the recovery session case needs a real
    // mailbox and is covered by the manual checklist.
    const response = await page.goto('/reset-password');
    expect(response?.status()).toBe(200);
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });
});
