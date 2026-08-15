// Curated marker collections, and the add/remove arithmetic behind Marker Sets.
//
// tibiamaps.io publishes several ready-made sets alongside its map data --
// achievement locations, rapid-respawn spots, event markers and so on -- as
// plain marker JSON in the same {description, icon, x, y, z} shape this
// project already speaks. They are read straight from the repository, which
// serves them with CORS headers, so no proxy and no server of ours is needed.
//
// Nothing here is fetched until a set is actually chosen: one of them is over
// 5,000 markers, which is not worth downloading to draw a list.
//
// Every folder published under extra/ has a markers.json, including the two
// island folders that also carry minimap tiles -- only the markers are read
// here; this project does not write map images.

import { mergeMarkers } from './markers.js';

const SOURCE = 'https://raw.githubusercontent.com/tibiamaps/tibia-map-data/main/extra';

/** Where each set comes from, in the order the picker lists them. */
export const MARKER_SETS = [
  { id: 'achievements', name: 'Achievements' },
  { id: 'rapid-respawn', name: 'Rapid respawn' },
  { id: 'points-of-interest', name: 'Points of interest', large: true, mostlyUnlabelled: true },
  { id: 'anniversary', name: 'Anniversary' },
  { id: 'lightbearer', name: 'Lightbearer' },
  { id: 'orcsoberfest-island', name: 'Orcsoberfest island' },
  { id: 'percht-island', name: 'Percht island' },
  { id: 'devovorga', name: 'Devovorga' },
  { id: 'ignore', name: 'Ignore' },
];

export const setSourceUrl = (id) => `${SOURCE}/${id}/markers.json`;

const coordinateKey = (m) => `${m.x},${m.y},${m.z}`;

/**
 * Fetch one published set. Throws 'unreachable' so the caller can show the
 * same wording it uses for any other failed download.
 */
export async function fetchMarkerSet(id, { fetchImpl = fetch } = {}) {
  let response;
  try {
    response = await fetchImpl(setSourceUrl(id));
  } catch {
    throw new Error('unreachable');
  }
  if (!response.ok) throw new Error('unreachable');
  let markers;
  try {
    markers = await response.json();
  } catch {
    throw new Error('unreachable');
  }
  if (!Array.isArray(markers)) throw new Error('unreachable');
  return markers;
}

/**
 * Work out what applying `set` to `base` would do, without doing it.
 *
 * Adding follows the same rule the rest of the app uses: markers are keyed by
 * coordinate and *yours* win, so a set fills the gaps in your file rather than
 * overwriting marks you placed yourself. Removing drops every coordinate the
 * set covers.
 *
 * @returns {{result: Array, added: number, kept: number, removed: number, total: number}}
 */
export function applyMarkerSet(base, set, mode) {
  const baseKeys = new Set(base.map(coordinateKey));
  const setKeys = new Set(set.map(coordinateKey));

  if (mode === 'remove') {
    const result = base.filter((m) => !setKeys.has(coordinateKey(m)));
    return { result, added: 0, kept: 0, removed: base.length - result.length, total: result.length };
  }

  // `base` last, so an existing marker keeps its own label and icon.
  const result = mergeMarkers(set, base);
  const kept = [...setKeys].filter((k) => baseKeys.has(k)).length;
  return { result, added: setKeys.size - kept, kept, removed: 0, total: result.length };
}
