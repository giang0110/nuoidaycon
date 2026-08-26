/**
 * Render every worksheet type to standalone HTML for print testing.
 *
 * The print routes require an authenticated parent, which a Playwright run
 * cannot obtain without an auth server. Rendering the REAL component with the
 * REAL stylesheet to a file lets the print tests exercise what actually ships —
 * layout, rulings and Vietnamese diacritics — rather than a stand-in.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Worksheet } from '../components/worksheet';
import { toChildView } from '../lib/domain/activity/child-view';
import { validateActivity } from '../lib/domain/activity/validate';
import { ALL_SEEDS } from '../content/seeds';
import type { ActivityType } from '../lib/domain/entities';

const OUT_DIR = resolve(process.cwd(), 'tests/e2e/.worksheets');
const CSS = readFileSync(resolve(process.cwd(), 'app/print/print.css'), 'utf8');

const TYPES: ActivityType[] = [
  'handwriting',
  'drawing_prompt',
  'story_comprehension',
  'story_summary',
  'reflection',
  'situation_judgment',
];

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700&display=swap" rel="stylesheet">
<style>:root{--font-be-vietnam:'Be Vietnam Pro';}${CSS}</style>
</head>
<body>${body}</body>
</html>`;
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const rendered: string[] = [];

  for (const type of TYPES) {
    const seed = ALL_SEEDS.find((s) => s.type === type);
    if (!seed) {
      console.error(`✗ no seed for ${type}`);
      process.exit(1);
    }

    const result = validateActivity(seed);
    if (!result.ok) {
      console.error(`✗ seed ${seed.slug} failed validation`);
      process.exit(1);
    }

    const markup = renderToStaticMarkup(
      createElement(Worksheet, {
        activity: toChildView(result.activity),
        childName: 'Bé Bảo Ngọc',
      }),
    );

    const file = resolve(OUT_DIR, `${type}.html`);
    writeFileSync(file, page(result.activity.title, markup), 'utf8');
    rendered.push(`${type}.html`);
  }

  console.log(`✓ rendered ${rendered.length} worksheets to ${OUT_DIR}`);
}

main();
