import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pages = [
  '../docs/index.html',
  '../docs/pt-br/index.html',
];

for (const page of pages) {
  test(`${page} uses one shared marker upload for all tools`, async () => {
    const html = await readFile(new URL(page, import.meta.url), 'utf8');

    assert.equal((html.match(/id="your-marker-files"/g) ?? []).length, 1);
    assert.match(html, /id="your-markers-clear"/);
    assert.match(html, /id="tab-extract"/);
    assert.match(html, /id="mode-extract"/);
    assert.match(html, /id="extract-community" checked/);
    assert.match(html, /id="extract-set-choices"/);
    assert.match(html, /id="conversion-source"/);
    assert.match(html, /id="review-conflicts"/);
    assert.doesNotMatch(html, /name="mark-conflict-policy"/);
    assert.doesNotMatch(html, /id="personal-files"/);
    assert.doesNotMatch(html, /id="add-existing-files"/);
    assert.doesNotMatch(html, /id="sets-files"/);
    assert.doesNotMatch(html, /id="conversion-file"/);
  });

  test(`${page} follows the Edit Marks action hierarchy`, async () => {
    const html = await readFile(new URL(page, import.meta.url), 'utf8');

    assert.match(html, /class="tertiary-btn" id="add-draft-cancel"[\s\S]*class="primary-btn compact-primary" id="add-marks"/);
    assert.match(html, /id="edit-cancel"[\s\S]*class="primary-btn" id="edit-save"/);
    assert.match(html, /id="clear-cancel"[\s\S]*class="destructive-btn" id="clear-confirm"/);
    assert.match(html, /id="icon-picker-sheet"/);
    assert.match(html, /data-icon-field="icon-picker"/);
    assert.match(html, /id="icon-picker-cancel"[\s\S]*id="icon-picker-confirm"/);
    assert.match(html, /<th[^>]*>[^<]*(?:Coordinate|Coordenada)<\/th>/);
  });
}

test('the utility shell preserves its branded wordmark and responsive review rows', async () => {
  const css = await readFile(new URL('../docs/style.css', import.meta.url), 'utf8');

  assert.match(css, /header \{[\s\S]*background: var\(--ig-gradient-hero\)/);
  assert.match(css, /header h1 \{[\s\S]*font-family: var\(--font-family-brand-headline\)/);
  assert.doesNotMatch(css, /header h1 \{[^}]*var\(--ig-gradient-warm\)/s);
  assert.match(css, /#mode-add \.marker-table tbody > tr:not\(\.marker-conflict-detail\) \{[\s\S]*grid-template-areas/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
