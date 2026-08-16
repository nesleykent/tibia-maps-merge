import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Extract Own uses the shared persistent review and trailing action hierarchy', async () => {
  const [app, english, portuguese] = await Promise.all([
    read('../docs/app.js'),
    read('../docs/index.html'),
    read('../docs/pt-br/index.html'),
  ]);

  for (const html of [english, portuguese]) {
    assert.match(html, /class="set-choices" id="extract-source-choices"/);
    assert.doesNotMatch(html, /class="direction-choices extract-source-choice"/);
    assert.doesNotMatch(html, /id="extract-community"/);
    assert.match(html, /<li class="step" id="extract-preview-step">/);
    assert.doesNotMatch(html, /<li class="step hidden" id="extract-preview-step">/);
    assert.match(html, /<div class="panel-actions">\s*<button class="primary-btn" id="extract-run"/);
  }

  assert.match(app, /function createSetChoice\(/);
  assert.match(app, /id: 'extract-community'/);
  assert.match(app, /extractSourceChoices\.appendChild\(extractCommunityChoice\)/);
  assert.doesNotMatch(app, /extractPreviewStep\.classList\.toggle\('hidden'/);
  assert.match(app, /const renderPreviewMessage = \(message\)/);
  assert.match(app, /renderPreviewMessage\(t\('extractNeedsMarkers'\)\)/);
  assert.match(app, /extractPreview\.innerHTML = `<div class="result-card ok"><dl>`/);
});
