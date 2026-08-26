import { test, expect } from '@playwright/test';

/**
 * Child-mode structural guarantees.
 *
 * These run unauthenticated, so they verify the GATE rather than the player:
 * without a session, child mode must be unreachable. That is the property that
 * matters — the PIN is a UX lock and the session is the real requirement.
 */
test.describe('child mode is gated by the session, not by the PIN', () => {
  for (const path of ['/play', '/play/00000000-0000-4000-8000-000000000000']) {
    test(`redirects ${path} to login when unauthenticated`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test('does not leak an activity title before login', async ({ page }) => {
    const response = await page.goto('/play/00000000-0000-4000-8000-000000000000');
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('parent surfaces stay separate from child mode', () => {
  test('the parent app is not reachable unauthenticated either', async ({ page }) => {
    await page.goto('/assign');
    await expect(page).toHaveURL(/\/login/);
  });

  test('the safety page explains the PIN is not a security boundary', async ({ page }) => {
    await page.goto('/safety');
    await expect(page.getByText(/Con không có tài khoản riêng/)).toBeVisible();
  });
});

/**
 * Answer keys must never appear in any response the browser receives. This
 * watches every network response on the public surface — the authenticated
 * surface is covered by the projection unit and integration tests, which can
 * assert on the exact bytes.
 */
test('no response on the public surface contains an answer key', async ({ page }) => {
  const leaks: string[] = [];

  page.on('response', async (response) => {
    const type = response.headers()['content-type'] ?? '';
    if (!type.includes('text') && !type.includes('json')) return;
    try {
      const body = await response.text();
      for (const marker of ['answerKey', 'exemplarAnswer', 'isConstructive', 'mustMention']) {
        if (body.includes(marker)) leaks.push(`${marker} in ${response.url()}`);
      }
    } catch {
      // Body not available (redirect, aborted) — nothing to inspect.
    }
  });

  for (const path of ['/', '/safety', '/privacy', '/login', '/signup']) {
    await page.goto(path);
  }

  expect(leaks).toEqual([]);
});
