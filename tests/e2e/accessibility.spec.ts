import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Accessibility — Phase 9.
 *
 * Covers the public surface plus every worksheet (rendered to file, since the
 * print routes need a session). The authenticated surface is checked by the
 * same rules in CI once an auth server is available; the components it renders
 * are the same ones exercised here.
 */
const PUBLIC_PAGES = ['/', '/safety', '/privacy', '/login', '/signup', '/forgot-password'];

const WORKSHEET_DIR = resolve(process.cwd(), 'tests/e2e/.worksheets');
const WORKSHEET_TYPES = [
  'handwriting',
  'drawing_prompt',
  'story_comprehension',
  'story_summary',
  'reflection',
  'situation_judgment',
] as const;

async function scan(page: import('@playwright/test').Page) {
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
}

test.describe('public pages meet WCAG 2.1 AA', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} has no violations`, async ({ page }) => {
      await page.goto(path);
      const results = await scan(page);
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s)`),
        JSON.stringify(
          results.violations.map((v) => ({ id: v.id, help: v.help })),
          null,
          2,
        ),
      ).toEqual([]);
    });
  }
});

test.describe('worksheets are accessible on screen too', () => {
  test.skip(!existsSync(WORKSHEET_DIR), 'run `pnpm worksheets:render` first');

  for (const type of WORKSHEET_TYPES) {
    test(`${type} worksheet has no violations`, async ({ page }) => {
      await page.goto(pathToFileURL(resolve(WORKSHEET_DIR, `${type}.html`)).href);
      const results = await scan(page);
      expect(results.violations.map((v) => v.id)).toEqual([]);
    });
  }
});

test.describe('keyboard operability', () => {
  test('every interactive element on the login form is reachable by keyboard', async ({ page }) => {
    await page.goto('/login');
    const reachable: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      const описание = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        return `${el.tagName.toLowerCase()}:${el.getAttribute('name') ?? el.textContent?.trim().slice(0, 20) ?? ''}`;
      });
      if (описание) reachable.push(описание);
    }
    expect(reachable.some((r) => r.includes('email'))).toBe(true);
    expect(reachable.some((r) => r.includes('password'))).toBe(true);
    expect(reachable.some((r) => r.startsWith('button'))).toBe(true);
  });

  test('focus is visible, not suppressed', async ({ page }) => {
    await page.goto('/login');
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const style = getComputedStyle(el);
      return { outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle };
    });
    expect(outline).not.toBeNull();
    expect(outline?.outlineStyle).not.toBe('none');
  });
});

test.describe('touch targets and zoom', () => {
  test('interactive controls are at least 44px tall', async ({ page }) => {
    await page.goto('/signup');
    const controls = page.locator('input, button, a');
    const count = await controls.count();
    const tooSmall: string[] = [];

    for (let i = 0; i < count; i += 1) {
      const box = await controls.nth(i).boundingBox();
      if (box && box.height > 0 && box.height < 44) {
        const name = await controls
          .nth(i)
          .evaluate((el) => el.tagName + (el.getAttribute('name') ?? ''));
        tooSmall.push(`${name} (${Math.round(box.height)}px)`);
      }
    }
    // Inline text links inside a paragraph are exempt from the 44px rule.
    const nonLink = tooSmall.filter((entry) => !entry.startsWith('A'));
    expect(nonLink).toEqual([]);
  });

  test('zooming is never blocked', async ({ page }) => {
    await page.goto('/');
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport ?? '').not.toContain('user-scalable=no');
    expect(viewport ?? '').not.toContain('maximum-scale=1');
  });
});

test.describe('reduced motion is respected', () => {
  test('animations are disabled when the user asks', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const duration = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.transition = 'opacity 2s';
      document.body.append(probe);
      const value = getComputedStyle(probe).transitionDuration;
      probe.remove();
      return value;
    });
    // Parsed numerically rather than matched as a string: the browser reports
    // 0.01ms as "1e-05s", which a naive pattern misses.
    const seconds = parseFloat(duration ?? '1');
    expect(seconds, `transition-duration was ${duration}`).toBeLessThan(0.001);
  });
});
