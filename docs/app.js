import { fetchCommunityMarkers } from './lib/community.js';
import { loadMarkersFile, mergeMarkers, writeMarkersBin } from './lib/markers.js';

const runButton = document.getElementById('merge-run');
const statusEl = document.getElementById('community-status');
const fileInput = document.getElementById('personal-files');

let community = null; // {markers, lastModified}
let communityError = null;

function formatDate(date) {
  if (!date) return 'unknown date';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

async function loadCommunityMarkers() {
  statusEl.textContent = 'Loading…';
  statusEl.classList.remove('error');
  runButton.disabled = true;
  try {
    community = await fetchCommunityMarkers();
    communityError = null;
    statusEl.textContent = `Loaded ${community.markers.length.toLocaleString()} community markers (updated ${formatDate(community.lastModified)})`;
    runButton.disabled = false;
  } catch (err) {
    community = null;
    communityError = err;
    statusEl.textContent = `${err.message} `;
    statusEl.classList.add('error');
    const retry = document.createElement('button');
    retry.className = 'secondary-btn';
    retry.textContent = 'Retry';
    retry.addEventListener('click', loadCommunityMarkers);
    statusEl.appendChild(retry);
  }
}

loadCommunityMarkers();

// ---------- File-picker label ----------
fileInput.addEventListener('change', () => {
  const label = fileInput.closest('.file-picker').querySelector('.file-picker-label');
  const files = fileInput.files;
  if (!files || files.length === 0) {
    label.textContent = label.dataset.default;
    label.classList.remove('chosen');
    return;
  }
  label.textContent = files.length === 1 ? files[0].name : `${files.length} files selected`;
  label.classList.add('chosen');
});

// ---------- Helpers ----------
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

function renderResult(html, isError) {
  document.getElementById('merge-result').innerHTML = `<div class="result-card ${isError ? 'err' : 'ok'}">${html}</div>`;
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

// ---------- Merge ----------
runButton.addEventListener('click', withBusy(runButton, async () => {
  if (!community) {
    renderResult('Community markers failed to load -- click Retry above first.', true);
    return;
  }
  if (!fileInput.files || fileInput.files.length === 0) {
    renderResult('Choose at least one of your own marker files first.', true);
    return;
  }
  const outputName = document.getElementById('output-name').value.trim() || 'minimapmarkers.bin';

  const personalGroups = [];
  const skipped = [];
  for (const file of Array.from(fileInput.files)) {
    try {
      personalGroups.push(await loadMarkersFile(file));
    } catch (err) {
      skipped.push({ file: file.name, error: err.message });
    }
  }
  if (personalGroups.length === 0) {
    renderResult('None of your marker files could be parsed.', true);
    return;
  }

  const personalKeys = new Set();
  for (const group of personalGroups) {
    for (const marker of group) personalKeys.add(`${marker.x},${marker.y},${marker.z}`);
  }
  const overriddenCount = community.markers.filter((m) => personalKeys.has(`${m.x},${m.y},${m.z}`)).length;

  const merged = mergeMarkers(community.markers, ...personalGroups);

  let blob;
  if (outputName.endsWith('.bin')) {
    try {
      blob = new Blob([writeMarkersBin(merged)]);
    } catch (err) {
      renderResult(err.message, true);
      return;
    }
  } else {
    blob = new Blob([JSON.stringify(merged, null, 4)], { type: 'application/json' });
  }
  downloadBlob(blob, outputName);

  const personalTotal = personalGroups.reduce((sum, g) => sum + g.length, 0);
  const skippedHtml = skipped.length
    ? `<ul class="warn-list">${skipped.map((s) => `<li>${s.file}: ${s.error}</li>`).join('')}</ul>`
    : '';
  renderResult(`
    Merged successfully -- <strong>${outputName}</strong> downloaded.
    <dl>
      <dt>Community markers</dt><dd>${community.markers.length.toLocaleString()}</dd>
      <dt>Your markers</dt><dd>${personalTotal.toLocaleString()}</dd>
      <dt>Yours overrode community</dt><dd>${overriddenCount.toLocaleString()}</dd>
      <dt>Total in result</dt><dd>${merged.length.toLocaleString()}</dd>
    </dl>
    ${skippedHtml}
  `, false);
}));
