import assert from 'node:assert/strict';
import test from 'node:test';
import { extractOwnMarkers } from '../docs/lib/extract-markers.js';

const marker = (x, description, icon = 'star') => ({
  description, icon, x, y: 32000, z: 7,
});

test('exact community and marker-set copies are removed', () => {
  const community = marker(1, 'Community', 'flag');
  const markerSet = marker(2, 'Rapid Respawn', 'sword');
  const own = marker(3, 'My Route', 'up');

  const outcome = extractOwnMarkers(
    [community, markerSet, own],
    [community, markerSet],
  );

  assert.deepEqual(outcome.result, [own]);
  assert.equal(outcome.exactMatches, 2);
  assert.equal(outcome.unique, 1);
  assert.equal(outcome.overrides, 0);
  assert.equal(outcome.total, 1);
});

test('personal content at a published coordinate is preserved as an override', () => {
  const published = marker(1, 'Community', 'flag');
  const personalOverride = marker(1, 'My House', 'star');

  const outcome = extractOwnMarkers([personalOverride], [published]);

  assert.deepEqual(outcome.result, [personalOverride]);
  assert.equal(outcome.exactMatches, 0);
  assert.equal(outcome.overrides, 1);
  assert.equal(outcome.unique, 0);
});

test('matching considers label and icon as well as coordinates', () => {
  const published = marker(1, 'Community', 'flag');
  const customLabel = marker(1, 'Community renamed', 'flag');
  const customIcon = marker(1, 'Community', 'sword');

  const outcome = extractOwnMarkers([customLabel, customIcon], [published]);

  assert.deepEqual(outcome.result, [customLabel, customIcon]);
  assert.equal(outcome.overrides, 2);
});
