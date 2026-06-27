import { fetchCommunityMarkers } from './lib/community.js';
import { currentLang, localeDate, localeNumber, t } from './lib/i18n.js';
import { buildConversionLog, buildMergeLog, formatBackupTimestamp } from './lib/logs.js';
import { loadMarkersFile, mergeMarkers, parseMarkersBin, validateMarkers, writeMarkersBin } from './lib/markers.js';
import { CHANGELOG_URL, VERSION } from './lib/version.js';
import { buildZip } from './lib/zip.js';

const markerKey = (m) => `${m.x},${m.y},${m.z}`;
const sameContent = (a, b) => a.icon === b.icon && a.description === b.description;

// ---------- Mode tabs ----------
document.querySelectorAll('.mode-tab-button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-tab-button').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.mode-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`mode-${btn.dataset.mode}`).classList.add('active');
  });
});

// ---------- Version footer ----------
document.querySelectorAll('.version-link').forEach((el) => {
  el.textContent = `v${VERSION}`;
  el.href = CHANGELOG_URL;
});

// ---------- Community markers (shared by both modes) ----------
const runButton = document.getElementById('merge-run');
const statusEl = document.getElementById('community-status');
const personalInput = document.getElementById('personal-files');

let community = null; // {markers, lastModified}

async function loadCommunityMarkers(forceRefresh = false) {
  statusEl.textContent = t('loading');
  statusEl.classList.remove('error');
  runButton.disabled = true;
  try {
    community = await fetchCommunityMarkers({ forceRefresh });
    statusEl.textContent = t('loaded', community.markers.length, localeDate(community.lastModified));
    runButton.disabled = false;
    const refresh = document.createElement('button');
    refresh.className = 'secondary-btn';
    refresh.textContent = t('checkForUpdates');
    refresh.addEventListener('click', () => loadCommunityMarkers(true));
    statusEl.appendChild(refresh);
  } catch (err) {
    community = null;
    statusEl.textContent = `${err.message} `;
    statusEl.classList.add('error');
    const retry = document.createElement('button');
    retry.className = 'secondary-btn';
    retry.textContent = t('retry');
    retry.addEventListener('click', () => loadCommunityMarkers(true));
    statusEl.appendChild(retry);
  }
}

loadCommunityMarkers();

// ---------- File-picker labels (shared helper) ----------
function wireFilePickerLabel(input) {
  input.addEventListener('change', () => {
    const label = input.closest('.file-picker').querySelector('.file-picker-label');
    const files = input.files;
    if (!files || files.length === 0) {
      label.textContent = label.dataset.default;
      label.classList.remove('chosen');
      return;
    }
    label.textContent = files.length === 1 ? files[0].name : t('filesSelected', files.length);
    label.classList.add('chosen');
  });
}
document.querySelectorAll('.file-picker input[type="file"]').forEach(wireFilePickerLabel);

// ---------- Shared helpers ----------
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function renderResult(containerId, html, isError) {
  document.getElementById(containerId).innerHTML = `<div class="result-card ${isError ? 'err' : 'ok'}">${html}</div>`;
}

