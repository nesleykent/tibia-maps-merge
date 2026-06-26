// Fetches the live, continuously-updated community `minimapmarkers.bin`
// distributed by tibiamaps.io -- the same file behind its own "minimap with
// markers" download (https://tibiamaps.io/downloads/minimap-with-markers).
// It tracks every Tibia game update automatically, maintained by the
// community at https://github.com/tibiamaps/tibia-map-data.
import { extractZipEntry } from './unzip.js';
import { parseMarkersBin } from './markers.js';

const COMMUNITY_ZIP_URL = 'https://tibiamaps.github.io/tibia-map-data/minimap-with-markers.zip';

export async function fetchCommunityMarkers() {
  let response;
  try {
    response = await fetch(COMMUNITY_ZIP_URL, { cache: 'no-cache' });
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
  const lastModified = response.headers.get('last-modified');
  return { markers, lastModified: lastModified ? new Date(lastModified) : null };
}
