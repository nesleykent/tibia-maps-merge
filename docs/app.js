import { fetchCommunityMarkers } from './lib/community.js';
import { DEFAULT_ICON, MARKER_ICONS, iconGlyph } from './lib/icons.js';
import { currentLang, iconLabel, localeDate, localeNumber, t } from './lib/i18n.js';
import { buildAddMarksLog, buildConversionLog, buildMarkerSetsLog, buildMergeLog, formatBackupTimestamp } from './lib/logs.js';
import { checkMarkerFields, parseMarkerLines, resolveIcon, toInteger } from './lib/marker-input.js';
import { loadMarkersFile, mergeMarkers, parseMarkersBin, validateMarkers, writeMarkersBin } from './lib/markers.js';
import { MARKER_SETS, applyMarkerSet, fetchMarkerSet, fetchSetDates } from './lib/marker-sets.js';
import { buildQuestPrompt } from './lib/prompt.js';
import { fetchQuestCoordinates } from './lib/wiki.js';
import { CHANGELOG_URL, VERSION } from './lib/version.js';
import { buildZip } from './lib/zip.js';

const markerKey = (m) => `${m.x},${m.y},${m.z}`;
const sameContent = (a, b) => a.icon === b.icon && a.description === b.description;

// ---------- Mode tabs ----------
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
  'bin-to-json': { needsFile: true, accept: '.bin', output: 'markers.json' },
  'json-to-bin': { needsFile: true, accept: '.json', output: 'minimapmarkers.bin' },
  'community-to-json': { needsFile: false, accept: '', output: 'community-markers.json' },
};

