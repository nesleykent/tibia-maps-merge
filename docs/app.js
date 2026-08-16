import { fetchCommunityMarkers } from './lib/community.js';
import { applyEditedMarks } from './lib/edit-marks.js';
import { extractOwnMarkers } from './lib/extract-markers.js';
import { DEFAULT_ICON, MARKER_ICONS, iconGlyph } from './lib/icons.js';
import { currentLang, iconLabel, localeDate, localeNumber, t } from './lib/i18n.js';
import { buildAddMarksLog, buildConversionLog, buildExtractOwnLog, buildMarkerSetsLog, buildMergeLog, formatBackupTimestamp } from './lib/logs.js';
import { checkMarkerFields, parseMarkerLines, resolveIcon, toInteger } from './lib/marker-input.js';
import { loadMarkersFile, mergeMarkers, parseMarkersBin, validateMarkers, writeMarkersBin } from './lib/markers.js';
import { MARKER_SETS, applyMarkerSet, fetchMarkerSet, fetchSetDates } from './lib/marker-sets.js';
import { buildQuestPrompt, questPromptVariant } from './lib/prompt.js';
import { fetchQuestCoordinates } from './lib/wiki.js';
import { CHANGELOG_URL, VERSION } from './lib/version.js';
import { buildZip } from './lib/zip.js';

const markerKey = (m) => `${m.x},${m.y},${m.z}`;
const sameContent = (a, b) => a.icon === b.icon && a.description === b.description;

// ---------- Mode tabs ----------
// ---------- Sheets ----------
// Every sheet opens and closes the same way, declared in the markup rather
// than wired one at a time: three of them had their own near-identical pair of
// listeners, and each new sheet was another copy. Clicking the backdrop closes
// any of them, which is what Escape already did.
for (const opener of document.querySelectorAll('[data-open-sheet]')) {
  opener.addEventListener('click', () => document.getElementById(opener.dataset.openSheet).showModal());
}

for (const closer of document.querySelectorAll('[data-close-sheet]')) {
  closer.addEventListener('click', () => document.getElementById(closer.dataset.closeSheet).close());
}

for (const sheet of document.querySelectorAll('dialog.sheet')) {
  // Dismissing is never the completing action, so this only ever cancels.
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet) sheet.close();
  });
}

// ---------- Modes ----------
// A real tablist: one tab in the tab order at a time, arrow keys between them,
// and each panel named by its tab. The mode also lives in the URL, so a mode
// can be linked to and survives a reload -- replaceState rather than pushState,
// since a tab is a view of one page and shouldn't cost a press of Back.
const modeTabs = [...document.querySelectorAll('.mode-tab-button')];

function selectMode(mode, { focus = false, updateUrl = true } = {}) {
  const tab = modeTabs.find((b) => b.dataset.mode === mode);
  if (!tab) return;
  for (const other of modeTabs) {
    const isCurrent = other === tab;
    other.classList.toggle('active', isCurrent);
    other.setAttribute('aria-selected', String(isCurrent));
    other.tabIndex = isCurrent ? 0 : -1;
    document.getElementById(`mode-${other.dataset.mode}`).classList.toggle('active', isCurrent);
  }
  if (focus) tab.focus();
  if (updateUrl) history.replaceState(null, '', `#${tab.dataset.slug}`);
  if (mode === 'sets') fillSetDates();
}

modeTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectMode(tab.dataset.mode));
  tab.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: modeTabs.length - 1 - index }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    // Wraps, the way a tablist is expected to.
    selectMode(modeTabs[(index + step + modeTabs.length) % modeTabs.length].dataset.mode, { focus: true });
  });
});

const modeForHash = () => modeTabs.find((b) => b.dataset.slug === location.hash.slice(1))?.dataset.mode;

// A link into a mode should open it, but an unrecognised hash is left alone --
// it may well be meant for something else on the page. The initial restore
// runs at the very end of this file: selecting Marker Sets asks for the set
// dates, whose state is declared further down.
window.addEventListener('hashchange', () => {
  const mode = modeForHash();
  if (mode) selectMode(mode, { updateUrl: false });
});

// ---------- Version footer ----------
document.querySelectorAll('.version-link').forEach((el) => {
  el.textContent = `v${VERSION}`;
  el.href = CHANGELOG_URL;
});

// ---------- Your markers (one shared input for every tool) ----------
const yourMarkersInput = document.getElementById('your-marker-files');
const yourMarkersStatus = document.getElementById('your-markers-status');
const yourMarkersClear = document.getElementById('your-markers-clear');

let yourMarkerFiles = [];
let yourMarkerGroups = [];
let yourMarkers = [];
let yourMarkersSkipped = [];
let yourMarkersLoad = Promise.resolve();

// ---------- Community markers (shared by Merge and Extract Own) ----------
const runButton = document.getElementById('merge-run');
const statusEl = document.getElementById('community-status');
const mergePreview = document.getElementById('merge-preview');

let community = null; // {markers, lastModified}
let communityLoad = Promise.resolve();
let communityError = null;

async function loadCommunityMarkers(forceRefresh = false) {
  statusEl.textContent = t('loading');
  statusEl.classList.remove('error');
  runButton.disabled = true;
  refreshMergePreview();
  try {
    community = await fetchCommunityMarkers({ forceRefresh });
    communityError = null;
    statusEl.textContent = t('loaded', community.markers.length, localeDate(community.lastModified));
    runButton.disabled = yourMarkers.length === 0;
    const refresh = document.createElement('button');
    refresh.className = 'secondary-btn';
    refresh.textContent = t('checkForUpdates');
    refresh.addEventListener('click', () => { communityLoad = loadCommunityMarkers(true); });
    statusEl.appendChild(refresh);
    refreshMergePreview();
    refreshExtractPreview();
  } catch (err) {
    community = null;
    communityError = err;
    statusEl.textContent = `${err.message} `;
    statusEl.classList.add('error');
    const retry = document.createElement('button');
    retry.className = 'secondary-btn';
    retry.textContent = t('retry');
    retry.addEventListener('click', () => { communityLoad = loadCommunityMarkers(true); });
    statusEl.appendChild(retry);
    refreshMergePreview();
    refreshExtractPreview();
  }
}

communityLoad = loadCommunityMarkers();

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

function syncYourMarkersConsumers() {
  runButton.disabled = !community || yourMarkers.length === 0;
  refreshMergePreview();
  updateConversionSourceOptions();
  renderPending();
  refreshSetsPreview();
  refreshExtractPreview();
}

function clearYourMarkersResults() {
  for (const id of ['merge-result', 'convert-result', 'add-result', 'sets-result', 'extract-result']) {
    document.getElementById(id).textContent = '';
  }
}

async function loadYourMarkers() {
  clearYourMarkersResults();
  const files = Array.from(yourMarkersInput.files || []);
  yourMarkerFiles = files;
  yourMarkerGroups = [];
  yourMarkers = [];
  yourMarkersSkipped = [];
  conflictResolutions = new Map();
  yourMarkersStatus.classList.remove('error');
  yourMarkersClear.classList.toggle('hidden', files.length === 0);

  if (files.length === 0) {
    yourMarkersStatus.textContent = '';
    syncYourMarkersConsumers();
    return;
  }

  yourMarkersStatus.textContent = t('loading');
  for (const file of files) {
    try {
      yourMarkerGroups.push(await loadMarkersFile(file));
    } catch (err) {
      yourMarkersSkipped.push({ file: file.name, error: err.message });
    }
  }

  if (yourMarkerGroups.length === 0) {
    yourMarkersStatus.textContent = t('noneParsed');
    yourMarkersStatus.classList.add('error');
    syncYourMarkersConsumers();
    return;
  }

  yourMarkers = mergeMarkers(...yourMarkerGroups);
  yourMarkersStatus.textContent = t(
    'yourMarkersLoaded',
    yourMarkers.length,
    files.map((file) => file.name).join(', '),
    yourMarkersSkipped.length,
  );
  syncYourMarkersConsumers();
}

yourMarkersInput.addEventListener('change', () => {
  yourMarkersLoad = loadYourMarkers();
});

yourMarkersClear.addEventListener('click', () => {
  yourMarkersInput.value = '';
  const label = yourMarkersInput.closest('.file-picker').querySelector('.file-picker-label');
  label.textContent = label.dataset.default;
  label.classList.remove('chosen');
  yourMarkersLoad = loadYourMarkers();
  yourMarkersInput.focus();
});

// ---------- Drag and drop onto the shared picker ----------
// The dashed border already reads as a drop target; without this, dragging a
// file onto it did the opposite of what it looked like -- the browser
// navigated to the file and any unsaved work in the tab was gone. A page-wide
// guard stops that outcome even on a near miss a few pixels outside the
// picker; only a drop that actually lands on the picker is accepted.
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => {
  if (!event.target.closest('.workspace-picker')) event.preventDefault();
});

