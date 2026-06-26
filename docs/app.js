import { buildZip } from './lib/zip.js';
import { loadMarkersFile, mergeMarkers, writeMarkersBin } from './lib/markers.js';
import { fileListToMap, openSource } from './lib/sources.js';
import { convertFromMinimap } from './lib/convert.js';
import { mergeSources } from './lib/merge.js';

// ---------- Tabs ----------
document.querySelectorAll('.tab-button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-button').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ---------- File-picker label updates ----------
function describeFiles(input) {
  const files = input.files;
  if (!files || files.length === 0) return null;
  if (input.webkitdirectory) {
    const first = files[0].webkitRelativePath || files[0].name;
    const folderName = first.split('/')[0];
    return `${folderName} (${files.length} item${files.length === 1 ? '' : 's'})`;
  }
  if (files.length === 1) return files[0].name;
  return `${files.length} files selected`;
}

function wireFilePickerLabel(input) {
  const label = input.closest('.file-picker').querySelector('.file-picker-label');
  input.addEventListener('change', () => {
    const description = describeFiles(input);
    if (description) {
      label.textContent = description;
      label.classList.add('chosen');
    } else {
      label.textContent = label.dataset.default;
      label.classList.remove('chosen');
    }
  });
}

document.querySelectorAll('.file-picker input[type="file"]').forEach(wireFilePickerLabel);

// ---------- Dynamic source rows (Merge tab) ----------
function addSourceRow() {
  const container = document.getElementById('merge-sources');
  const row = document.createElement('div');
  row.className = 'source-row';
  row.innerHTML = `
    <label class="file-picker">
      <input type="file" webkitdirectory multiple>
      <span class="file-picker-label" data-default="Choose folder…">Choose folder…</span>
    </label>
    <button class="remove-btn" type="button">✕</button>
  `;
  wireFilePickerLabel(row.querySelector('input[type="file"]'));
  row.querySelector('.remove-btn').addEventListener('click', () => row.remove());
  container.appendChild(row);
}
addSourceRow();
addSourceRow();
document.getElementById('merge-add-source').addEventListener('click', addSourceRow);

function mergeSourceInputs() {
  return Array.from(document.querySelectorAll('#merge-sources input[type="file"]'))
    .filter((input) => input.files && input.files.length > 0);
}

// ---------- Helpers ----------
function parseFloors(value) {
  if (!value) return null;
  const floors = new Set();
  for (const part of value.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(Number);
      for (let i = start; i <= end; i++) floors.add(i);
    } else {
      floors.add(Number(trimmed));
    }
  }
  return floors;
}

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

function showProgress(containerId, message) {
  document.getElementById(containerId).innerHTML = `<p class="progress-line">${message}</p>`;
}

function boundsTable(bounds) {
  if (!bounds) return '';
  return `<dl>
    <dt>Bounds</dt><dd>x[${bounds.xMin}, ${bounds.xMax}] y[${bounds.yMin}, ${bounds.yMax}] z[${bounds.zMin}, ${bounds.zMax}]</dd>
    <dt>Size</dt><dd>${bounds.width} x ${bounds.height}</dd>
    <dt>Floors</dt><dd>${bounds.floorIDs.join(', ')}</dd>
  </dl>`;
}