function updateConversionFieldVisibility() {
  const config = CONVERSION_CONFIG[conversionType.value];
  conversionFileField.classList.toggle('hidden', !config.needsFile);
  conversionFileInput.accept = config.accept;
  // Every primary action in the app names what it produces, so this one
  // follows the chosen conversion.
  convertButton.textContent = t('downloadFile', config.output);
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

// ================= Edit Marks Mode =================
// Markers typed in here are ordinary marker objects, so they go through the
// exact same pipeline as an uploaded file: merged by coordinate with whatever
// the user loaded, then validated, serialized, and round-trip checked with
// the shared parser/encoder.

// Hand-typed markers are easy to lose to a stray reload, so the pending list
// is mirrored into localStorage -- best-effort, like the community cache.
const PENDING_KEY = 'tibia-maps-merge:pending-markers:v1';

const addExistingInput = document.getElementById('add-existing-files');
const addExistingStatus = document.getElementById('add-existing-status');
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
const markApplyStep = document.getElementById('mark-apply-step');
const markPreview = document.getElementById('mark-preview');
const markDirectionHint = document.getElementById('mark-direction-hint');
const addRunButton = document.getElementById('add-run');
const editSheet = document.getElementById('edit-sheet');
const editFieldX = document.getElementById('edit-x');
const editFieldY = document.getElementById('edit-y');
const editFieldZ = document.getElementById('edit-z');
const editFieldLabel = document.getElementById('edit-label');
const editMessage = document.getElementById('edit-message');
const clearSheet = document.getElementById('clear-sheet');

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
const iconNamesSheet = document.getElementById('icon-names-sheet');
document.getElementById('icon-names-list').innerHTML = MARKER_ICONS.map(({ id, name }) => (
  `<div class="icon-name">${iconGlyph(name, { size: 22 })}`
  + `<code>${escapeHtml(name)}</code>`
  + `<span class="icon-name-byte">0x${id.toString(16).toUpperCase().padStart(2, '0')}</span></div>`
)).join('');
document.getElementById('icon-names-open').addEventListener('click', () => iconNamesSheet.showModal());
document.getElementById('icon-names-close').addEventListener('click', () => iconNamesSheet.close());
iconNamesSheet.addEventListener('click', (event) => {
  if (event.target === iconNamesSheet) iconNamesSheet.close();
});

const markIconSelect = mountIconField(document.querySelector('[data-icon-field="mark-icon"]'));
const editIconSelect = mountIconField(document.querySelector('[data-icon-field="edit-icon"]'));

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

// tibiamaps.io's map takes the position in its fragment, with a zoom level
// after the colon: https://tibiamaps.io/map#33281,31724,7:1
const mapUrl = (m) => `https://tibiamaps.io/map#${m.x},${m.y},${m.z}:1`;

const MAP_PIN_SVG = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">'
  + '<path d="M8 1.6c2.5 0 4.5 2 4.5 4.5 0 3.2-4.5 8.3-4.5 8.3S3.5 9.3 3.5 6.1c0-2.5 2-4.5 4.5-4.5z" '
  + 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'
  + '<circle cx="8" cy="6.1" r="1.7" fill="currentColor"/></svg>';

function renderPending() {
  addRows.textContent = '';
  pending.forEach((marker, index) => {
    const coordinates = `${marker.x}, ${marker.y}, ${marker.z}`;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="cell-map">
        <a class="map-link" href="${mapUrl(marker)}" target="_blank" rel="noopener">${MAP_PIN_SVG}<span class="visually-hidden"></span></a>
      </td>
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
    const mapLink = row.querySelector('.map-link');
    mapLink.title = t('viewOnMap', coordinates);
    mapLink.querySelector('.visually-hidden').textContent = t('viewOnMap', coordinates);
    const [editButton, deleteButton] = row.querySelectorAll('.row-btn');
    editButton.textContent = t('editAction');
    deleteButton.textContent = t('deleteAction');
    editButton.addEventListener('click', () => openEditSheet(index));
    deleteButton.addEventListener('click', () => {
      pending.splice(index, 1);
      renderPending();
    });
    addRows.appendChild(row);
  });

  // Nothing to review until there's something in the list, so the whole step
  // stays out of the way rather than sitting there as an empty placeholder.
  reviewStep.classList.toggle('hidden', pending.length === 0);
  addRunButton.disabled = pending.length === 0;
  refreshApplyStep();
  savePending();
}

/**
 * What applying the reviewed list to `base` would do.
 *
 * Adding puts your list in last, so a mark you wrote wins over one already at
 * that coordinate -- the opposite of Marker Sets, where a published collection
 * fills gaps and your own file wins. These marks *are* yours, and rewriting a
 * label or icon is half the reason to type one. Removing drops every
 * coordinate in the list, whatever it is labelled in the file.
 */
function applyPending(base, mode) {
  const keys = new Set(pending.map(markerKey));
  if (mode === 'remove') {
    const result = base.filter((m) => !keys.has(markerKey(m)));
    return { result, added: 0, replaced: 0, removed: base.length - result.length, total: result.length };
  }
  const baseKeys = new Set(base.map(markerKey));
  const replaced = [...keys].filter((k) => baseKeys.has(k)).length;
  const result = mergeMarkers(base, pending);
  return { result, added: keys.size - replaced, replaced, removed: 0, total: result.length };
}

// With no file loaded there is nothing to remove from, so the only thing the
// list can produce is a new file. Answering 'add' there keeps a stale radio
// from emptying a file that was unloaded after it was picked.
function markDirection() {
  if (existingBase.length === 0) return 'add';
  return document.querySelector('input[name="mark-direction"]:checked')?.value ?? 'add';
}

function refreshApplyStep() {
  const ready = pending.length > 0 && existingBase.length > 0;
  markApplyStep.classList.toggle('hidden', !ready);
  if (!ready) {
    markPreview.innerHTML = '';
    return;
  }
  const mode = markDirection();
  const { added, replaced, removed, total } = applyPending(existingBase, mode);
  const rows = mode === 'remove'
    ? `<dt>${t('setLabelRemoved')}</dt><dd>${localeNumber(removed)}</dd>`
    : `<dt>${t('setLabelAdded')}</dt><dd>${localeNumber(added)}</dd>`
      + `<dt>${t('labelReplacedByYours')}</dt><dd>${localeNumber(replaced)}</dd>`;
  markDirectionHint.textContent = t(mode === 'remove' ? 'markDirectionHintRemove' : 'markDirectionHintAdd');
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
// The importer can only read wikis that allow it; an assistant can read any of
// them. These hand the same URL to the guide's extraction prompt, so a wiki
// this app cannot fetch is still one paste away from a marker list.
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

function withPrompt(action) {
  const url = currentPromptUrl();
  if (!url) return rejectMissingUrl();
  action(buildQuestPrompt(url), url);
}

function copyPrompt() {
  withPrompt(async (prompt, url) => {
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

function openAssistant(name, base) {
  withPrompt((prompt, questUrl) => {
    wikiStatus.classList.remove('error');
    wikiStatus.textContent = t('promptOpened', name, questUrl);
    window.open(base + encodeURIComponent(prompt), '_blank', 'noopener');
  });
}

document.getElementById('prompt-copy').addEventListener('click', copyPrompt);
document.getElementById('prompt-chatgpt').addEventListener('click', () => openAssistant('ChatGPT', 'https://chatgpt.com/?q='));

// ChatGPT and copying are the two in reach above; these are the rest, kept
// behind a link so the row does not grow a button per service.
const OTHER_ASSISTANTS = [
  { name: 'Claude', url: 'https://claude.ai/new?q=' },
  { name: 'Gemini', url: 'https://www.google.com/search?udm=50&source=searchlabs&q=' },
  { name: 'Grok', url: 'https://grok.com/?q=' },
  { name: 'Perplexity', url: 'https://www.perplexity.ai/search?q=' },
];

const assistantSheet = document.getElementById('assistant-sheet');
const assistantList = document.getElementById('assistant-list');

for (const { name, url } of OTHER_ASSISTANTS) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'assistant';
  row.innerHTML = '<span class="assistant-name"></span><span class="assistant-note"></span>';
  row.querySelector('.assistant-name').textContent = name;
  row.querySelector('.assistant-note').textContent = t('assistantOpens');
  row.addEventListener('click', () => {
    assistantSheet.close();
    openAssistant(name, url);
  });
  assistantList.appendChild(row);
}

document.getElementById('prompt-open').addEventListener('click', () => assistantSheet.showModal());
document.getElementById('assistant-close').addEventListener('click', () => assistantSheet.close());
assistantSheet.addEventListener('click', (event) => {
  if (event.target === assistantSheet) assistantSheet.close();
});

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

// ---------- Edit sheet ----------
// Editing is a temporary, cancellable context, so it gets its own sheet with
// a Cancel / Save Changes pair rather than putting a Cancel button in the
// workspace next to the tab's primary action.
let editingIndex = -1;

function openEditSheet(index) {
  editingIndex = index;
  const marker = pending[index];
  editFieldX.value = marker.x;
  editFieldY.value = marker.y;
  editFieldZ.value = marker.z;
  editFieldLabel.value = marker.description;
  editIconSelect.value = marker.icon;
  editMessage.classList.add('hidden');
  editSheet.showModal();
}

editSheet.querySelector('form').addEventListener('submit', (event) => {
  const marker = {
    description: editFieldLabel.value.trim(),
    icon: editIconSelect.value,
    x: toInteger(editFieldX.value),
    y: toInteger(editFieldY.value),
    z: toInteger(editFieldZ.value),
  };
  const problem = checkMarkerFields(marker);
  if (problem) {
    // Keep the sheet open so the entry can be corrected in place.
    event.preventDefault();
    editMessage.textContent = t(problem.key, ...(problem.args ?? []));
    editMessage.classList.remove('hidden');
    return;
  }
  upsertMarker(marker, { replacingIndex: editingIndex });
  renderPending();
});

document.getElementById('edit-cancel').addEventListener('click', () => editSheet.close());

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

// ---------- Your existing marker file ----------
let existingBase = [];
let existingSkipped = [];
let existingLoad = Promise.resolve();

async function loadExistingMarkers() {
  const files = Array.from(addExistingInput.files || []);
  const groups = [];
  existingBase = [];
  existingSkipped = [];
  if (files.length === 0) {
    addExistingStatus.textContent = '';
    addExistingStatus.classList.remove('error');
    refreshApplyStep();
    return;
  }
  addExistingStatus.textContent = t('loading');
  addExistingStatus.classList.remove('error');
  for (const file of files) {
    try {
      groups.push(await loadMarkersFile(file));
    } catch (err) {
      existingSkipped.push({ file: file.name, error: err.message });
    }
  }
  if (groups.length === 0) {
    addExistingStatus.textContent = t('noneParsed');
    addExistingStatus.classList.add('error');
    refreshApplyStep();
    return;
  }
  existingBase = mergeMarkers(...groups);
  addExistingStatus.textContent = t('existingLoaded', existingBase.length, files.map((f) => f.name).join(', '));
  refreshApplyStep();
}

addExistingInput.addEventListener('change', () => { existingLoad = loadExistingMarkers(); });

// ---------- Export ----------
addRunButton.addEventListener('click', withBusy(addRunButton, async () => {
  if (pending.length === 0) {
    renderResult('add-result', t('addNoMarkers'), true);
    return;
  }
  await existingLoad; // a file picked a moment ago may still be parsing
  const generatedAt = new Date();
  const lang = currentLang();
  const files = Array.from(addExistingInput.files || []);

  const mode = markDirection();

  let outcome;
  let outputBytes;
  let validationLine;
  const backupEntries = [];
  try {
    for (const file of files) {
      backupEntries.push({
        name: `backup-${formatBackupTimestamp(generatedAt)}_${file.name}`,
        data: new Uint8Array(await file.arrayBuffer()),
      });
    }
    outcome = applyPending(existingBase, mode);
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
        userFilenames: files.map((f) => f.name),
        backupFilenames: backupEntries.map((e) => e.name),
        mode,
        existingCount: existingBase.length,
        addedCount: outcome.added,
        replacedCount: outcome.replaced,
        removedCount: outcome.removed,
        totalCount: outcome.total,
        validationLine,
        addedMarkers: pending,
      }, lang)),
    },
  ];

  const zipName = 'tibia-maps-merge-marks.zip';
  downloadBlob(new Blob([buildZip(entries)]), zipName);

  const skippedHtml = existingSkipped.length
    ? `<p>${t('skippedIntro')}</p><ul class="warn-list">${existingSkipped.map((s) => (
      `<li>${escapeHtml(s.file)}: ${escapeHtml(s.error)}</li>`
    )).join('')}</ul>`
    : '';
  const rows = mode === 'remove'
    ? `<dt>${t('setLabelRemoved')}</dt><dd>${localeNumber(outcome.removed)}</dd>`
    : `<dt>${t('labelYouAdded')}</dt><dd>${localeNumber(outcome.added)}</dd>`
      + `<dt>${t('labelReplacedByYours')}</dt><dd>${localeNumber(outcome.replaced)}</dd>`;
  renderResult('add-result', `
    ${t(mode === 'remove' ? 'marksUpdatedZip' : 'marksCreatedZip', zipName)}
    <dl>
      <dt>${t('labelExisting')}</dt><dd>${localeNumber(existingBase.length)}</dd>
      ${rows}
      <dt>${t('labelTotal')}</dt><dd>${localeNumber(outcome.total)}</dd>
    </dl>
    ${skippedHtml}
  `, false);
}));