const yourMarkersPicker = yourMarkersInput.closest('.workspace-picker');
yourMarkersPicker.addEventListener('dragenter', (event) => {
  event.preventDefault();
  yourMarkersPicker.classList.add('drag-over');
});
yourMarkersPicker.addEventListener('dragover', (event) => event.preventDefault());
yourMarkersPicker.addEventListener('dragleave', (event) => {
  if (event.target === yourMarkersPicker) yourMarkersPicker.classList.remove('drag-over');
});
yourMarkersPicker.addEventListener('drop', (event) => {
  event.preventDefault();
  yourMarkersPicker.classList.remove('drag-over');
  const { files } = event.dataTransfer;
  if (!files || files.length === 0) return;
  yourMarkersInput.files = files;
  yourMarkersInput.dispatchEvent(new Event('change', { bubbles: true }));
});

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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
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

/**
 * Action -> result -> undo, for a reversible removal that doesn't need a
 * confirmation dialog interrupting it up front. `onUndo` restores whatever
 * was removed; the toast clears itself after a few seconds if not used.
 */
function showUndoToast(message, onUndo) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  const text = document.createElement('span');
  text.textContent = message;
  const undo = document.createElement('button');
  undo.type = 'button';
  undo.className = 'link-btn';
  undo.textContent = t('undoAction');
  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    toast.remove();
  };
  undo.addEventListener('click', () => {
    dismiss();
    onUndo();
  });
  toast.append(text, undo);
  toastRegion.appendChild(toast);
  timer = setTimeout(dismiss, 8000);
}

async function backupYourMarkerFiles(generatedAt) {
  return Promise.all(yourMarkerFiles.map(async (file) => ({
    name: `backup-${formatBackupTimestamp(generatedAt)}_${file.name}`,
    data: new Uint8Array(await file.arrayBuffer()),
  })));
}

// ================= Merge Mode =================
function analyzeMerge() {
  if (!community || yourMarkers.length === 0) return null;
  const communityByKey = new Map(community.markers.map((marker) => [markerKey(marker), marker]));
  const personalByKey = new Map(yourMarkers.map((marker) => [markerKey(marker), marker]));
  let identicalCount = 0;
  const conflicts = [];

  for (const [key, personalMarker] of personalByKey) {
    const communityMarker = communityByKey.get(key);
    if (!communityMarker) continue;
    if (sameContent(communityMarker, personalMarker)) {
      identicalCount += 1;
    } else {
      conflicts.push({
        x: personalMarker.x,
        y: personalMarker.y,
        z: personalMarker.z,
        community: communityMarker,
        yours: personalMarker,
      });
    }
  }

  return {
    personalLoadedCount: yourMarkerGroups.reduce((sum, group) => sum + group.length, 0),
    addedCount: personalByKey.size - identicalCount - conflicts.length,
    identicalCount,
    conflictCount: conflicts.length,
    conflicts,
    merged: mergeMarkers(community.markers, yourMarkers),
  };
}

function refreshMergePreview() {
  if (!mergePreview) return;
  const analysis = analyzeMerge();
  if (!analysis) {
    const message = communityError ? t('communityFailed')
      : community ? t('mergePreviewNeedsMarkers') : t('loading');
    mergePreview.innerHTML = `<div class="result-card"><p>${escapeHtml(message)}</p></div>`;
    return;
  }

  mergePreview.innerHTML = `<div class="result-card ok"><dl>`
    + `<dt>${t('labelCommunity')}</dt><dd>${localeNumber(community.markers.length)}</dd>`
    + `<dt>${t('labelYours')}</dt><dd>${localeNumber(analysis.personalLoadedCount)}</dd>`
    + `<dt>${t('labelAdded')}</dt><dd>${localeNumber(analysis.addedCount)}</dd>`
    + `<dt>${t('labelIdentical')}</dt><dd>${localeNumber(analysis.identicalCount)}</dd>`
    + `<dt>${t('labelConflicts')}</dt><dd>${localeNumber(analysis.conflictCount)}</dd>`
    + `<dt>${t('labelTotal')}</dt><dd>${localeNumber(analysis.merged.length)}</dd>`
    + '</dl></div>';
}

