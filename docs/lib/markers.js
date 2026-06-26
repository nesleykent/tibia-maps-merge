// Parsing, writing, sorting, and merging of Tibia minimap markers.
// Mirrors the binary layout documented at
// https://tibiamaps.io/guides/minimap-file-format#map-marker-data

import { ICONS_BY_ID, ICONS_BY_NAME } from './constants.js';

function minimapBytesToCoordinate(x1, x2, x3) {
  return x1 + 0x80 * x2 + 0x4000 * x3 - 0x4080;
}

function coordinateToMinimapBytes(x) {
  const x3 = x >> 14;
  const x1 = 0x80 + (x % 0x80);
  const x2 = (x - 0x4000 * x3 - x1 + 0x4080) >> 7;
  return [x1, x2, x3];
}

export function sortMarkers(markers) {
  markers.sort((a, b) => (
    (a.z * 10 ** 10 + a.x * 10 ** 5 + a.y) -
    (b.z * 10 ** 10 + b.x * 10 ** 5 + b.y)
  ));
  return markers;
}

/**
 * Parse the contents of a `minimapmarkers.bin` file (as an ArrayBuffer)
 * into an array of {description, icon, x, y, z} marker objects.
 */
export function parseMarkersBin(arrayBuffer, { source } = {}) {
  const label = source || '<buffer>';
  const data = new Uint8Array(arrayBuffer);
  const decoder = new TextDecoder('utf-8');
  const markers = [];
  let index = 0;
  const length = data.length;

  while (index < length) {
    if (data[index] !== 0x0A) {
      throw new Error(`${label}: expected marker start at byte ${index}`);
    }
    index += 1;
    index += 1; // marker size byte -- unused, we resync on 0x0A instead
    if (data[index] !== 0x0A) {
      throw new Error(`${label}: expected coordinate block at byte ${index}`);
    }
    index += 1;
    const coordinateSize = data[index];
    index += 1;
    if (coordinateSize !== 0x0A) {
      throw new Error(`${label}: unsupported coordinate size 0x${coordinateSize.toString(16)}`);
    }
    index += 1; // 0x08
    const x = minimapBytesToCoordinate(data[index], data[index + 1], data[index + 2]);
    index += 3;
    index += 1; // 0x10
    const y = minimapBytesToCoordinate(data[index], data[index + 1], data[index + 2]);
    index += 3;
    index += 1; // 0x18
    const z = data[index];
    index += 1;
    index += 1; // 0x10
    const icon = ICONS_BY_ID.get(data[index]) ?? null;
    index += 1;
    index += 1; // 0x1A
    const descriptionLength = data[index];
    index += 1;
    const description = decoder.decode(data.subarray(index, index + descriptionLength));
    index += descriptionLength;
    // The client occasionally produces malformed trailing bytes instead of
    // the usual 0x20 0x00 terminator; resync on the next marker instead of
    // assuming a fixed terminator.
    // https://github.com/tibiamaps/tibia-maps-script/issues/21
    while (index < length && data[index] !== 0x0A) {
      index += 1;
    }
    markers.push({ description, icon, x, y, z });
  }

  sortMarkers(markers);

  const seen = new Set();
  const unique = [];
  for (const marker of markers) {
    const key = JSON.stringify(marker, Object.keys(marker).sort()).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(marker);
  }
  return unique;
}

/** Serialize marker objects back into the Tibia client's binary format. */
export function writeMarkersBin(markers) {
  const chunks = [];
  for (const marker of sortMarkers([...markers])) {
    const description = new TextEncoder().encode(marker.description || '');
    if (description.length > 100) {
      throw new Error(`marker description too long (${description.length} bytes): ${JSON.stringify(marker)}`);
    }
    const iconByte = ICONS_BY_NAME.get(marker.icon);
    if (iconByte === undefined) {
      throw new Error(`unknown marker icon ${JSON.stringify(marker.icon)}: ${JSON.stringify(marker)}`);
    }
    const markerSize = 20 + description.length;
    const [x1, x2, x3] = coordinateToMinimapBytes(marker.x);
    const [y1, y2, y3] = coordinateToMinimapBytes(marker.y);
    const header = new Uint8Array([
      0x0A, markerSize - 2,
      0x0A, 0x0A,
      0x08, x1, x2, x3,
      0x10, y1, y2, y3,
      0x18, marker.z,
      0x10, iconByte,
      0x1A, description.length,
    ]);
    chunks.push(header, description, new Uint8Array([0x20, 0x00]));
  }
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) { result.set(chunk, pos); pos += chunk.length; }
  return result;
}

/** Load and parse a single marker file -- `.bin` or `.json`, by extension. */
export async function loadMarkersFile(file) {
  if (file.name.endsWith('.bin')) {
    return parseMarkersBin(await file.arrayBuffer(), { source: file.name });
  }
  return JSON.parse(await file.text());
}

/**
 * Union markers from multiple groups, keyed by (x, y, z). Later groups win
 * on conflicts -- pass sources in priority order, lowest priority first.
 */
export function mergeMarkers(...markerGroups) {
  const byCoordinate = new Map();
  for (const group of markerGroups) {
    for (const marker of group) {
      byCoordinate.set(`${marker.x},${marker.y},${marker.z}`, marker);
    }
  }
  return sortMarkers([...byCoordinate.values()]);
}