renderPending();

// ================= Marker Sets =================
// One task: your marker file, plus one of the collections tibiamaps.io
// publishes, added or removed. Nothing here is editable -- a collection is a
// published list you take or leave whole, so this mode is a picker and a
// preview. Marks you assemble yourself go through Edit Marks, which has the
// row-by-row table for exactly that.

const setsInput = document.getElementById('sets-files');
const setsFileStatus = document.getElementById('sets-file-status');
const setChoices = document.getElementById('set-choices');
const setsSourceStatus = document.getElementById('sets-source-status');
const setsApplyStep = document.getElementById('sets-apply-step');
const setsPreview = document.getElementById('sets-preview');
const setsRunButton = document.getElementById('sets-run');

let setsBase = [];              // markers loaded from the user's file
let setsBaseFiles = [];
let chosenMarks = null;         // {label, markers}

function setsDirection() {
  return document.querySelector('input[name="set-direction"]:checked')?.value ?? 'add';
}

// ---------- the picker ----------
for (const { id, name, large } of MARKER_SETS) {
  const choice = document.createElement('label');
  choice.className = 'set-choice';
  choice.innerHTML = '<input type="radio" name="marker-set" class="visually-hidden">'
    + '<span class="set-name"></span><span class="set-note"></span>'
    + `<span class="set-date" data-set-date="${id}"></span>`;
  const input = choice.querySelector('input');
  input.value = id;
  choice.querySelector('.set-name').textContent = name;
  if (large) choice.querySelector('.set-note').textContent = t('setLarge');
  input.addEventListener('change', () => selectSet(id, name));
  setChoices.appendChild(choice);
}

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

