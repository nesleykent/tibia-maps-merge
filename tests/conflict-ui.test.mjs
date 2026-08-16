import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('conflict decisions use one action vocabulary and expose the map link', async () => {
  const [app, i18n] = await Promise.all([
    read('../docs/app.js'),
    read('../docs/lib/i18n.js'),
  ]);

  assert.match(app, /mapLink\.href = mapUrl\(conflict\.incoming\)/);
  assert.match(app, /createConflictOption\(conflict, 'keep', 'markConflictKeep'\)/);
  assert.match(app, /createConflictOption\(conflict, 'replace', 'markConflictUseNew'\)/);
  assert.doesNotMatch(app, /markConflictInFile|markConflictReviewed|markConflictDecided|markConflictUseReviewed/);
  assert.match(i18n, /markConflictKeep: 'Keep Existing Mark'/);
  assert.match(i18n, /markConflictUseNew: 'Use New Mark'/);
  assert.match(i18n, /markConflictDecisionKeep: 'Decision: Keep Existing Mark'/);
  assert.match(i18n, /markConflictDecisionNew: 'Decision: Use New Mark'/);
  assert.doesNotMatch(i18n, /Reviewed Mark|Reviewed Marks/);
});

test('bulk conflict and download actions follow trailing macOS hierarchy', async () => {
  const [app, html, css] = await Promise.all([
    read('../docs/app.js'),
    read('../docs/index.html'),
    read('../docs/style.css'),
  ]);

  const bulkActions = app.slice(
    app.indexOf('<div class="review-conflict-actions">'),
    app.indexOf('</div>`;', app.indexOf('<div class="review-conflict-actions">')),
  );
  assert.ok(bulkActions.indexOf('data-resolution="keep"') < bulkActions.indexOf('data-resolution="replace"'));
  assert.match(bulkActions, /class="secondary-btn" data-resolution="keep"/);
  assert.match(bulkActions, /class="primary-btn" data-resolution="replace"/);
  assert.match(html, /<div class="panel-actions">\s*<button class="primary-btn" id="add-run"/);
  assert.match(css, /\.panel-actions\s*\{[\s\S]*?justify-content: flex-end/);
});
