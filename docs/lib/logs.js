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

function describeMarker(m) {
  return `icon=${m.icon ?? 'null'}, description="${m.description ?? ''}"`;
}

export function buildMergeLog({
  generatedAt, userFilenames, backupFilenames, communityCount, personalLoadedCount,
  addedCount, replacedCount, identicalCount, conflictCount, totalCount, conflicts,
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
    line(t('logReplaced'), n(replacedCount)),
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
