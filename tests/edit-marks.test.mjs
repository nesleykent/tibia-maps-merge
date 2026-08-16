import assert from 'node:assert/strict';
import test from 'node:test';

import { applyEditedMarks } from '../docs/lib/edit-marks.js';
import { buildAddMarksLog } from '../docs/lib/logs.js';

const marker = (x, description, icon = 'star') => ({
  x,
  y: 32000,
  z: 7,
  description,
  icon,
});

const existing = [
  marker(32001, 'Existing only'),
  marker(32002, 'Already the same'),
  marker(32003, 'Original label', 'flag'),
];

const reviewed = [
  marker(32002, 'Already the same'),
  marker(32003, 'Reviewed label', 'mouth'),
  marker(32004, 'Reviewed only'),
];

test('replace policy uses new marks for real coordinate conflicts', () => {
  const outcome = applyEditedMarks(existing, reviewed, { conflictPolicy: 'replace' });
  const conflict = outcome.result.find((item) => item.x === 32003);

  assert.deepEqual(
    { added: outcome.added, identical: outcome.identical, replaced: outcome.replaced, kept: outcome.kept },
    { added: 1, identical: 1, replaced: 1, kept: 0 },
  );
  assert.equal(outcome.conflicts.length, 1);
  assert.equal(conflict.description, 'Reviewed label');
  assert.equal(conflict.icon, 'mouth');
  assert.equal(outcome.total, 4);
});

test('keep policy preserves loaded marks for real coordinate conflicts', () => {
  const outcome = applyEditedMarks(existing, reviewed, { conflictPolicy: 'keep' });
  const conflict = outcome.result.find((item) => item.x === 32003);

  assert.deepEqual(
    { added: outcome.added, identical: outcome.identical, replaced: outcome.replaced, kept: outcome.kept },
    { added: 1, identical: 1, replaced: 0, kept: 1 },
  );
  assert.equal(conflict.description, 'Original label');
  assert.equal(conflict.icon, 'flag');
  assert.equal(outcome.total, 4);
});

test('coordinate-level choices can keep one conflict and replace another', () => {
  const moreExisting = [...existing, marker(32005, 'Second original', 'flag')];
  const moreReviewed = [...reviewed, marker(32005, 'Second reviewed', 'mouth')];
  const outcome = applyEditedMarks(moreExisting, moreReviewed, {
    conflictResolutions: {
      '32003,32000,7': 'keep',
      '32005,32000,7': 'replace',
    },
  });

  assert.equal(outcome.result.find((item) => item.x === 32003).description, 'Original label');
  assert.equal(outcome.result.find((item) => item.x === 32005).description, 'Second reviewed');
  assert.equal(outcome.replaced, 1);
  assert.equal(outcome.kept, 1);
  assert.deepEqual(outcome.conflicts.map((conflict) => conflict.resolution), ['keep', 'replace']);
});

test('remove mode deletes shared coordinates regardless of their contents', () => {
  const outcome = applyEditedMarks(existing, reviewed, {
    mode: 'remove',
    conflictPolicy: 'keep',
  });

  assert.equal(outcome.removed, 2);
  assert.deepEqual(outcome.result.map((item) => item.x), [32001]);
  assert.equal(outcome.total, 1);
});

test('unknown conflict policies are rejected', () => {
  assert.throws(
    () => applyEditedMarks(existing, reviewed, { conflictPolicy: 'surprise' }),
    /Unknown Edit Marks conflict policy/,
  );
});

test('audit log records the selected policy and both sides of each conflict', () => {
  const outcome = applyEditedMarks(existing, reviewed, { conflictPolicy: 'keep' });
  const log = buildAddMarksLog({
    generatedAt: new Date('2026-08-15T12:00:00Z'),
    userFilenames: ['markers.json'],
    backupFilenames: ['backup_markers.json'],
    mode: 'add',
    conflictPolicy: 'keep',
    existingCount: existing.length,
    addedCount: outcome.added,
    identicalCount: outcome.identical,
    replacedCount: outcome.replaced,
    keptCount: outcome.kept,
    conflicts: outcome.conflicts,
    removedCount: 0,
    totalCount: outcome.total,
    validationLine: 'OK',
    addedMarkers: reviewed,
  });

  assert.match(log, /Conflict policy: keep the marker already in the loaded file/);
  assert.match(log, /Different markers at the same coordinate: 1/);
  assert.match(log, /Original label.*Reviewed label/);
  assert.match(log, /kept loaded-file marker/);
});

test('audit log records mixed coordinate-by-coordinate conflict decisions', () => {
  const moreExisting = [...existing, marker(32005, 'Second original', 'flag')];
  const moreReviewed = [...reviewed, marker(32005, 'Second reviewed', 'mouth')];
  const outcome = applyEditedMarks(moreExisting, moreReviewed, {
    conflictResolutions: new Map([
      ['32003,32000,7', 'keep'],
      ['32005,32000,7', 'replace'],
    ]),
  });
  const log = buildAddMarksLog({
    generatedAt: new Date('2026-08-15T12:00:00Z'),
    userFilenames: ['markers.json'],
    backupFilenames: ['backup_markers.json'],
    mode: 'add',
    conflictPolicy: 'individual',
    existingCount: moreExisting.length,
    addedCount: outcome.added,
    identicalCount: outcome.identical,
    replacedCount: outcome.replaced,
    keptCount: outcome.kept,
    conflicts: outcome.conflicts,
    removedCount: 0,
    totalCount: outcome.total,
    validationLine: 'OK',
    addedMarkers: moreReviewed,
  });

  assert.match(log, /reviewed individually, coordinate by coordinate/);
  assert.match(log, /kept loaded-file marker/);
  assert.match(log, /used new marker/);
});