// A collection whose contents need explaining says so once it is picked --
// per-set prose in the picker itself would drown the eight that need none.
function showSetExplainer(id) {
  for (const note of document.querySelectorAll('.set-explainer')) {
    note.classList.toggle('hidden', note.id !== `set-note-${id}`);
  }
}

async function selectSet(id, name) {
  showSetExplainer(id);
  chosenMarks = null;
  refreshSetsPreview();
  setsSourceStatus.classList.remove('error');
  setsSourceStatus.textContent = t('setLoading');
  try {
    const markers = await fetchMarkerSet(id);
    chosenMarks = { label: name, markers };
    setsSourceStatus.textContent = t('setLoaded', name, markers.length);
  } catch {
    setsSourceStatus.textContent = t('setUnreachable');
    setsSourceStatus.classList.add('error');
  }
  refreshSetsPreview();
}

// ---------- your file ----------
let setsLoad = Promise.resolve();

async function loadSetsBase() {
  const files = Array.from(setsInput.files || []);
  setsBase = [];
  setsBaseFiles = files;
  if (files.length === 0) {
    setsFileStatus.textContent = '';
    setsFileStatus.classList.remove('error');
    refreshSetsPreview();
    return;
  }
  setsFileStatus.classList.remove('error');
  setsFileStatus.textContent = t('loading');
  const groups = [];
  for (const file of files) {
    try {
      groups.push(await loadMarkersFile(file));
    } catch {
      // reported below by the count, same as Merge Mode's skip behaviour
    }
  }
  if (groups.length === 0) {
    setsFileStatus.textContent = t('noneParsed');
    setsFileStatus.classList.add('error');
    refreshSetsPreview();
    return;
  }
  setsBase = mergeMarkers(...groups);
  setsFileStatus.textContent = t('existingLoaded', setsBase.length, files.map((f) => f.name).join(', '));
  refreshSetsPreview();
}

