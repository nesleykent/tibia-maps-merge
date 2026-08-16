import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Merge exposes a pre-download outcome review', async () => {
  const [app, html] = await Promise.all([
    read('../docs/app.js'),
    read('../docs/index.html'),
  ]);

  assert.match(html, /id="merge-preview-step"/);
  assert.match(html, /id="merge-preview" aria-live="polite"/);
  assert.match(html, /<button class="primary-btn" id="merge-run"/);
  assert.doesNotMatch(html, /panel-actions/);

  assert.match(app, /function analyzeMerge\(\)/);
  assert.match(app, /function refreshMergePreview\(\)/);
  assert.match(app, /const analysis = analyzeMerge\(\)/);
  assert.match(app, /refreshMergePreview\(\);\s*updateConversionSourceOptions/);
  assert.match(app, /t\('labelCommunity'\)/);
  assert.match(app, /t\('labelConflicts'\)/);
  assert.match(app, /analysis\.merged\.length/);
});