runButton.addEventListener('click', withBusy(runButton, async () => {
  await yourMarkersLoad;
  if (!community) {
    renderResult('merge-result', t('communityFailed'), true);
    return;
  }
  if (yourMarkers.length === 0) {
    renderResult('merge-result', t('chooseFile'), true);
    return;
  }
  const generatedAt = new Date();
  const lang = currentLang();
  const backupEntries = await backupYourMarkerFiles(generatedAt);

  const analysis = analyzeMerge();
  const { addedCount, identicalCount, conflictCount, conflicts, merged, personalLoadedCount } = analysis;

  const entries = [
    { name: 'minimapmarkers.bin', data: writeMarkersBin(merged) },
    ...backupEntries,
    {
      name: 'merge-log.txt',
      data: new TextEncoder().encode(buildMergeLog({
        generatedAt,
        userFilenames: yourMarkerFiles.map((file) => file.name),
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

  const skippedHtml = yourMarkersSkipped.length
    ? `<p>${t('skippedIntro')}</p><ul class="warn-list">${yourMarkersSkipped.map((s) => `<li>${escapeHtml(s.file)}: ${escapeHtml(s.error)}</li>`).join('')}</ul>`
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
const conversionSource = document.getElementById('conversion-source');
const convertButton = document.getElementById('convert-run');

const CONVERSION_CONFIG = {
  'bin-to-json': { needsFile: true, accept: '.bin', output: 'markers.json' },
  'json-to-bin': { needsFile: true, accept: '.json', output: 'minimapmarkers.bin' },
  'community-to-json': { needsFile: false, accept: '', output: 'community-markers.json' },
};

function updateConversionSourceOptions() {
  if (!conversionSource) return;
  const config = CONVERSION_CONFIG[conversionType.value];
  const previous = conversionSource.value;
  const accepted = yourMarkerFiles
    .map((file, index) => ({ file, index }))
    .filter(({ file }) => file.name.toLowerCase().endsWith(config.accept));

  conversionSource.textContent = '';
  if (accepted.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = t('chooseConversionFile');
    conversionSource.appendChild(option);
    conversionSource.disabled = true;
    return;
  }

  for (const { file, index } of accepted) {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = file.name;
    conversionSource.appendChild(option);
  }
  conversionSource.disabled = false;
  if ([...conversionSource.options].some((option) => option.value === previous)) {
    conversionSource.value = previous;
  }
}

function updateConversionFieldVisibility() {
  const config = CONVERSION_CONFIG[conversionType.value];
  conversionFileField.classList.toggle('hidden', !config.needsFile);
  updateConversionSourceOptions();
  // Every primary action in the app names what it produces, so this one
  // follows the chosen conversion.
  convertButton.textContent = t('downloadFile', config.output);
}
conversionType.addEventListener('change', updateConversionFieldVisibility);
updateConversionFieldVisibility();

convertButton.addEventListener('click', withBusy(convertButton, async () => {
  await yourMarkersLoad;
  const generatedAt = new Date();
  const lang = currentLang();
  const type = conversionType.value;
  const config = CONVERSION_CONFIG[type];

  const sourceIndex = conversionSource.value === '' ? null : Number(conversionSource.value);
  const sourceFile = config.needsFile && sourceIndex !== null ? yourMarkerFiles[sourceIndex] : null;
  if (config.needsFile && !sourceFile) {
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
      const file = sourceFile;
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
      const file = sourceFile;
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

// ================= Edit Marks Mode =================
// Markers typed in here are ordinary marker objects, so they go through the
// exact same pipeline as an uploaded file: merged by coordinate with whatever
// the user loaded, then validated, serialized, and round-trip checked with
// the shared parser/encoder.

// Hand-typed markers are easy to lose to a stray reload, so the pending list
// is mirrored into localStorage -- best-effort, like the community cache.
const PENDING_KEY = 'tibia-maps-merge:pending-markers:v1';

const wikiUrlField = document.getElementById('wiki-url');
const wikiImportButton = document.getElementById('wiki-import');
const wikiStatus = document.getElementById('wiki-status');
const coordsField = document.getElementById('mark-coords');
const markLabelField = document.getElementById('mark-label');
const addButton = document.getElementById('add-marks');
const addFeedback = document.getElementById('add-feedback');
const addRows = document.getElementById('add-rows');
const reviewStep = document.getElementById('review-step');
const addClearButton = document.getElementById('add-clear');
const reviewConflicts = document.getElementById('review-conflicts');
const markApplyStep = document.getElementById('mark-apply-step');
const markPreview = document.getElementById('mark-preview');
const markDirectionHint = document.getElementById('mark-direction-hint');
const addRunButton = document.getElementById('add-run');
const clearSheet = document.getElementById('clear-sheet');
const addSelectionToolbar = document.getElementById('add-selection-toolbar');
const addSelectionCount = document.getElementById('add-selection-count');
const addDeleteSelectedButton = document.getElementById('add-delete-selected');
const addSelectAllCheckbox = document.getElementById('add-select-all');
const toastRegion = document.getElementById('toast-region');

/**
 * Build the icon picker in `container`: every marker type the format supports,
 * laid out as one grid you pick from directly. No dropdown and no sheet in
 * between -- choosing an icon is a single click on the icon itself.
 *
 * Backed by real radio inputs, so the group behaves the way a picker should:
 * one selection, arrow keys move between options, and each option carries its
 * icon's name for screen readers. The values are the canonical icon names --
 * the numeric type byte is looked up from those by the encoder, never stored
 * in the UI.
 */
function mountIconField(container) {
  const group = container.dataset.iconField;
  container.setAttribute('role', 'radiogroup');
  container.setAttribute('aria-labelledby', `${group}-label`);

  for (const { id, name } of MARKER_ICONS) {
    const choice = document.createElement('label');
    choice.className = 'icon-choice';
    choice.title = `${iconLabel(name)} (0x${id.toString(16).toUpperCase().padStart(2, '0')})`;

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = group;
    input.value = name;
    input.className = 'visually-hidden';
    input.checked = name === DEFAULT_ICON;

    const glyph = document.createElement('span');
    glyph.className = 'icon-choice-glyph';
    glyph.innerHTML = iconGlyph(name, { size: 22 });

    const label = document.createElement('span');
    label.className = 'visually-hidden';
    label.textContent = iconLabel(name);

    choice.append(input, glyph, label);
    container.appendChild(choice);
  }

  const inputs = [...container.querySelectorAll('input[type="radio"]')];
  return {
    get value() {
      return (inputs.find((i) => i.checked) ?? inputs[0]).value;
    },
    set value(name) {
      const match = inputs.find((i) => i.value === name);
      if (match) match.checked = true;
    },
  };
}

// ---------- Icon name reference ----------
// The picker itself shows icons only -- names would just be noise to anyone
// who plays the game. They matter in one place: typing an icon at the end of
// a coordinate line, so they live in a reference sheet opened from that hint.
document.getElementById('icon-names-list').innerHTML = MARKER_ICONS.map(({ id, name }) => (
  `<div class="icon-name">${iconGlyph(name, { size: 22 })}`
  + `<code>${escapeHtml(name)}</code>`
  + `<span class="icon-name-byte">0x${id.toString(16).toUpperCase().padStart(2, '0')}</span></div>`
)).join('');

const markIconSelect = mountIconField(document.querySelector('[data-icon-field="mark-icon"]'));

// ---------- Pending marker list ----------
function loadPending() {
  try {
    const stored = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];
    return stored
      .map((m) => ({
        description: String(m?.description ?? ''),
        icon: resolveIcon(m?.icon),
        x: m?.x, y: m?.y, z: m?.z,
      }))
      .filter((m) => m.icon !== null && checkMarkerFields(m) === null);
  } catch {
    return [];
  }
}

function savePending() {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Best-effort only -- private browsing or a full quota shouldn't break the list.
  }
}

let pending = loadPending();
let conflictResolutions = new Map();

// Selection is keyed by coordinate, the same identity `upsertMarker` already
// treats as unique -- stable across re-renders and row reordering, unlike an
// index into `pending`. The one row mid-edit is tracked the same way, so at
// most one row can be in edit mode at a time.
let selectedKeys = new Set();
let editingKey = null;
let lastCheckedIndex = null;

// tibiamaps.io's map takes the position in its fragment, with a zoom level
// after the colon: https://tibiamaps.io/map#33281,31724,7:1
const mapUrl = (m) => `https://tibiamaps.io/map#${m.x},${m.y},${m.z}:1`;

const MAP_PIN_SVG = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">'
  + '<path d="M8 1.6c2.5 0 4.5 2 4.5 4.5 0 3.2-4.5 8.3-4.5 8.3S3.5 9.3 3.5 6.1c0-2.5 2-4.5 4.5-4.5z" '
  + 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'
  + '<circle cx="8" cy="6.1" r="1.7" fill="currentColor"/></svg>';

function createMapLink(marker, coordinates) {
  const link = document.createElement('a');
  link.className = 'map-link';
  link.href = mapUrl(marker);
  link.target = '_blank';
  link.rel = 'noopener';
  link.title = t('viewOnMap', coordinates);
  link.innerHTML = `${MAP_PIN_SVG}<span class="visually-hidden"></span>`;
  link.querySelector('.visually-hidden').textContent = t('viewOnMap', coordinates);
  return link;
}

function conflictSignature(existing, incoming) {
  return [
    markerKey(incoming),
    existing.icon,
    existing.description,
    incoming.icon,
    incoming.description,
  ].join('\u0000');
}

function currentReviewConflicts() {
  const existingByKey = new Map(yourMarkers.map((marker) => [markerKey(marker), marker]));
  return pending.flatMap((incoming) => {
    const existing = existingByKey.get(markerKey(incoming));
    if (!existing || sameContent(existing, incoming)) return [];
    return [{
      existing,
      incoming,
      coordinateKey: markerKey(incoming),
      signature: conflictSignature(existing, incoming),
    }];
  });
}

function resolvedConflictsObject(conflicts) {
  return Object.fromEntries(conflicts.flatMap((conflict) => {
    const resolution = conflictResolutions.get(conflict.signature);
    return resolution ? [[conflict.coordinateKey, resolution]] : [];
  }));
}

function createConflictOption(conflict, resolution, actionKey) {
  const marker = resolution === 'keep' ? conflict.existing : conflict.incoming;
  const option = document.createElement('label');
  option.className = 'conflict-option';
  option.dataset.resolution = resolution;

  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = `conflict-${conflict.coordinateKey}`;
  radio.value = resolution;
  radio.checked = conflictResolutions.get(conflict.signature) === resolution;
  radio.addEventListener('change', () => {
    conflictResolutions.set(conflict.signature, resolution);
    renderPending();
  });

  const body = document.createElement('span');
  body.className = 'conflict-option-body';

  const action = document.createElement('span');
  action.className = 'conflict-option-action';
  action.textContent = t(actionKey);

  const mark = document.createElement('span');
  mark.className = 'conflict-option-marker';
  const glyph = document.createElement('span');
  glyph.innerHTML = iconGlyph(marker.icon, { size: 22 });
  const copy = document.createElement('span');
  const description = document.createElement('strong');
  description.textContent = marker.description || t('markerNoLabel');
  const iconName = document.createElement('small');
  iconName.textContent = iconLabel(marker.icon);
  copy.append(description, iconName);
  mark.append(glyph, copy);

  body.append(action, mark);
  option.append(radio, body);
  return option;
}

function renderConflictOverview(conflicts, mode) {
  const visible = mode === 'add' && conflicts.length > 0;
  reviewConflicts.classList.toggle('hidden', !visible);
  document.querySelectorAll('.marker-conflict-detail').forEach((row) => row.classList.toggle('hidden', !visible));
  if (!visible) return;

  const resolved = conflicts.filter((conflict) => conflictResolutions.has(conflict.signature)).length;
  reviewConflicts.innerHTML = `
    <div class="review-conflicts-copy">
      <strong>${escapeHtml(t('markConflictsReview', conflicts.length))}</strong>
      <span class="review-conflict-progress">${escapeHtml(t('markConflictsProgress', resolved, conflicts.length))}</span>
      <p>${escapeHtml(t('markConflictsReviewHint'))}</p>
    </div>
    <div class="review-conflict-actions">
      <button type="button" class="tertiary-btn" data-resolution="keep">${escapeHtml(t('markConflictKeepAll'))}</button>
      <button type="button" class="tertiary-btn emphasized" data-resolution="replace">${escapeHtml(t('markConflictUseAll'))}</button>
    </div>`;
  reviewConflicts.querySelectorAll('[data-resolution]').forEach((button) => {
    button.addEventListener('click', () => {
      conflicts.forEach((conflict) => conflictResolutions.set(conflict.signature, button.dataset.resolution));
      renderPending();
    });
  });
}

/**
 * Removes the given `pending` indices together, keyed by coordinate so the
 * selection and any in-progress edit stay consistent, then offers one
 * action -> result -> undo toast for the whole batch. Used by both the
 * per-row Delete button (a batch of one) and the selection toolbar.
 */
function deleteMarkers(indices) {
  if (indices.length === 0) return;
  const removed = [...indices].sort((a, b) => b - a).map((index) => ({ index, marker: pending[index] }));
  removed.forEach(({ index }) => pending.splice(index, 1));
  removed.forEach(({ marker }) => selectedKeys.delete(markerKey(marker)));
  if (editingKey !== null && removed.some(({ marker }) => markerKey(marker) === editingKey)) {
    editingKey = null;
  }
  renderPending();

  const label = removed.length === 1
    ? t('markDeleted', removed[0].marker.description)
    : t('marksDeletedCount', removed.length);
  showUndoToast(label, () => {
    [...removed].sort((a, b) => a.index - b.index).forEach(({ index, marker }) => {
      pending.splice(Math.min(index, pending.length), 0, marker);
    });
    renderPending();
  });
}

function handleRowCheckboxClick(key, index, event) {
  const checked = event.target.checked;
  if (event.shiftKey && lastCheckedIndex !== null) {
    const [start, end] = [lastCheckedIndex, index].sort((a, b) => a - b);
    for (let i = start; i <= end; i += 1) {
      const rangeKey = markerKey(pending[i]);
      if (checked) selectedKeys.add(rangeKey); else selectedKeys.delete(rangeKey);
    }
  } else if (checked) {
    selectedKeys.add(key);
  } else {
    selectedKeys.delete(key);
  }
  lastCheckedIndex = index;
  renderPending();
}

function updateSelectionUI() {
  const total = pending.length;
  const selected = selectedKeys.size;
  addSelectAllCheckbox.checked = total > 0 && selected === total;
  addSelectAllCheckbox.indeterminate = selected > 0 && selected < total;
  addSelectionToolbar.classList.toggle('hidden', selected === 0);
  addSelectionCount.textContent = t('selectedCount', selected);
}

/**
 * The row-in-place editor: two <tr>s (fields, then the icon grid, which is
 * too wide to share a row with the rest) swapped in for one pending marker.
 * Direct manipulation in the table itself, no dialog -- Enter saves, Escape
 * cancels, same as the rest of the app's inline controls.
 */
function buildEditRow(marker, index) {
  const coordinates = `${marker.x}, ${marker.y}, ${marker.z}`;
  const row = document.createElement('tr');
  row.className = 'row-editing';
  row.innerHTML = `
    <td class="cell-select"></td>
    <td class="cell-map"></td>
    <td class="edit-cell cell-x"><input type="text" inputmode="numeric" autocomplete="off"></td>
    <td class="edit-cell cell-y"><input type="text" inputmode="numeric" autocomplete="off"></td>
    <td class="edit-cell cell-z"><input type="text" inputmode="numeric" autocomplete="off"></td>
    <td class="edit-cell cell-label-edit"><input type="text" autocomplete="off"></td>
    <td class="cell-icon"></td>
    <td class="cell-actions">
      <button type="button" class="row-btn" data-action="save"></button>
      <button type="button" class="row-btn" data-action="cancel"></button>
    </td>`;
  row.querySelector('.cell-map').appendChild(createMapLink(marker, coordinates));
  const xInput = row.querySelector('.cell-x input');
  const yInput = row.querySelector('.cell-y input');
  const zInput = row.querySelector('.cell-z input');
  const labelInput = row.querySelector('.cell-label-edit input');
  xInput.value = marker.x;
  yInput.value = marker.y;
  zInput.value = marker.z;
  labelInput.value = marker.description;
  xInput.setAttribute('aria-label', t('editXLabel'));
  yInput.setAttribute('aria-label', t('editYLabel'));
  zInput.setAttribute('aria-label', t('editZLabel'));
  labelInput.setAttribute('aria-label', t('editLabelLabel'));
  const [saveButton, cancelButton] = row.querySelectorAll('.row-btn');
  saveButton.textContent = t('saveAction');
  cancelButton.textContent = t('cancelAction');

  const iconRow = document.createElement('tr');
  iconRow.className = 'row-editing';
  const iconCell = document.createElement('td');
  iconCell.colSpan = 8;
  iconCell.className = 'row-icon-editor';
  const errorMessage = document.createElement('p');
  errorMessage.className = 'row-edit-error hidden';
  const iconWrap = document.createElement('div');
  iconWrap.className = 'icon-field';
  iconWrap.dataset.iconField = `row-icon-${index}`;
  iconCell.append(errorMessage, iconWrap);
  iconRow.appendChild(iconCell);
  const iconSelect = mountIconField(iconWrap);
  iconWrap.removeAttribute('aria-labelledby');
  iconWrap.setAttribute('aria-label', t('markIconFieldLabel'));
  iconSelect.value = marker.icon;

  const commit = () => {
    const candidate = {
      description: labelInput.value.trim(),
      icon: iconSelect.value,
      x: toInteger(xInput.value),
      y: toInteger(yInput.value),
      z: toInteger(zInput.value),
    };
    const problem = checkMarkerFields(candidate);
    if (problem) {
      errorMessage.textContent = t(problem.key, ...(problem.args ?? []));
      errorMessage.classList.remove('hidden');
      return;
    }
    upsertMarker(candidate, { replacingIndex: index });
    editingKey = null;
    renderPending();
  };
  const cancel = () => {
    editingKey = null;
    renderPending();
  };
  saveButton.addEventListener('click', commit);
  cancelButton.addEventListener('click', cancel);
  [xInput, yInput, zInput, labelInput].forEach((input) => {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); commit(); } else if (event.key === 'Escape') { event.preventDefault(); cancel(); }
    });
  });

  const fragment = document.createDocumentFragment();
  fragment.append(row, iconRow);
  return fragment;
}

function renderPending() {
  addRows.textContent = '';
  const conflicts = currentReviewConflicts();
  const conflictByCoordinate = new Map(conflicts.map((conflict) => [conflict.coordinateKey, conflict]));
  const currentSignatures = new Set(conflicts.map((conflict) => conflict.signature));
  conflictResolutions = new Map(
    [...conflictResolutions].filter(([signature]) => currentSignatures.has(signature)),
  );

  const pendingKeys = new Set(pending.map(markerKey));
  selectedKeys = new Set([...selectedKeys].filter((key) => pendingKeys.has(key)));
  if (editingKey !== null && !pendingKeys.has(editingKey)) editingKey = null;

  pending.forEach((marker, index) => {
    const key = markerKey(marker);

    if (key === editingKey) {
      addRows.appendChild(buildEditRow(marker, index));
      return;
    }

    const coordinates = `${marker.x}, ${marker.y}, ${marker.z}`;
    const row = document.createElement('tr');
    if (selectedKeys.has(key)) row.className = 'row-selected';
    row.innerHTML = `
      <td class="cell-select"><input type="checkbox"></td>
      <td class="cell-map"></td>
      <td>${marker.x}</td>
      <td>${marker.y}</td>
      <td>${marker.z}</td>
      <td class="cell-label"></td>
      <td class="cell-icon">${iconGlyph(marker.icon, { size: 18 })}<span class="visually-hidden"></span></td>
      <td class="cell-actions">
        <button type="button" class="row-btn" data-action="edit"></button>
        <button type="button" class="row-btn destructive" data-action="delete"></button>
      </td>`;
    row.querySelector('.cell-label').textContent = marker.description;
    // The icon column is the icon alone; its name stays available to screen
    // readers and as a tooltip rather than crowding the row.
    const iconCell = row.querySelector('.cell-icon');
    iconCell.querySelector('.visually-hidden').textContent = iconLabel(marker.icon);
    iconCell.title = iconLabel(marker.icon);
    row.querySelector('.cell-map').appendChild(createMapLink(marker, coordinates));
    const checkbox = row.querySelector('.cell-select input');
    checkbox.checked = selectedKeys.has(key);
    checkbox.setAttribute('aria-label', t('selectRowLabel', coordinates));
    checkbox.addEventListener('click', (event) => handleRowCheckboxClick(key, index, event));
    const [editButton, deleteButton] = row.querySelectorAll('.row-btn');
    editButton.textContent = t('editAction');
    deleteButton.textContent = t('deleteAction');
    editButton.addEventListener('click', () => { editingKey = key; renderPending(); });
    deleteButton.addEventListener('click', () => deleteMarkers([index]));
    addRows.appendChild(row);

    const conflict = conflictByCoordinate.get(key);
    if (conflict) {
      const detailRow = document.createElement('tr');
      detailRow.className = 'marker-conflict-detail';
      const selectSpacerCell = document.createElement('td');
      selectSpacerCell.className = 'cell-select';
      const mapCell = document.createElement('td');
      mapCell.className = 'cell-map';
      mapCell.appendChild(createMapLink(conflict.incoming, coordinates));
      const detailCell = document.createElement('td');
      detailCell.className = 'conflict-decision-cell';
      detailCell.colSpan = 6;
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'coordinate-conflict';
      const legend = document.createElement('legend');
      const resolution = conflictResolutions.get(conflict.signature);
      legend.textContent = t(resolution === 'keep'
        ? 'markConflictDecisionKeep'
        : resolution === 'replace'
          ? 'markConflictDecisionNew'
          : 'markConflictNeedsDecision');
      const choices = document.createElement('div');
      choices.className = 'conflict-options';
      choices.append(
        createConflictOption(conflict, 'keep', 'markConflictKeep'),
        createConflictOption(conflict, 'replace', 'markConflictUseNew'),
      );
      fieldset.append(legend, choices);
      detailCell.appendChild(fieldset);
      detailRow.append(selectSpacerCell, mapCell, detailCell);
      addRows.appendChild(detailRow);
    }
  });

  // Nothing to review until there's something in the list, so the whole step
  // stays out of the way rather than sitting there as an empty placeholder.
  reviewStep.classList.toggle('hidden', pending.length === 0);
  addRunButton.disabled = pending.length === 0;
  refreshApplyStep();
  updateSelectionUI();
  savePending();
}

addSelectAllCheckbox.addEventListener('change', () => {
  selectedKeys = addSelectAllCheckbox.checked ? new Set(pending.map(markerKey)) : new Set();
  renderPending();
});

addDeleteSelectedButton.addEventListener('click', () => {
  const indices = pending.map((marker, index) => index).filter((index) => selectedKeys.has(markerKey(pending[index])));
  deleteMarkers(indices);
});

// Text-editing controls need Delete/Backspace for their own job; a checkbox
// or button does not, so only those two input types are excluded here.
const isTextEditingControl = (el) => el.tagName === 'TEXTAREA'
  || el.tagName === 'SELECT'
  || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(el.type));

// Delete/Backspace acts on the current selection from anywhere in the table
// -- macOS reports its main delete key as "Backspace", so both are bound --
// but never inside a text control, where the same key has to keep deleting
// characters instead.
addRows.addEventListener('keydown', (event) => {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return;
  if (selectedKeys.size === 0) return;
  if (isTextEditingControl(event.target)) return;
  event.preventDefault();
  const indices = pending.map((marker, index) => index).filter((index) => selectedKeys.has(markerKey(pending[index])));
  deleteMarkers(indices);
});

// With no file loaded there is nothing to remove from, so the only thing the
// list can produce is a new file. Answering 'add' there keeps a stale radio
// from emptying a file that was unloaded after it was picked.
function markDirection() {
  if (yourMarkers.length === 0) return 'add';
  return document.querySelector('input[name="mark-direction"]:checked')?.value ?? 'add';
}

function refreshApplyStep() {
  const ready = pending.length > 0 && yourMarkers.length > 0;
  markApplyStep.classList.toggle('hidden', !ready);
  if (!ready) {
    markPreview.innerHTML = '';
    reviewConflicts.classList.add('hidden');
    document.querySelectorAll('.marker-conflict-detail').forEach((row) => row.classList.add('hidden'));
    addRunButton.disabled = pending.length === 0;
    return;
  }
  const mode = markDirection();
  const reviewConflictsList = currentReviewConflicts();
  const resolutions = resolvedConflictsObject(reviewConflictsList);
  const unresolved = mode === 'add'
    ? reviewConflictsList.filter((conflict) => !conflictResolutions.has(conflict.signature)).length
    : 0;
  const outcome = applyEditedMarks(yourMarkers, pending, {
    mode,
    conflictPolicy: 'replace',
    conflictResolutions: resolutions,
  });
  const { added, identical, conflicts, removed, total } = outcome;
  const replaced = Object.values(resolutions).filter((resolution) => resolution === 'replace').length;
  const kept = Object.values(resolutions).filter((resolution) => resolution === 'keep').length;
  renderConflictOverview(reviewConflictsList, mode);
  addRunButton.disabled = unresolved > 0;
  const rows = mode === 'remove'
    ? `<dt>${t('setLabelRemoved')}</dt><dd>${localeNumber(removed)}</dd>`
    : `<dt>${t('setLabelAdded')}</dt><dd>${localeNumber(added)}</dd>`
      + `<dt>${t('labelAlreadyIdentical')}</dt><dd>${localeNumber(identical)}</dd>`
      + (conflicts.length > 0
        ? `<dt>${t('labelConflictsReplaced')}</dt><dd>${localeNumber(replaced)}</dd>`
          + `<dt>${t('labelConflictsKept')}</dt><dd>${localeNumber(kept)}</dd>`
          + `<dt>${t('labelConflictsUnresolved')}</dt><dd>${localeNumber(unresolved)}</dd>`
        : '');
  markDirectionHint.textContent = t(
    mode === 'remove' ? 'markDirectionHintRemove' : 'markDirectionHintAdd',
    conflicts.length,
    unresolved,
  );
  markPreview.innerHTML = `<div class="result-card ok"><dl>${rows}`
    + `<dt>${t('labelTotal')}</dt><dd>${localeNumber(total)}</dd></dl></div>`;
}

document.querySelectorAll('input[name="mark-direction"]').forEach(
  (radio) => radio.addEventListener('change', refreshApplyStep),
);

/**
 * Add (or update) a marker, keyed by coordinate the same way merges are.
 * `replacingIndex` is the row being edited, which shouldn't count as a clash
 * with itself. Returns true if an existing entry was replaced.
 */
function upsertMarker(marker, { replacingIndex = -1 } = {}) {
  const key = markerKey(marker);
  const clashIndex = pending.findIndex((m, i) => i !== replacingIndex && markerKey(m) === key);
  if (replacingIndex >= 0) {
    pending[replacingIndex] = marker;
    if (clashIndex >= 0) pending.splice(clashIndex, 1);
  } else if (clashIndex >= 0) {
    pending[clashIndex] = marker;
  } else {
    pending.push(marker);
  }
  return clashIndex >= 0;
}

// ---------- Define marks ----------
// One input handles one mark and a hundred: a single line is just a batch of
// one, so there's no separate "add one" form to choose between.
function parseMarks() {
  return parseMarkerLines(coordsField.value, {
    defaultLabel: markLabelField.value.trim(),
    defaultIcon: markIconSelect.value,
  });
}

// Name the action by what it will actually do -- "Add 6 Marks" beats "Add".
function syncAddButton() {
  addButton.textContent = t('addMarksCount', parseMarks().markers.length);
}
coordsField.addEventListener('input', syncAddButton);
syncAddButton();

// ---------- Quick prompt ----------
// Fetch the raw wiki source here, where MediaWiki's CORS response is usable,
// then embed it in the assistant prompt. Assistant runtimes often block
// arbitrary outbound DNS/HTTP even though the user's browser can read it.
function rejectMissingUrl() {
  wikiStatus.textContent = t('wikiBadUrl');
  wikiStatus.classList.add('error');
}

/** Normalized URL currently in the field, or null if it isn't one yet. */
function currentPromptUrl() {
  const trimmed = wikiUrlField.value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') ? trimmed : null;
  } catch {
    return null;
  }
}

async function withPrompt(action, {
  url = currentPromptUrl(), onFailure, sourceBacked = false,
} = {}) {
  if (!url) {
    onFailure?.();
    return rejectMissingUrl();
  }
  wikiStatus.classList.remove('error');
  wikiStatus.textContent = t('wikiReading');
  try {
    const variant = questPromptVariant(url);
    if (!variant) throw new Error('badUrl');
    const needsArticle = variant === 'fandom' || (variant === 'tibiawikibr' && sourceBacked);
    const article = needsArticle
      ? await fetchQuestCoordinates(url)
      : undefined;
    const prompt = await buildQuestPrompt(url, article && {
      sourceTitle: article.title,
      wikitext: article.wikitext,
      sourceBacked,
    });
    await action(prompt, url);
  } catch (err) {
    onFailure?.();
    wikiStatus.textContent = t({
      badUrl: 'wikiBadUrl', noArticle: 'wikiNoArticle', unreachable: 'wikiUnreachable',
    }[err.message] ?? 'promptLoadFailed');
    wikiStatus.classList.add('error');
  }
}

function copyPrompt() {
  return withPrompt(async (prompt, url) => {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      wikiStatus.textContent = t('promptCopyFailed');
      wikiStatus.classList.add('error');
      return;
    }
    wikiStatus.classList.remove('error');
    wikiStatus.textContent = t('promptCopied', url);
    // The answer comes back here, so put the cursor where it has to be pasted.
    coordsField.focus();
  });
}

function openAssistant(name, destination) {
  const questUrl = currentPromptUrl();
  if (!questUrl) return rejectMissingUrl();

  // Open synchronously while the click still grants popup permission. Fetching
  // Fandom source first loses that user activation and browsers block the tab.
  const assistantTab = window.open('about:blank', '_blank');
  if (!assistantTab) {
    wikiStatus.textContent = t('popupBlocked');
    wikiStatus.classList.add('error');
    return undefined;
  }
  assistantTab.opener = null;

  return withPrompt(async (prompt, questUrl) => {
    if (destination.prefill === false) {
      try {
        await navigator.clipboard.writeText(prompt);
      } catch {
        assistantTab.close();
        wikiStatus.textContent = t('promptCopyFailed');
        wikiStatus.classList.add('error');
        return;
      }
      wikiStatus.classList.remove('error');
      wikiStatus.textContent = t('promptCopiedOpened', name, questUrl);
      assistantTab.location.replace(destination.home);
      return;
    }

    // Prefill the assistant exactly as the original action did. Also copy the
    // prompt as a recovery path if a service ever drops a long query string.
    try {
      await navigator.clipboard.writeText(prompt);
    } catch { /* The prefilled URL remains the primary path. */ }
    wikiStatus.classList.remove('error');
    wikiStatus.textContent = t('promptIncluded', name, questUrl);
    assistantTab.location.replace(destination.promptBase + encodeURIComponent(prompt));
  }, {
    url: questUrl,
    onFailure: () => assistantTab.close(),
    sourceBacked: destination.sourceBacked ?? false,
  });
}

document.getElementById('prompt-copy').addEventListener('click', copyPrompt);
document.getElementById('prompt-chatgpt').addEventListener('click', () => openAssistant('ChatGPT', {
  promptBase: 'https://chatgpt.com/?q=',
}));

// ChatGPT and copying are the two in reach above; these are the rest, kept
// behind a link so the row does not grow a button per service.
const OTHER_ASSISTANTS = [
  { name: 'Claude', promptBase: 'https://claude.ai/new?q=' },
  {
    name: 'Gemini',
    home: 'https://gemini.google.com/app',
    prefill: false,
    sourceBacked: true,
  },
  { name: 'Grok', promptBase: 'https://grok.com/?q=' },
  { name: 'Perplexity', promptBase: 'https://www.perplexity.ai/search?q=' },
];

const assistantSheet = document.getElementById('assistant-sheet');
const assistantList = document.getElementById('assistant-list');

for (const destination of OTHER_ASSISTANTS) {
  const { name } = destination;
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'assistant';
  row.innerHTML = '<span class="assistant-name"></span><span class="assistant-note"></span>';
  row.querySelector('.assistant-name').textContent = name;
  row.querySelector('.assistant-note').textContent = t(
    destination.prefill === false ? 'assistantCopies' : 'assistantOpens',
  );
  row.addEventListener('click', () => {
    assistantSheet.close();
    openAssistant(name, destination);
  });
  assistantList.appendChild(row);
}

// ---------- Import from a Tibia Wiki article ----------
// Fills the coordinate field above rather than the list: the import is one way
// to write those lines, not a second way to add marks, so everything after it
// -- editing, labelling, the batch icon, Review -- stays exactly the same.
wikiImportButton.addEventListener('click', withBusy(wikiImportButton, async () => {
  wikiStatus.classList.remove('error');
  wikiStatus.textContent = t('wikiReading');
  let article;
  try {
    article = await fetchQuestCoordinates(wikiUrlField.value);
  } catch (err) {
    wikiStatus.textContent = t({
      badUrl: 'wikiBadUrl', noArticle: 'wikiNoArticle',
    }[err.message] ?? 'wikiUnreachable');
    wikiStatus.classList.add('error');
    return;
  }

  if (article.coordinates.length === 0) {
    wikiStatus.textContent = t('wikiNoCoordinates', article.title);
    wikiStatus.classList.add('error');
    return;
  }

  const lines = article.coordinates.map((c) => `${c.x}, ${c.y}, ${c.z}, ${c.label}`.trimEnd().replace(/,$/, ''));
  const existing = coordsField.value.trim();
  coordsField.value = existing ? `${existing}\n${lines.join('\n')}` : lines.join('\n');
  syncAddButton();
  wikiStatus.textContent = t('wikiImported', article.coordinates.length, article.title);
}));

addButton.addEventListener('click', () => {
  const { markers, errors } = parseMarks();
  let replacedCount = 0;
  for (const marker of markers) {
    if (upsertMarker(marker)) replacedCount += 1;
  }
  renderPending();

  const notes = [markers.length > 0 ? t('marksAdded', markers.length) : t('marksNothing')];
  if (replacedCount > 0) notes.push(t('marksReplaced', replacedCount));
  const errorList = errors.length
    ? `<p class="form-message error">${t('marksSkippedIntro')}</p><ul class="warn-list">${errors.map((e) => (
      `<li>${t('markerLine', e.line)}: ${escapeHtml(t(e.key, ...(e.args ?? [])))} <code>${escapeHtml(e.text)}</code></li>`
    )).join('')}</ul>`
    : '';
  addFeedback.innerHTML = `<p class="form-message">${escapeHtml(notes.join(' '))}</p>${errorList}`;

  // Clear only what was consumed cleanly, so bad lines stay put to be fixed.
  if (markers.length > 0 && errors.length === 0) coordsField.value = '';
  syncAddButton();
});

// ---------- Remove-all confirmation ----------
addClearButton.addEventListener('click', () => {
  if (pending.length > 0) clearSheet.showModal();
});

document.getElementById('clear-cancel').addEventListener('click', () => clearSheet.close());

document.getElementById('clear-confirm').addEventListener('click', () => {
  pending = [];
  renderPending();
  clearSheet.close();
});

// ---------- Export ----------
addRunButton.addEventListener('click', withBusy(addRunButton, async () => {
  if (pending.length === 0) {
    renderResult('add-result', t('addNoMarkers'), true);
    return;
  }
  await yourMarkersLoad; // a file picked a moment ago may still be parsing
  const generatedAt = new Date();
  const lang = currentLang();

  const mode = markDirection();
  const reviewConflictsList = currentReviewConflicts();
  const unresolved = mode === 'add'
    ? reviewConflictsList.filter((conflict) => !conflictResolutions.has(conflict.signature))
    : [];
  if (unresolved.length > 0) {
    renderResult('add-result', escapeHtml(t('markResolveConflictsFirst', unresolved.length)), true);
    return;
  }
  const conflictResolutionsByCoordinate = resolvedConflictsObject(reviewConflictsList);
  const selectedResolutions = Object.values(conflictResolutionsByCoordinate);
  const conflictPolicy = selectedResolutions.length === 0 || selectedResolutions.every((value) => value === 'replace')
    ? 'replace'
    : (selectedResolutions.every((value) => value === 'keep') ? 'keep' : 'individual');

  let outcome;
  let outputBytes;
  let validationLine;
  let backupEntries = [];
  try {
    backupEntries = await backupYourMarkerFiles(generatedAt);
    outcome = applyEditedMarks(yourMarkers, pending, {
      mode,
      conflictPolicy: 'replace',
      conflictResolutions: conflictResolutionsByCoordinate,
    });
    validateMarkers(outcome.result, { source: 'edit-marks' });
    outputBytes = writeMarkersBin(outcome.result);
    const reparsed = parseMarkersBin(
      outputBytes.buffer.slice(outputBytes.byteOffset, outputBytes.byteOffset + outputBytes.byteLength),
      { source: 'validation' },
    );
    const lost = outcome.result.length - reparsed.length;
    validationLine = lost > 0 ? t('logValidationOkDedup', lost) : t('logValidationOk');
  } catch (err) {
    renderResult('add-result', escapeHtml(err.message), true);
    return;
  }

  const entries = [
    { name: 'minimapmarkers.bin', data: outputBytes },
    ...backupEntries,
    {
      name: 'edit-marks-log.txt',
      data: new TextEncoder().encode(buildAddMarksLog({
        generatedAt,
        userFilenames: yourMarkerFiles.map((file) => file.name),
        backupFilenames: backupEntries.map((e) => e.name),
        mode,
        conflictPolicy,
        existingCount: yourMarkers.length,
        addedCount: outcome.added,
        identicalCount: outcome.identical,
        replacedCount: outcome.replaced,
        keptCount: outcome.kept,
        conflicts: outcome.conflicts,
        removedCount: outcome.removed,
        totalCount: outcome.total,
        validationLine,
        addedMarkers: pending,
      }, lang)),
    },
  ];

  const zipName = 'tibia-maps-merge-marks.zip';
  downloadBlob(new Blob([buildZip(entries)]), zipName);

  const skippedHtml = yourMarkersSkipped.length
    ? `<p>${t('skippedIntro')}</p><ul class="warn-list">${yourMarkersSkipped.map((s) => (
      `<li>${escapeHtml(s.file)}: ${escapeHtml(s.error)}</li>`
    )).join('')}</ul>`
    : '';
  const rows = mode === 'remove'
    ? `<dt>${t('setLabelRemoved')}</dt><dd>${localeNumber(outcome.removed)}</dd>`
    : `<dt>${t('labelYouAdded')}</dt><dd>${localeNumber(outcome.added)}</dd>`
      + `<dt>${t('labelAlreadyIdentical')}</dt><dd>${localeNumber(outcome.identical)}</dd>`
      + (outcome.conflicts.length > 0
        ? `<dt>${t('labelConflictsReplaced')}</dt><dd>${localeNumber(outcome.replaced)}</dd>`
          + `<dt>${t('labelConflictsKept')}</dt><dd>${localeNumber(outcome.kept)}</dd>`
        : '');
  renderResult('add-result', `
    ${t(mode === 'remove' ? 'marksUpdatedZip' : 'marksCreatedZip', zipName)}
    <dl>
      <dt>${t('labelExisting')}</dt><dd>${localeNumber(yourMarkers.length)}</dd>
      ${rows}
      <dt>${t('labelTotal')}</dt><dd>${localeNumber(outcome.total)}</dd>
    </dl>
    ${skippedHtml}
  `, false);
}));

renderPending();

// ================= Marker Sets =================
// One task: your marker file, plus any number of the collections tibiamaps.io
// publishes, added or removed together. Nothing here is editable -- a
// collection is a published list you take or leave whole, so this mode is a
// picker and a preview. Marks you assemble yourself go through Edit Marks,
// which has the row-by-row table for exactly that.

const setChoices = document.getElementById('set-choices');
const setsSourceStatus = document.getElementById('sets-source-status');
const setsApplyStep = document.getElementById('sets-apply-step');
const setsPreview = document.getElementById('sets-preview');
const setsRunButton = document.getElementById('sets-run');

// Collections are picked, not loaded one at a time: fetched on first tick and
// kept, so unticking and re-ticking costs nothing. `selectedSets` holds the
// order they appear in the picker, which is what makes the combined list
// deterministic where two collections name the same coordinate.
const loadedSets = new Map();   // id -> markers
const selectedSets = new Set(); // ids, in picker order
let setsFetch = Promise.resolve();

function setsDirection() {
  return document.querySelector('input[name="set-direction"]:checked')?.value ?? 'add';
}

// ---------- the picker ----------
const CHECK_SVG = '<svg class="set-check" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">'
  + '<path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" '
  + 'stroke-linecap="round" stroke-linejoin="round"/></svg>';

function createSetChoice({ id = '', inputName, value = '', title, note = '', dateId = '', checked = false }) {
  const choice = document.createElement('label');
  choice.className = 'set-choice';
  choice.innerHTML = '<input type="checkbox" class="visually-hidden">'
    + `<span class="set-name">${CHECK_SVG}<span class="set-title"></span></span>`
    + '<span class="set-note"></span>'
    + (dateId ? `<span class="set-date" data-set-date="${dateId}"></span>` : '');
  const input = choice.querySelector('input');
  if (id) input.id = id;
  input.name = inputName;
  input.value = value;
  input.checked = checked;
  choice.querySelector('.set-title').textContent = title;
  choice.querySelector('.set-note').textContent = note;
  return { choice, input };
}

for (const { id, name, large } of MARKER_SETS) {
  const { choice, input } = createSetChoice({
    inputName: 'marker-set',
    value: id,
    title: name,
    note: large ? t('setLarge') : '',
    dateId: id,
  });
  input.addEventListener('change', () => toggleSet(id, input.checked));
  setChoices.appendChild(choice);
}

const setsClearButton = document.getElementById('sets-clear');

setsClearButton.addEventListener('click', () => {
  for (const input of setChoices.querySelectorAll('input')) input.checked = false;
  selectedSets.clear();
  syncSetSelection();
});

// These are published data, not a live feed -- one collection has not changed
// since 2020, another changed last week -- so each card says when its markers
// last moved. Asked for once, the first time the tab is opened: nine API calls
// is not something to spend on someone who never looks at this mode.
let setDatesRequested = false;

async function fillSetDates() {
  if (setDatesRequested) return;
  setDatesRequested = true;
  let dates;
  try {
    dates = await fetchSetDates();
  } catch {
    return; // a card without a date still works; an error here would not help
  }
  const format = new Intl.DateTimeFormat(currentLang(), { year: 'numeric', month: 'short' });
  // Month and year only, joined by a space: pt-BR's own short format is
  // "dez. de 2023", which is two words longer than the card has room for.
  const monthAndYear = (date) => format
    // Read as UTC noon -- a bare YYYY-MM-DD is midnight UTC, which slips back
    // a month for anyone west of Greenwich when the commit landed on the 1st.
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .filter((part) => part.type === 'month' || part.type === 'year')
    .map((part) => part.value)
    .join(' ');
  for (const [id, date] of Object.entries(dates)) {
    const slot = document.querySelector(`[data-set-date="${id}"]`);
    if (slot) slot.textContent = t('setUpdated', monthAndYear(date));
  }
}

// A collection whose contents need explaining says so while it is picked --
// per-set prose in the picker itself would drown the eight that need none.
function showSetExplainers() {
  for (const note of document.querySelectorAll('.set-explainer')) {
    note.classList.toggle('hidden', !selectedSets.has(note.id.replace('set-note-', '')));
  }
}

/** The picked collections, in picker order, for anything that has to list them. */
const chosenSets = () => MARKER_SETS.filter(({ id }) => selectedSets.has(id));

/**
 * Everything picked, as one list. Merged in picker order, so where two
 * collections name the same coordinate the later one wins -- arbitrary, but
 * fixed, which is what matters for a preview that has to match the download.
 */
function chosenMarkers() {
  return mergeMarkers(...chosenSets().map(({ id }) => loadedSets.get(id) ?? []));
}

const setsReady = () => chosenSets().every(({ id }) => loadedSets.has(id));

// Everything that follows from the selection changing, in one place -- the
// status line was left claiming three collections after Clear emptied it.
function syncSetSelection() {
  showSetExplainers();
  setsClearButton.classList.toggle('hidden', selectedSets.size === 0);
  reportSetSelection();
  refreshSetsPreview();
}

function toggleSet(id, checked) {
  if (checked) selectedSets.add(id); else selectedSets.delete(id);
  syncSetSelection();
  if (!checked || loadedSets.has(id)) return;
  // Serialised rather than parallel: ticking four boxes quickly should not
  // race four status messages against each other.
  setsFetch = setsFetch.then(async () => {
    if (!selectedSets.has(id) || loadedSets.has(id)) return;
    setsSourceStatus.classList.remove('error');
    setsSourceStatus.textContent = t('setLoading');
    try {
      loadedSets.set(id, await fetchMarkerSet(id));
    } catch {
      // Leave it ticked but unloaded: the message says so, and re-ticking or
      // picking another collection retries without the box silently clearing.
      setsSourceStatus.textContent = t('setUnreachable');
      setsSourceStatus.classList.add('error');
      refreshSetsPreview();
      return;
    }
    syncSetSelection();
    refreshExtractPreview();
  });
}

function reportSetSelection() {
  const chosen = chosenSets();
  setsSourceStatus.classList.remove('error');
  if (chosen.length === 0) {
    setsSourceStatus.textContent = '';
    return;
  }
  if (!setsReady()) return; // a later fetch will report for all of them
  const total = chosenMarkers().length;
  setsSourceStatus.textContent = chosen.length === 1
    ? t('setLoaded', chosen[0].name, total)
    : t('setsLoaded', chosen.length, total);
}

document.querySelectorAll('input[name="set-direction"]').forEach((r) => r.addEventListener('change', refreshSetsPreview));

// ---------- what it will do ----------
/** How the picked collections are named, wherever they have to be named. */
function chosenLabel() {
  const chosen = chosenSets();
  return chosen.length === 1 ? chosen[0].name : chosen.map(({ name }) => name).join(', ');
}

function refreshSetsPreview() {
  const chosen = chosenSets();
  const ready = yourMarkers.length > 0 && chosen.length > 0 && setsReady();
  setsApplyStep.classList.toggle('hidden', !ready);
  setsRunButton.disabled = !ready;
  if (!ready) {
    setsPreview.innerHTML = '';
    return;
  }
  const marks = chosenMarkers();
  const mode = setsDirection();
  const { added, kept, removed, total } = applyMarkerSet(yourMarkers, marks, mode);
  const rows = mode === 'remove'
    ? `<dt>${t('setLabelRemoved')}</dt><dd>${localeNumber(removed)}</dd>`
    : `<dt>${t('setLabelAdded')}</dt><dd>${localeNumber(added)}</dd>`
      + `<dt>${t('setLabelKept')}</dt><dd>${localeNumber(kept)}</dd>`;
  // Two collections can name the same coordinate; say so rather than leaving
  // the reader to wonder why the parts do not add up to the whole.
  const listed = chosenSets().reduce((sum, { id }) => sum + (loadedSets.get(id)?.length ?? 0), 0);
  const overlap = listed - marks.length;
  const overlapNote = overlap > 0 ? ` ${t('setsOverlap', overlap)}` : '';
  setsPreview.innerHTML = `<div class="result-card ok">${t('setPreview', escapeHtml(chosenLabel()), marks.length)}${overlapNote}`
    + `<dl>${rows}<dt>${t('labelTotal')}</dt><dd>${localeNumber(total)}</dd></dl></div>`;
}

// ---------- download ----------
setsRunButton.addEventListener('click', withBusy(setsRunButton, async () => {
  await yourMarkersLoad;
  await setsFetch;
  if (yourMarkers.length === 0 || chosenSets().length === 0 || !setsReady()) return;
  const chosenMarks = { label: chosenLabel(), markers: chosenMarkers() };
  const generatedAt = new Date();
  const lang = currentLang();
  const mode = setsDirection();

  let outcome;
  let outputBytes;
  let validationLine;
  let backupEntries = [];
  try {
    backupEntries = await backupYourMarkerFiles(generatedAt);
    outcome = applyMarkerSet(yourMarkers, chosenMarks.markers, mode);
    validateMarkers(outcome.result, { source: 'marker-sets' });
    outputBytes = writeMarkersBin(outcome.result);
    const reparsed = parseMarkersBin(
      outputBytes.buffer.slice(outputBytes.byteOffset, outputBytes.byteOffset + outputBytes.byteLength),
      { source: 'validation' },
    );
    const lost = outcome.result.length - reparsed.length;
    validationLine = lost > 0 ? t('logValidationOkDedup', lost) : t('logValidationOk');
  } catch (err) {
    renderResult('sets-result', escapeHtml(err.message), true);
    return;
  }

  const entries = [
    { name: 'minimapmarkers.bin', data: outputBytes },
    ...backupEntries,
    {
      name: 'marker-sets-log.txt',
      data: new TextEncoder().encode(buildMarkerSetsLog({
        generatedAt,
        userFilenames: yourMarkerFiles.map((file) => file.name),
        backupFilenames: backupEntries.map((e) => e.name),
        setName: chosenMarks.label,
        setCount: chosenMarks.markers.length,
        setCountsByName: chosenSets().map(({ id, name }) => [name, loadedSets.get(id).length]),
        mode,
        baseCount: yourMarkers.length,
        addedCount: outcome.added,
        keptCount: outcome.kept,
        removedCount: outcome.removed,
        totalCount: outcome.total,
        validationLine,
      }, lang)),
    },
  ];

  const zipName = 'tibia-maps-merge-sets.zip';
  downloadBlob(new Blob([buildZip(entries)]), zipName);

  const rows = mode === 'remove'
    ? `<dt>${t('setLabelRemoved')}</dt><dd>${localeNumber(outcome.removed)}</dd>`
    : `<dt>${t('setLabelAdded')}</dt><dd>${localeNumber(outcome.added)}</dd>`
      + `<dt>${t('setLabelKept')}</dt><dd>${localeNumber(outcome.kept)}</dd>`;
  renderResult('sets-result', `
    ${t('setsAppliedZip', zipName)}
    <dl>
      <dt>${t('labelCollections')}</dt><dd>${escapeHtml(chosenMarks.label)}</dd>
      <dt>${t('labelExisting')}</dt><dd>${localeNumber(yourMarkers.length)}</dd>
      ${rows}
      <dt>${t('labelTotal')}</dt><dd>${localeNumber(outcome.total)}</dd>
    </dl>
  `, false);
}));

// ================= Extract Own =================
// A merged client file can contain three kinds of data: unchanged Community
// markers, unchanged published Marker Sets, and personal markers. Exact
// content matching separates them without deleting a personal label/icon that
// intentionally overrides published data at the same coordinate.
const extractSourceChoices = document.getElementById('extract-source-choices');
const extractSetChoices = document.getElementById('extract-set-choices');
const extractSetsClear = document.getElementById('extract-sets-clear');
const extractSourceStatus = document.getElementById('extract-source-status');
const extractPreviewStep = document.getElementById('extract-preview-step');
const extractPreview = document.getElementById('extract-preview');
const extractRunButton = document.getElementById('extract-run');

const extractSelectedSets = new Set();
const extractFailedSets = new Set();
let extractFetch = Promise.resolve();

const { choice: extractCommunityChoice, input: extractCommunityInput } = createSetChoice({
  id: 'extract-community',
  inputName: 'extract-published-source',
  value: 'community',
  title: t('extractCommunityName'),
  checked: true,
});
extractSourceChoices.appendChild(extractCommunityChoice);

for (const { id, name, large } of MARKER_SETS) {
  const { choice, input } = createSetChoice({
    inputName: 'extract-marker-set',
    value: id,
    title: name,
    note: large ? t('setLarge') : '',
  });
  input.addEventListener('change', () => {
    if (input.checked) {
      extractSelectedSets.add(id);
      extractFailedSets.delete(id);
      queueExtractSetLoads([id]);
    } else {
      extractSelectedSets.delete(id);
      extractFailedSets.delete(id);
    }
    extractSetsClear.classList.toggle('hidden', extractSelectedSets.size === 0);
    refreshExtractPreview();
  });
  extractSetChoices.appendChild(choice);
}

function queueExtractSetLoads(ids) {
  extractFetch = extractFetch.then(async () => {
    for (const id of ids) {
      if (!extractSelectedSets.has(id) || loadedSets.has(id)) continue;
      try {
        loadedSets.set(id, await fetchMarkerSet(id));
        extractFailedSets.delete(id);
      } catch {
        extractFailedSets.add(id);
      }
      refreshExtractPreview();
    }
  });
}

extractSetsClear.addEventListener('click', () => {
  for (const input of extractSetChoices.querySelectorAll('input')) input.checked = false;
  extractSelectedSets.clear();
  extractFailedSets.clear();
  extractSetsClear.classList.add('hidden');
  refreshExtractPreview();
});

extractCommunityInput.addEventListener('change', refreshExtractPreview);

function selectedExtractSets() {
  return MARKER_SETS.filter(({ id }) => extractSelectedSets.has(id));
}

function extractReferences() {
  const references = [];
  if (extractCommunityInput.checked && community) references.push(...community.markers);
  for (const { id } of selectedExtractSets()) references.push(...(loadedSets.get(id) ?? []));
  return references;
}

function extractSourceNames() {
  const names = [];
  if (extractCommunityInput.checked) names.push(t('extractCommunityName'));
  names.push(...selectedExtractSets().map(({ name }) => name));
  return names;
}

function renderExtractStatus(message, { error = false, retry = null } = {}) {
  extractSourceStatus.textContent = message;
  extractSourceStatus.classList.toggle('error', error);
  if (!retry) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary-btn';
  button.textContent = t('retry');
  button.addEventListener('click', retry);
  extractSourceStatus.appendChild(button);
}

function refreshExtractPreview() {
  // The first community request resolves after the module finishes loading,
  // but this function can also be called synchronously while the elements are
  // still being declared above. Guarding makes that harmless.
  if (!extractPreviewStep) return;
  const selectedSetsForExtraction = selectedExtractSets();
  const hasSource = extractCommunityInput.checked || selectedSetsForExtraction.length > 0;
  const communityReady = !extractCommunityInput.checked || community !== null;
  const setsReadyForExtraction = selectedSetsForExtraction.every(({ id }) => loadedSets.has(id));
  const sourcesReady = hasSource && communityReady && setsReadyForExtraction
    && extractFailedSets.size === 0;
  const ready = yourMarkers.length > 0 && sourcesReady;

  extractRunButton.disabled = !ready;
  const renderPreviewMessage = (message) => {
    extractPreview.innerHTML = `<div class="result-card"><p>${escapeHtml(message)}</p></div>`;
  };

  if (!hasSource) {
    renderExtractStatus(t('extractChooseSource'));
    renderPreviewMessage(t('extractChooseSource'));
    return;
  }
  if (extractCommunityInput.checked && communityError) {
    renderExtractStatus(communityError.message, {
      error: true,
      retry: () => { communityLoad = loadCommunityMarkers(true); },
    });
    renderPreviewMessage(t('communityFailed'));
    return;
  }
  if (extractFailedSets.size > 0) {
    renderExtractStatus(t('setUnreachable'), {
      error: true,
      retry: () => {
        const retryIds = [...extractFailedSets];
        extractFailedSets.clear();
        queueExtractSetLoads(retryIds);
        refreshExtractPreview();
      },
    });
    renderPreviewMessage(t('setUnreachable'));
    return;
  }
  if (!communityReady || !setsReadyForExtraction) {
    renderExtractStatus(t('extractLoading'));
    renderPreviewMessage(t('extractLoading'));
    return;
  }

  const references = extractReferences();
  renderExtractStatus(t('extractReady', references.length, extractSourceNames().join(', ')));
  if (yourMarkers.length === 0) {
    renderPreviewMessage(t('extractNeedsMarkers'));
    return;
  }

  const outcome = extractOwnMarkers(yourMarkers, references);
  extractPreview.innerHTML = `<div class="result-card ok"><dl>`
    + `<dt>${t('labelUploaded')}</dt><dd>${localeNumber(yourMarkers.length)}</dd>`
    + `<dt>${t('labelPublishedRemoved')}</dt><dd>${localeNumber(outcome.exactMatches)}</dd>`
    + `<dt>${t('labelPersonalOverrides')}</dt><dd>${localeNumber(outcome.overrides)}</dd>`
    + `<dt>${t('labelPersonalUnique')}</dt><dd>${localeNumber(outcome.unique)}</dd>`
    + `<dt>${t('labelOwnTotal')}</dt><dd>${localeNumber(outcome.total)}</dd>`
    + '</dl></div>';
}

extractRunButton.addEventListener('click', withBusy(extractRunButton, async () => {
  await yourMarkersLoad;
  await communityLoad;
  await extractFetch;
  refreshExtractPreview();
  if (extractRunButton.disabled) return;

  const generatedAt = new Date();
  const lang = currentLang();
  const references = extractReferences();
  const sourceNames = extractSourceNames();
  const outcome = extractOwnMarkers(yourMarkers, references);
  let outputBytes;
  let validationLine;
  let backupEntries;

  try {
    validateMarkers(outcome.result, { source: 'extract-own' });
    outputBytes = writeMarkersBin(outcome.result);
    const reparsed = parseMarkersBin(
      outputBytes.buffer.slice(outputBytes.byteOffset, outputBytes.byteOffset + outputBytes.byteLength),
      { source: 'validation' },
    );
    const lost = outcome.result.length - reparsed.length;
    validationLine = lost > 0 ? t('logValidationOkDedup', lost) : t('logValidationOk');
    backupEntries = await backupYourMarkerFiles(generatedAt);
  } catch (err) {
    renderResult('extract-result', escapeHtml(err.message), true);
    return;
  }

  const entries = [
    { name: 'own-minimapmarkers.bin', data: outputBytes },
    { name: 'own-markers.json', data: new TextEncoder().encode(JSON.stringify(outcome.result, null, 4)) },
    ...backupEntries,
    {
      name: 'extract-own-log.txt',
      data: new TextEncoder().encode(buildExtractOwnLog({
        generatedAt,
        userFilenames: yourMarkerFiles.map((file) => file.name),
        backupFilenames: backupEntries.map((entry) => entry.name),
        sourceNames,
        referenceCount: references.length,
        uploadedCount: yourMarkers.length,
        exactMatches: outcome.exactMatches,
        overrides: outcome.overrides,
        unique: outcome.unique,
        totalCount: outcome.total,
        validationLine,
      }, lang)),
    },
  ];

  const zipName = 'tibia-maps-merge-own-markers.zip';
  downloadBlob(new Blob([buildZip(entries)]), zipName);
  renderResult('extract-result', `
    ${t('extractSuccessZip', zipName)}
    <dl>
      <dt>${t('labelPublishedRemoved')}</dt><dd>${localeNumber(outcome.exactMatches)}</dd>
      <dt>${t('labelPersonalOverrides')}</dt><dd>${localeNumber(outcome.overrides)}</dd>
      <dt>${t('labelPersonalUnique')}</dt><dd>${localeNumber(outcome.unique)}</dd>
      <dt>${t('labelOwnTotal')}</dt><dd>${localeNumber(outcome.total)}</dd>
    </dl>
  `, false);
}));

// Last, so every mode is fully wired before one is restored from the URL.
if (modeForHash()) selectMode(modeForHash(), { updateUrl: false });
