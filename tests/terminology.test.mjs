import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('English UI follows the Map, Marker, Collection, and File vocabulary', async () => {
  const [html, i18n] = await Promise.all([
    read('../docs/index.html'),
    read('../docs/lib/i18n.js'),
  ]);
  const dynamicStrings = i18n.slice(0, i18n.indexOf('const ICON_LABELS'));

  const navigation = ['Merge', 'Collections', 'Edit Markers', 'Convert', 'Extract'];
  let previous = -1;
  for (const label of navigation) {
    const current = html.indexOf(`>${label}</button>`, previous + 1);
    assert.ok(current > previous, `${label} should appear in the recommended navigation order`);
    previous = current;
  }

  for (const phrase of [
    'Your marker file',
    'Remove file',
    'Choose a marker file',
    'You can select multiple files',
    'For markers at the same location, the last file takes priority',
    'Where is my marker file?',
    'Your files stay on your device',
    'Download merged files',
    'Download my markers',
    'Download your updated map',
  ]) {
    assert.match(html, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  const retiredPhrases = [
    'Shared input',
    'Clear file',
    'Extract Own',
    'Edit Marks',
    'Marker Sets',
    'Review merge',
    'Review extraction',
    'Download own markers',
    'Nothing leaves your browser',
    'full audit log',
  ];
  for (const phrase of retiredPhrases) {
    assert.doesNotMatch(html, new RegExp(phrase, 'i'));
    assert.doesNotMatch(dynamicStrings, new RegExp(phrase, 'i'));
  }

  const proseHtml = html.replace(/<code>.*?<\/code>/gs, '');
  assert.doesNotMatch(proseHtml, />[^<]*\bmarks?\b[^<]*</i);
  assert.doesNotMatch(dynamicStrings, /['`]([^'`]*\bmarks?\b[^'`]*)['`]/i);
});

test('the app contains no Portuguese locale support', async () => {
  const [html, i18n] = await Promise.all([
    read('../docs/index.html'),
    read('../docs/lib/i18n.js'),
  ]);

  assert.doesNotMatch(html, /pt-BR|pt-br|Português/i);
  assert.doesNotMatch(i18n, /pt-BR|currentLang|export function tFor\b/i);
});
