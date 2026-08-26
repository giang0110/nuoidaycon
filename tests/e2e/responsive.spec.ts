import { test, expect } from '@playwright/test';

/**
 * Mobile, tablet and desktop — Phase 9.
 *
 * The product is mobile-first at 360px (UX_FLOW.md §1); the other two sizes
 * must not regress. Horizontal scroll is the failure that matters: it means a
 * parent on a phone cannot read something.
 */
const SIZES = [
  { name: 'mobile', width: 360, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

const PAGES = ['/', '/safety', '/privacy', '/login', '/signup'];

for (const size of SIZES) {
  test.describe(`${size.name} (${size.width}px)`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    for (const path of PAGES) {
      test(`${path} does not scroll horizontally`, async ({ page }) => {
        await page.goto(path);
        const overflows = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        );
        expect(overflows, `${path} overflows at ${size.width}px`).toBe(false);
      });
    }

    test('body text is readable without zooming', async ({ page }) => {
      await page.goto('/safety');
      const fontSize = await page.evaluate(() => {
        const li = document.querySelector('li');
        return li ? parseFloat(getComputedStyle(li).fontSize) : 0;
      });
      expect(fontSize).toBeGreaterThanOrEqual(14);
    });
  });
}

test.describe('very narrow viewport', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('the landing page still works at 320px', async ({ page }) => {
    await page.goto('/');
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