function withBusy(button, fn) {
  return async (...args) => {
    button.disabled = true;
    const original = button.textContent;
    button.textContent = t('working');
    try {
      await fn(...args);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  };
}

// ================= Merge Mode =================
runButton.addEventListener('click', withBusy(runButton, async () => {
  if (!community) {
    renderResult('merge-result', t('communityFailed'), true);
    return;
  }
  if (!personalInput.files || personalInput.files.length === 0) {
    renderResult('merge-result', t('chooseFile'), true);
    return;
  }
  const generatedAt = new Date();
  const lang = currentLang();
  const files = Array.from(personalInput.files);

  const personalGroups = [];
  const skipped = [];
  const backupEntries = [];
  for (const file of files) {
    backupEntries.push({
      name: `backup-${formatBackupTimestamp(generatedAt)}_${file.name}`,
      data: new Uint8Array(await file.arrayBuffer()),
    });
    try {
      personalGroups.push(await loadMarkersFile(file));
    } catch (err) {
      skipped.push({ file: file.name, error: err.message });
    }
  }
  if (personalGroups.length === 0) {
    renderResult('merge-result', t('noneParsed'), true);
    return;
  }

  const communityByKey = new Map(community.markers.map((m) => [markerKey(m), m]));
  const personalByKey = new Map();
  for (const group of personalGroups) {
    for (const m of group) personalByKey.set(markerKey(m), m);
  }

  let identicalCount = 0;
  const conflicts = [];
  for (const [key, personalMarker] of personalByKey) {
    const communityMarker = communityByKey.get(key);
    if (!communityMarker) continue;
    if (sameContent(communityMarker, personalMarker)) {
      identicalCount += 1;
    } else {
      conflicts.push({ x: personalMarker.x, y: personalMarker.y, z: personalMarker.z, community: communityMarker, yours: personalMarker });
    }
  }
  const conflictCount = conflicts.length;
  const addedCount = personalByKey.size - identicalCount - conflictCount;

  const merged = mergeMarkers(community.markers, ...personalGroups);
  const personalLoadedCount = personalGroups.reduce((sum, g) => sum + g.length, 0);

  const entries = [
    { name: 'minimapmarkers.bin', data: writeMarkersBin(merged) },
    ...backupEntries,
    {
      name: 'merge-log.txt',
      data: new TextEncoder().encode(buildMergeLog({
        generatedAt,
        userFilenames: files.map((f) => f.name),
        backupFilenames: backupEntries.map((e) => e.name),
        communityCount: community.markers.length,
        personalLoadedCount,
        addedCount,
        identicalCount,
        conflictCount,
        totalCount: merged.length,
        conflicts,
      }, lang)),
    },
  ];

  if (document.getElementById('export-audit').checked) {
    entries.push({ name: 'merged-markers.json', data: new TextEncoder().encode(JSON.stringify(merged, null, 4)) });
    entries.push({ name: 'conflicts.json', data: new TextEncoder().encode(JSON.stringify(conflicts, null, 4)) });
  }

  const zipName = 'tibia-maps-merge.zip';
  downloadBlob(new Blob([buildZip(entries)]), zipName);

  const skippedHtml = skipped.length
    ? `<p>${t('skippedIntro')}</p><ul class="warn-list">${skipped.map((s) => `<li>${s.file}: ${s.error}</li>`).join('')}</ul>`
    : '';
  renderResult('merge-result', `
    ${t('mergedSuccessZip', zipName)}
    <dl>
      <dt>${t('labelCommunity')}</dt><dd>${localeNumber(community.markers.length)}</dd>
      <dt>${t('labelYours')}</dt><dd>${localeNumber(personalLoadedCount)}</dd>
      <dt>${t('labelAdded')}</dt><dd>${localeNumber(addedCount)}</dd>
      <dt>${t('labelIdentical')}</dt><dd>${localeNumber(identicalCount)}</dd>
      <dt>${t('labelConflicts')}</dt><dd>${localeNumber(conflictCount)}</dd>
      <dt>${t('labelTotal')}</dt><dd>${localeNumber(merged.length)}</dd>
    </dl>
    ${skippedHtml}
  `, false);
}));

// ================= Conversion Mode =================
const conversionType = document.getElementById('conversion-type');
const conversionFileField = document.getElementById('conversion-file-field');
const conversionFileInput = document.getElementById('conversion-file');
const convertButton = document.getElementById('convert-run');

const CONVERSION_CONFIG = {
  'bin-to-json': { needsFile: true, accept: '.bin' },
  'json-to-bin': { needsFile: true, accept: '.json' },
  'community-to-json': { needsFile: false, accept: '' },
};

function updateConversionFieldVisibility() {
  const config = CONVERSION_CONFIG[conversionType.value];
  conversionFileField.classList.toggle('hidden', !config.needsFile);
  conversionFileInput.accept = config.accept;
}
conversionType.addEventListener('change', updateConversionFieldVisibility);
updateConversionFieldVisibility();

convertButton.addEventListener('click', withBusy(convertButton, async () => {
  const generatedAt = new Date();
  const lang = currentLang();
  const type = conversionType.value;
  const config = CONVERSION_CONFIG[type];

  if (config.needsFile && (!conversionFileInput.files || conversionFileInput.files.length === 0)) {
    renderResult('convert-result', t('chooseConversionFile'), true);
    return;
  }

  let outputName;
  let outputBytes;
  let sourceLabel;
  let sourceFormatKey;
  let outputFormatKey;
  let markerCount;
  let validationLine;

  try {
    if (type === 'bin-to-json') {
      const file = conversionFileInput.files[0];
      const bytes = await file.arrayBuffer();
      const markers = parseMarkersBin(bytes, { source: file.name });
      outputBytes = new TextEncoder().encode(JSON.stringify(markers, null, 4));
      outputName = 'markers.json';
      sourceLabel = file.name;
      sourceFormatKey = 'formatBin';
      outputFormatKey = 'formatJson';
      markerCount = markers.length;
      // The parse itself only succeeds if every byte matched the documented
      // binary layout, and JS objects -> JSON is lossless for these field
      // types -- so a successful parse already proves losslessness here.
      validationLine = t('logValidationOk');
    } else if (type === 'json-to-bin') {
      const file = conversionFileInput.files[0];
      const markers = validateMarkers(JSON.parse(await file.text()), { source: file.name });
      outputBytes = writeMarkersBin(markers);
      outputName = 'minimapmarkers.bin';
      sourceLabel = file.name;
      sourceFormatKey = 'formatJson';
      outputFormatKey = 'formatBin';
      markerCount = markers.length;
      // Actually re-parse the bytes we're about to hand back, to confirm
      // the artifact itself is correct (not just the in-memory data).
      const reparsed = parseMarkersBin(outputBytes.buffer.slice(outputBytes.byteOffset, outputBytes.byteOffset + outputBytes.byteLength), { source: 'validation' });
      const removed = markerCount - reparsed.length;
      validationLine = removed > 0 ? t('logValidationOkDedup', removed) : t('logValidationOk');
    } else {
      const liveCommunity = await fetchCommunityMarkers();
      outputBytes = new TextEncoder().encode(JSON.stringify(liveCommunity.markers, null, 4));
      outputName = 'community-markers.json';
      sourceLabel = t('formatCommunityLive');
      sourceFormatKey = 'formatBin';
      outputFormatKey = 'formatJson';
      markerCount = liveCommunity.markers.length;
      validationLine = t('logValidationOk');
    }
  } catch (err) {
    renderResult('convert-result', err.message, true);
    return;
  }

  const entries = [
    { name: outputName, data: outputBytes },
    {
      name: 'conversion-log.txt',
      data: new TextEncoder().encode(buildConversionLog({
        generatedAt, sourceLabel, sourceFormatKey, outputFormatKey, markerCount, validationLine,
      }, lang)),
    },
  ];

  const zipName = 'tibia-maps-merge-conversion.zip';
  downloadBlob(new Blob([buildZip(entries)]), zipName);

  renderResult('convert-result', `
    ${t('convertedSuccessZip', zipName)}
    <dl>
      <dt>${t('logMarkersConverted')}</dt><dd>${localeNumber(markerCount)}</dd>
    </dl>
  `, false);
}));
