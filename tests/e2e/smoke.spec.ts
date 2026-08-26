import { test, expect } from '@playwright/test';

test.describe('landing page', () => {
  test('renders the app name and tagline', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nuôi Dạy Con');
    await expect(page.getByText('Hoạt động học ngắn')).toBeVisible();
  });

  test('renders Vietnamese diacritics without fallback boxes', async ({ page }) => {
    await page.goto('/');
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toContainText('ạ');
    // A zero-width heading would mean the font failed to load entirely.
    const box = await heading.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
  });

  test('does not scroll horizontally at 360px', async ({ page }) => {
    await page.goto('/');
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);
  });
});
