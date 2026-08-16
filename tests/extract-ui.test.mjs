import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Extract uses the shared persistent review and standard page action structure', async () => {
  const [app, css, html] = await Promise.all([
    read('../docs/app.js'),
    read('../docs/style.css'),
    read('../docs/index.html'),
  ]);

  assert.match(html, /class="set-choices" id="extract-source-choices"/);
  assert.doesNotMatch(html, /class="direction-choices extract-source-choice"/);
  assert.doesNotMatch(html, /id="extract-community"/);
  assert.match(html, /<li class="step" id="extract-preview-step">/);
  assert.doesNotMatch(html, /<li class="step hidden" id="extract-preview-step">/);
  assert.match(html, /<button class="primary-btn" id="extract-run"/);
  assert.doesNotMatch(html, /panel-actions/);

  assert.match(app, /function createSetChoice\(/);
  assert.match(app, /id: 'extract-community'/);
  assert.match(app, /extractSourceChoices\.appendChild\(extractCommunityChoice\)/);
  assert.doesNotMatch(app, /extractPreviewStep\.classList\.toggle\('hidden'/);
  assert.match(app, /const renderPreviewMessage = \(message\)/);
  assert.match(app, /renderPreviewMessage\(t\('extractNeedsMarkers'\)\)/);
  assert.match(app, /extractPreview\.innerHTML = `<div class="result-card ok"><dl>`/);
  assert.doesNotMatch(css, /#mode-extract \.set-(?:choice|check|date|name|note|title)/);
  assert.match(css, /\.set-choice:has\(input:checked\) \.set-check\s*\{\s*opacity:\s*1;\s*\}/);
});
