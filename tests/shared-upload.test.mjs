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
}
