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

test('replace policy uses reviewed marks for real coordinate conflicts', () => {
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
  }, 'en');

  assert.match(log, /Conflict policy: keep the mark already in the loaded file/);
  assert.match(log, /Different marks at the same coordinate: 1/);
  assert.match(log, /Original label.*Reviewed label/);
});
