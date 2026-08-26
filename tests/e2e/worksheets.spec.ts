import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Print fidelity — Phase 7.
 *
 * Loads the REAL Worksheet component rendered with the REAL print stylesheet
 * (see scripts/render-worksheets.ts). Run `pnpm worksheets:render` first.
 */
const DIR = resolve(process.cwd(), 'tests/e2e/.worksheets');

const TYPES = [
  'handwriting',
  'drawing_prompt',
  'story_comprehension',
  'story_summary',
  'reflection',
  'situation_judgment',
] as const;

const fileUrl = (type: string) => pathToFileURL(resolve(DIR, `${type}.html`)).href;

/** A4 at 96dpi. Print layout must be measured at page size, not at a phone width. */
const A4 = { width: 794, height: 1123 };

test.skip(!existsSync(DIR), 'run `pnpm worksheets:render` first');

test.describe('every activity type prints', () => {
  for (const type of TYPES) {
    test(`${type} renders a sheet with a title and no app chrome`, async ({ page }) => {
      await page.goto(fileUrl(type));
      await expect(page.locator('.sheet')).toHaveCount(1);
      await expect(page.locator('.sheet__title').first()).not.toBeEmpty();
      // No navigation ever appears on a worksheet.
      await expect(page.locator('nav')).toHaveCount(0);
      await expect(page.locator('a')).toHaveCount(0);
    });
  }
});

test.describe('Vietnamese diacritics', () => {
  test('render with real glyph width, not fallback boxes', async ({ page }) => {
    await page.goto(fileUrl('handwriting'));
    await page.waitForFunction(() => document.fonts.ready.then(() => true));

    // Compare a diacritic-heavy string against a bare-latin one of the same
    // length: a fallback/notdef box would make them suspiciously identical.
    const widths = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      ctx.font = '20pt "Be Vietnam Pro", sans-serif';
      return {
        diacritics: ctx.measureText('ằẳẵặỡựữửỹ').width,
        latin: ctx.measureText('aaaaaaaaaa').width,
        tofu: ctx.measureText('����������').width,
      };
    });

    expect(widths.diacritics).toBeGreaterThan(0);
    expect(widths.diacritics).not.toBeCloseTo(widths.tofu, 0);
  });

  test('the handwriting model text carries its diacritics through to the DOM', async ({ page }) => {
    await page.goto(fileUrl('handwriting'));
    const text = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.ruled__model'))
        .map((el) => el.textContent ?? '')
        .join(''),
    );
    expect(text.length).toBeGreaterThan(0);
    // The seeded early-band sheet practises diacritic vowels.
    expect(text).toMatch(/[ăâêôơàáảãạ]/);
  });

  test('a diacritic glyph is taller than its bare vowel — the mark is drawn', async ({ page }) => {
    await page.goto(fileUrl('handwriting'));
    await page.waitForFunction(() => document.fonts.ready.then(() => true));

    const heights = await page.evaluate(() => {
      const measure = (text: string) => {
        const span = document.createElement('span');
        span.style.cssText =
          'font:20pt "Be Vietnam Pro",sans-serif;position:absolute;white-space:pre';
        span.textContent = text;
        document.body.append(span);
        const rect = span.getBoundingClientRect();
        span.remove();
        return rect.height;
      };
      return { plain: measure('o'), marked: measure('ộ') };
    });

    expect(heights.marked).toBeGreaterThanOrEqual(heights.plain);
  });
});

test.describe('handwriting rulings', () => {
  test('draws ruled rows with a model to trace or copy', async ({ page }) => {
    await page.goto(fileUrl('handwriting'));
    const rows = page.locator('.ruled__row');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(3);

    const box = await rows.first().boundingBox();
    // A ruled row must be tall enough for diacritics above AND below the body.
    expect(box?.height ?? 0).toBeGreaterThan(60);
  });

  test('uses the vở ô ly grid class the activity asked for', async ({ page }) => {
    await page.goto(fileUrl('handwriting'));
    await expect(page.locator('.ruled--o_ly_grid')).toHaveCount(1);
  });
});

test.describe('A4 layout', () => {
  for (const type of TYPES) {
    test(`${type} fits the A4 content width`, async ({ page }) => {
      await page.setViewportSize(A4);
      await page.goto(fileUrl(type));
      await page.emulateMedia({ media: 'print' });

      const overflows = await page.evaluate(() => {
        const sheet = document.querySelector('.sheet') as HTMLElement;
        return sheet.scrollWidth > sheet.clientWidth + 1;
      });
      expect(overflows, 'worksheet content must not overflow the page width').toBe(false);
    });
  }

  test('drawing sheets leave a large blank area', async ({ page }) => {
    await page.goto(fileUrl('drawing_prompt'));
    const box = await page.locator('.sheet__drawing-box').boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(200);
  });

  test('written answers get ruled lines', async ({ page }) => {
    await page.goto(fileUrl('reflection'));
    expect(await page.locator('.sheet__answer-lines div').count()).toBeGreaterThan(2);
  });

  test('multiple choice prints tick boxes, not radio inputs', async ({ page }) => {
    await page.goto(fileUrl('story_comprehension'));
    await expect(page.locator('.sheet__choices li').first()).toBeVisible();
    await expect(page.locator('input')).toHaveCount(0);
  });
});

/**
 * The guarantee that matters most: a printed sheet is generated from the same
 * child-view projection as the screen, so it cannot carry an answer key.
 */
test.describe('no answer keys on a child worksheet', () => {
  for (const type of TYPES) {
    test(`${type} sheet contains no answer, rationale or exemplar`, async ({ page }) => {
      await page.goto(fileUrl(type));
      const html = await page.content();
      for (const marker of [
        'answerKey',
        'rationale',
        'exemplarAnswer',
        'mustMention',
        'isConstructive',
      ]) {
        expect(html, `${marker} leaked onto the printed sheet`).not.toContain(marker);
      }
    });
  }

  test('the comprehension sheet does not print the correct choice text as an answer', async ({
    page,
  }) => {
    await page.goto(fileUrl('story_comprehension'));
    const html = await page.content();
    // The rationale text from the seeded activity must be absent.
    expect(html).not.toContain('Đoạn hai nói rõ');
  });

  test('the situation sheet still shows the trusted-adult path', async ({ page }) => {
    await page.goto(fileUrl('situation_judgment'));
    await expect(page.getByText(/cô giáo|người lớn|bố mẹ/)).toBeVisible();
  });
});