function withBusy(button, fn) {
  return async (...args) => {
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Working…';
    try {
      await fn(...args);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  };
}

// ---------- Convert ----------
document.getElementById('convert-run').addEventListener('click', withBusy(
  document.getElementById('convert-run'),
  async () => {
    const input = document.getElementById('convert-input');
    if (!input.files || input.files.length === 0) {
      renderResult('convert-result', 'Pick a minimap export folder first.', true);
      return;
    }
    try {
      const source = await openSource(fileListToMap(input.files), 'convert input');
      const result = await convertFromMinimap(source, {
        includeMarkers: !document.getElementById('convert-no-markers').checked,
        markersOnly: document.getElementById('convert-markers-only').checked,
        floors: parseFloors(document.getElementById('convert-floors').value.trim()),
        onProgress: (msg) => showProgress('convert-result', msg),
      });
      const zipBytes = buildZip(result.files);
      downloadBlob(new Blob([zipBytes]), 'data.zip');
      renderResult('convert-result', `
        Converted successfully -- <strong>data.zip</strong> downloaded.
        <dl>
          <dt>Markers</dt><dd>${result.markerCount}</dd>
          <dt>Floors rendered</dt><dd>${result.floorsRendered.join(', ') || '(markers only)'}</dd>
        </dl>
        ${boundsTable(result.bounds)}
      `, false);
    } catch (err) {
      renderResult('convert-result', err.message, true);
    }
  },
));

// ---------- Merge ----------
document.getElementById('merge-run').addEventListener('click', withBusy(
  document.getElementById('merge-run'),
  async () => {
    const inputs = mergeSourceInputs();
    if (inputs.length < 2) {
      renderResult('merge-result', 'Choose at least two source folders.', true);
      return;
    }
    try {
      const sources = await Promise.all(
        inputs.map((input, i) => openSource(fileListToMap(input.files), `source ${i + 1}`)),
      );
      const result = await mergeSources(sources, {
        includeMarkers: !document.getElementById('merge-no-markers').checked,
        includeMaps: !document.getElementById('merge-no-maps').checked,
        floors: parseFloors(document.getElementById('merge-floors').value.trim()),
        onProgress: (msg) => showProgress('merge-result', msg),
      });
      const zipBytes = buildZip(result.files);
      downloadBlob(new Blob([zipBytes]), 'data-merged.zip');
      const floorRows = Object.entries(result.floors || {})
        .map(([fid, n]) => `<dt>Floor ${fid}</dt><dd>${n} source(s) contributed</dd>`).join('');
      renderResult('merge-result', `
        Merged successfully -- <strong>data-merged.zip</strong> downloaded.
        <dl>
          <dt>Markers</dt><dd>${result.markerCount}</dd>
          ${floorRows}
        </dl>
        ${boundsTable(result.bounds)}
      `, false);
    } catch (err) {
      renderResult('merge-result', err.message, true);
    }
  },
));

// ---------- Markers ----------
document.getElementById('markers-run').addEventListener('click', withBusy(
  document.getElementById('markers-run'),
  async () => {
    const input = document.getElementById('markers-files');
    const outputName = document.getElementById('markers-output-name').value.trim() || 'merged-markers.json';
    if (!input.files || input.files.length === 0) {
      renderResult('markers-result', 'Choose at least one marker file.', true);
      return;
    }
    const groups = [];
    const skipped = [];
    for (const file of Array.from(input.files)) {
      try {
        groups.push(await loadMarkersFile(file));
      } catch (err) {
        skipped.push({ file: file.name, error: err.message });
      }
    }
    if (groups.length === 0) {
      renderResult('markers-result', 'No marker files could be parsed.', true);
      return;
    }
    const merged = mergeMarkers(...groups);
    let blob;
    if (outputName.endsWith('.bin')) {
      try {
        blob = new Blob([writeMarkersBin(merged)]);
      } catch (err) {
        renderResult('markers-result', err.message, true);
        return;
      }
    } else {
      blob = new Blob([JSON.stringify(merged, null, 4)], { type: 'application/json' });
    }
    downloadBlob(blob, outputName);
    const skippedHtml = skipped.length
      ? `<ul class="warn-list">${skipped.map((s) => `<li>${s.file}: ${s.error}</li>`).join('')}</ul>`
      : '';
    renderResult('markers-result', `
      Merged successfully -- <strong>${outputName}</strong> downloaded.
      <dl>
        <dt>Total entries read</dt><dd>${groups.reduce((sum, g) => sum + g.length, 0)}</dd>
        <dt>Unique markers</dt><dd>${merged.length}</dd>
      </dl>
      ${skippedHtml}
    `, false);
  },
));

// ---------- Info ----------
document.getElementById('info-run').addEventListener('click', withBusy(
  document.getElementById('info-run'),
  async () => {
    const input = document.getElementById('info-input');
    if (!input.files || input.files.length === 0) {
      renderResult('info-result', 'Pick a folder first.', true);
      return;
    }
    try {
      const source = await openSource(fileListToMap(input.files), 'info target');
      const markers = await source.markers();
      const tileRows = source.kind === 'raw'
        ? `<dt>Color tiles</dt><dd>${source.colorTiles.size}</dd><dt>WaypointCost tiles</dt><dd>${source.pathTiles.size}</dd>`
        : '';
      renderResult('info-result', `
        <dl>
          <dt>Kind</dt><dd>${source.kind === 'raw' ? 'raw minimap export' : 'converted data folder'}</dd>
          <dt>Markers</dt><dd>${markers.length}</dd>
          ${tileRows}
        </dl>
        ${boundsTable(source.bounds)}
      `, false);
    } catch (err) {
      renderResult('info-result', err.message, true);
    }
  },
));