setsInput.addEventListener('change', () => { setsLoad = loadSetsBase(); });
document.querySelectorAll('input[name="set-direction"]').forEach((r) => r.addEventListener('change', refreshSetsPreview));

// ---------- what it will do ----------
function refreshSetsPreview() {
  const ready = setsBase.length > 0 && chosenMarks !== null;
  setsApplyStep.classList.toggle('hidden', !ready);
  setsRunButton.disabled = !ready;
  if (!ready) {
    setsPreview.innerHTML = '';
    return;
  }
  const mode = setsDirection();
  const { added, kept, removed, total } = applyMarkerSet(setsBase, chosenMarks.markers, mode);
  const rows = mode === 'remove'
    ? `<dt>${t('setLabelRemoved')}</dt><dd>${localeNumber(removed)}</dd>`
    : `<dt>${t('setLabelAdded')}</dt><dd>${localeNumber(added)}</dd>`
      + `<dt>${t('setLabelKept')}</dt><dd>${localeNumber(kept)}</dd>`;
  setsPreview.innerHTML = `<div class="result-card ok">${t('setPreview', chosenMarks.label, chosenMarks.markers.length)}`
    + `<dl>${rows}<dt>${t('labelTotal')}</dt><dd>${localeNumber(total)}</dd></dl></div>`;
}

// ---------- download ----------
setsRunButton.addEventListener('click', withBusy(setsRunButton, async () => {
  await setsLoad;
  if (setsBase.length === 0 || !chosenMarks) return;
  const generatedAt = new Date();
  const lang = currentLang();
  const mode = setsDirection();

  let outcome;
  let outputBytes;
  let validationLine;
  const backupEntries = [];
  try {
    for (const file of setsBaseFiles) {
      backupEntries.push({
        name: `backup-${formatBackupTimestamp(generatedAt)}_${file.name}`,
        data: new Uint8Array(await file.arrayBuffer()),
      });
    }
    outcome = applyMarkerSet(setsBase, chosenMarks.markers, mode);
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
        userFilenames: setsBaseFiles.map((f) => f.name),
        backupFilenames: backupEntries.map((e) => e.name),
        setName: chosenMarks.label,
        setCount: chosenMarks.markers.length,
        mode,
        baseCount: setsBase.length,
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
      <dt>${t('labelExisting')}</dt><dd>${localeNumber(setsBase.length)}</dd>
      ${rows}
      <dt>${t('labelTotal')}</dt><dd>${localeNumber(outcome.total)}</dd>
    </dl>
  `, false);
}));

// Last, so every mode is fully wired before one is restored from the URL.
if (modeForHash()) selectMode(modeForHash(), { updateUrl: false });
