// Fetches the live, continuously-updated community `minimapmarkers.bin`
// distributed by tibiamaps.io -- the same file behind its own "minimap with
// markers" download (https://tibiamaps.io/downloads/minimap-with-markers).
// It tracks every Tibia game update automatically, maintained by the
// community at https://github.com/tibiamaps/tibia-map-data.
import { extractZipEntry } from './unzip.js';
import { parseMarkersBin } from './markers.js';

const COMMUNITY_ZIP_URL = 'https://tibiamaps.github.io/tibia-map-data/minimap-with-markers.zip';

const CACHE_KEY = 'tibia-maps-merge:community-cache:v1';
// tibiamaps.io's own CDN serves this file with `Cache-Control: max-age=600`
// (10 minutes) -- matching that means we never hold data the origin itself
// considers stale, while never hitting the network more often than that for
// repeat page loads/reloads within the same window.
const CACHE_TTL_MS = 10 * 60 * 1000;

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return {
      markers: parsed.markers,
      lastModified: parsed.lastModified ? new Date(parsed.lastModified) : null,
    };
  } catch {
    return null;
  }
}

function writeCache(markers, lastModified) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      markers,
      lastModified: lastModified ? lastModified.toISOString() : null,
      fetchedAt: Date.now(),
    }));
  } catch {
    // Best-effort only -- private browsing, storage quota, etc. shouldn't break the app.
  }
}

async function fetchFresh() {
  let response;
  try {
    response = await fetch(COMMUNITY_ZIP_URL);
  } catch (err) {
    throw new Error(`Could not reach tibiamaps.io (${err.message}). Check your connection and try again.`);
  }
  if (!response.ok) {
    throw new Error(`tibiamaps.io returned HTTP ${response.status} for the community minimap download.`);
  }
  const zipBytes = await response.arrayBuffer();
  const binBytes = await extractZipEntry(zipBytes, 'minimapmarkers.bin');
  const markers = parseMarkersBin(binBytes.buffer.slice(binBytes.byteOffset, binBytes.byteOffset + binBytes.byteLength), {
    source: 'tibiamaps.io community minimapmarkers.bin',
  });
  const lastModifiedHeader = response.headers.get('last-modified');
  const lastModified = lastModifiedHeader ? new Date(lastModifiedHeader) : null;
  writeCache(markers, lastModified);
  return { markers, lastModified };
}

/**
 * Returns {markers, lastModified}. Serves from a local cache (up to
 * CACHE_TTL_MS old) unless `forceRefresh` is set, so visiting/reloading the
 * page repeatedly doesn't re-download the ~6.5MB archive every time.
 */
export async function fetchCommunityMarkers({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = readCache();
    if (cached) return cached;
  }
  return fetchFresh();
}
