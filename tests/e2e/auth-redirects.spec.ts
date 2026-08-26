import { test, expect } from '@playwright/test';

/**
 * Middleware gating. These run without any Supabase instance because an
 * unauthenticated request never reaches the auth server for a redirect
 * decision — the absence of a session cookie is enough.
 */
const PROTECTED = ['/dashboard', '/children', '/children/new', '/settings', '/play', '/library'];

test.describe('unauthenticated access', () => {
  for (const path of PROTECTED) {
    test(`redirects ${path} to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test('preserves the intended destination', async ({ page }) => {
    await page.goto('/children/new');
    await expect(page).toHaveURL(/next=%2Fchildren%2Fnew/);
  });

  test('child mode is gated too — the PIN is not the boundary', async ({ page }) => {
    await page.goto('/play');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('public pages stay public', () => {
  for (const path of ['/', '/privacy', '/safety', '/login', '/signup']) {
    test(`serves ${path}`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${path.replace('/', '\\/')}$`));
    });
  }
});

test.describe('auth forms', () => {
  test('signup collects a parent name, email and password — and nothing about a child', async ({
    page,
  }) => {
    await page.goto('/signup');
    await expect(page.locator('input[name="displayName"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    // No child fields on the signup form: children are created later, under
    // the parent's account.
    await expect(page.locator('input[name="birthYear"]')).toHaveCount(0);
    await expect(page.locator('input[name="childName"]')).toHaveCount(0);
  });

  test('password field enforces a minimum length client-side', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.locator('input[name="password"]')).toHaveAttribute('minlength', '8');
  });

  test('login offers password recovery', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /Quên mật khẩu/ }).click();
    await expect(page).toHaveURL(/forgot-password/);
  });

  test('safety page states the core promises', async ({ page }) => {
    await page.goto('/safety');
    await expect(page.getByText(/Không có trò chuyện tự do giữa con và AI/)).toBeVisible();
    await expect(page.getByText(/Con không có tài khoản riêng/)).toBeVisible();
  });
});
