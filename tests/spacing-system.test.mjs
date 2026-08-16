import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readStyles = () => readFile(new URL('../docs/style.css', import.meta.url), 'utf8');

test('layout spacing uses the shared token scale instead of raw lengths', async () => {
  const css = await readStyles();
  const rawLayoutLengths = [];
  const declarationPattern = /\b(margin(?:-[a-z]+)*|padding(?:-[a-z]+)*|gap|row-gap|column-gap)\s*:\s*([^;]+);/g;

  for (const match of css.matchAll(declarationPattern)) {
    const [, property, value] = match;
    const isAccessibilityClip = property === 'margin' && value.trim() === '-1px';
    if (!isAccessibilityClip && /(?:^|[\s(])-?(?:\d*\.)?\d+(?:px|rem)\b/.test(value)) {
      rawLayoutLengths.push(`${property}: ${value.trim()}`);
    }
  }

  assert.deepEqual(rawLayoutLengths, []);
  assert.match(css, /--space-optical-nudge:\s*calc\(var\(--ig-space-1\) \/ 2\)/);
  assert.match(css, /--space-inline-code-x:\s*calc\(var\(--ig-space-3\) \/ 2\)/);
  assert.match(css, /--selection-check-size:\s*calc\(var\(--ig-space-3\) \+ var\(--space-optical-nudge\)\)/);
});

test('Extract separates its published-source groups with the shared scale', async () => {
  const css = await readStyles();

  assert.match(
    css,
    /\.choice-group-label\s*\{[^}]*margin:\s*var\(--ig-space-6\) 0 var\(--ig-space-3\);/s,
  );
});

test('screen-reader-only table labels cannot widen the mobile page', async () => {
  const css = await readStyles();

  assert.match(css, /\.visually-hidden\s*\{[^}]*inset:\s*0 auto auto 0;/s);
  assert.match(css, /\.visually-hidden\s*\{[^}]*clip:\s*rect\(0 0 0 0\);/s);
});
