// Plain-text audit logs bundled into the output ZIP. Pure functions (take a
// `lang` explicitly) so they're testable without a DOM.
import { localeNumber, tFor } from './i18n.js';

function pad(n) {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD HH:MM:SS (UTC±HH:MM) -- for log headers. */
export function formatLogTimestamp(date) {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const offH = pad(Math.floor(Math.abs(offsetMin) / 60));
  const offM = pad(Math.abs(offsetMin) % 60);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} (UTC${sign}${offH}:${offM})`;
}

/** YYYY-MM-DD-HH-MM -- for backup filenames. */
export function formatBackupTimestamp(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

function line(label, value) {
  return `${label}: ${value}`;
}

export function buildConversionLog({
  generatedAt, sourceLabel, sourceFormatKey, outputFormatKey, markerCount, validationLine,
}, lang) {
  const t = (key, ...args) => tFor(lang, key, ...args);
  return [
    t('logTitleConversion'),
    `${t('logGeneratedAt')}: ${formatLogTimestamp(generatedAt)}`,
    '',
    line(t('logSourceFile'), sourceLabel),
    line(t('logSourceFormat'), t(sourceFormatKey)),
    line(t('logOutputFormat'), t(outputFormatKey)),
    line(t('logMarkersConverted'), localeNumber(markerCount, lang)),
    line(t('logValidation'), validationLine ?? t('logValidationOk')),
    line(t('logMarkersModified'), t('logMarkersModifiedNone')),
    line(t('logProcessingLocation'), t('logProcessingLocal')),
    '',
  ].join('\n');
}

export function buildExtractOwnLog({
  generatedAt, userFilenames, backupFilenames, sourceNames, referenceCount,
  uploadedCount, exactMatches, overrides, unique, totalCount, validationLine,
}, lang) {
  const t = (key, ...args) => tFor(lang, key, ...args);
  const n = (value) => localeNumber(value, lang);
  return [
    t('logTitleExtractOwn'),
    `${t('logGeneratedAt')}: ${formatLogTimestamp(generatedAt)}`,
    '',
    line(t('logUserFile'), userFilenames.join(', ')),
    line(t('logBackupFile'), backupFilenames.join(', ')),
    line(t('logReferenceSources'), sourceNames.join(', ')),
    line(t('logReferenceMarkers'), n(referenceCount)),
    line(t('logUploadedMarkers'), n(uploadedCount)),
    line(t('logPublishedRemoved'), n(exactMatches)),
    line(t('logPersonalOverrides'), n(overrides)),
    line(t('logPersonalUnique'), n(unique)),
    line(t('logTotal'), n(totalCount)),
    line(t('logValidation'), validationLine ?? t('logValidationOk')),
    line(t('logProcessingLocation'), t('logProcessingLocal')),
    '',
  ].join('\n');
}

function describeMarker(m) {
  return `icon=${m.icon ?? 'null'}, description="${m.description ?? ''}"`;
}

export function buildMarkerSetsLog({
  generatedAt, userFilenames, backupFilenames, setName, setCount,
  setCountsByName = [], mode, baseCount, addedCount, keptCount, removedCount,
  totalCount, validationLine,
}, lang) {
  const t = (key, ...args) => tFor(lang, key, ...args);
  const n = (value) => localeNumber(value, lang);
  const lines = [
    t('logTitleSets'),
    `${t('logGeneratedAt')}: ${formatLogTimestamp(generatedAt)}`,
    '',
    line(t('logUserFile'), userFilenames.join(', ')),
  ];
  if (backupFilenames.length) lines.push(line(t('logBackupFile'), backupFilenames.join(', ')));
  lines.push(
    line(t('logOutputFormat'), t('formatBin')),
    line(t('logSetName'), setName),
    line(t('logSetCount'), n(setCount)),
  );
  // With more than one picked, the total alone hides both the split and the
  // fact that collections can share a coordinate.
  if (setCountsByName.length > 1) {
    for (const [name, count] of setCountsByName) {
      lines.push(`  ${line(name, n(count))}`);
    }
    const listed = setCountsByName.reduce((sum, [, count]) => sum + count, 0);
    if (listed > setCount) lines.push(`  ${line(t('logSetShared'), n(listed - setCount))}`);
  }
  lines.push(
    line(t('logSetAction'), t(mode === 'remove' ? 'logSetActionRemove' : 'logSetActionAdd')),
    line(t('logExistingLoaded'), n(baseCount)),
  );
  if (mode === 'remove') {
    lines.push(line(t('logSetRemoved'), n(removedCount)));
  } else {
    lines.push(line(t('logSetAdded'), n(addedCount)), line(t('logSetKept'), n(keptCount)));
  }
  lines.push(
    line(t('logTotal'), n(totalCount)),
    line(t('logValidation'), validationLine ?? t('logValidationOk')),
    line(t('logProcessingLocation'), t('logProcessingLocal')),
    '',
  );
  return lines.join('\n');
}

export function buildAddMarksLog({
  generatedAt, userFilenames, backupFilenames, mode, conflictPolicy,
  existingCount, addedCount, identicalCount = 0, replacedCount,
  keptCount = 0, conflicts = [], removedCount, totalCount, validationLine,
  addedMarkers,
}, lang) {
  const t = (key, ...args) => tFor(lang, key, ...args);
  const n = (value) => localeNumber(value, lang);
  const keepingConflicts = conflictPolicy === 'keep';
  const lines = [
    t('logTitleAddMarks'),
    `${t('logGeneratedAt')}: ${formatLogTimestamp(generatedAt)}`,
    '',
    line(t('logUserFile'), userFilenames.length ? userFilenames.join(', ') : t('logNoFile')),
  ];
  if (backupFilenames.length) {
    lines.push(line(t('logBackupFile'), backupFilenames.join(', ')));
  }
  lines.push(
    line(t('logOutputFormat'), t('formatBin')),
    line(t('logSetAction'), t(mode === 'remove' ? 'logSetActionRemove' : 'logSetActionAdd')),
    line(t('logExistingLoaded'), n(existingCount)),
  );
  if (mode === 'remove') {
    lines.push(line(t('logSetRemoved'), n(removedCount)));
  } else {
    lines.push(
      line(t('logMarkersCreated'), n(addedCount)),
      line(t('logEditIdentical'), n(identicalCount)),
      line(t('logEditConflicts'), n(conflicts.length)),
    );
    if (conflicts.length > 0) {
      lines.push(
        line(t('logEditConflictPolicy'), t(keepingConflicts ? 'logEditPolicyKeep' : 'logEditPolicyReplace')),
        line(t(keepingConflicts ? 'logKept' : 'logReplaced'), n(keepingConflicts ? keptCount : replacedCount)),
      );
    }
  }
  lines.push(
    line(t('logTotal'), n(totalCount)),
    line(t('logValidation'), validationLine ?? t('logValidationOk')),
    line(t('logProcessingLocation'), t('logProcessingLocal')),
  );
  if (mode !== 'remove' && conflicts.length > 0) {
    lines.push('', t('logEditConflictsHeader'));
    for (const conflict of conflicts) {
      const marker = conflict.incoming;
      lines.push(`  (${marker.x}, ${marker.y}, ${marker.z}): ${describeMarker(conflict.existing)} -> ${describeMarker(marker)}`);
    }
  }
  // The list is what the user reviewed either way -- what was considered for
  // writing, or which coordinates were taken out.
  lines.push('', t(mode === 'remove' ? 'logRemovedListHeader' : 'logReviewedListHeader'));
  for (const m of addedMarkers) {
    lines.push(`  (${m.x}, ${m.y}, ${m.z}): ${describeMarker(m)}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function buildMergeLog({
  generatedAt, userFilenames, backupFilenames, communityCount, personalLoadedCount,
  addedCount, identicalCount, conflictCount, totalCount, conflicts,
}, lang) {
  const t = (key, ...args) => tFor(lang, key, ...args);
  const n = (value) => localeNumber(value, lang);
  const lines = [
    t('logTitleMerge'),
    `${t('logGeneratedAt')}: ${formatLogTimestamp(generatedAt)}`,
    '',
    line(t('logUserFile'), userFilenames.join(', ')),
    line(t('logBackupFile'), backupFilenames.join(', ')),
    line(t('logCommunityLoaded'), n(communityCount)),
    line(t('logPersonalLoaded'), n(personalLoadedCount)),
    line(t('logAdded'), n(addedCount)),
    line(t('logIdentical'), n(identicalCount)),
    line(t('logConflicts'), n(conflictCount)),
    line(t('logTotal'), n(totalCount)),
    line(t('logPolicy'), t('logPolicyText')),
    line(t('logProcessingLocation'), t('logProcessingLocal')),
    '',
    t('logConflictsListHeader'),
  ];
  if (conflicts.length === 0) {
    lines.push(t('logConflictsListEmpty'));
  } else {
    for (const c of conflicts) {
      lines.push(`  (${c.x}, ${c.y}, ${c.z}): ${describeMarker(c.community)} -> ${describeMarker(c.yours)}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}
