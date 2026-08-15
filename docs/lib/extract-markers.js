// Recover personal markers from a file that may also contain published
// community markers and ready-made marker sets.
//
// Exact content is the ownership boundary. A marker copied unchanged from a
// selected reference source is published data; a marker at the same coordinate
// with a different label or icon is a personal override and must survive.

const coordinateKey = (marker) => `${marker.x},${marker.y},${marker.z}`;
const contentKey = (marker) => JSON.stringify([
  marker.x,
  marker.y,
  marker.z,
  marker.description,
  marker.icon,
]);

/**
 * Subtract exact reference markers from `uploaded`, preserving source order.
 *
 * @returns {{result: Array, exactMatches: number, overrides: number,
 *   unique: number, total: number}}
 */
export function extractOwnMarkers(uploaded, references) {
  const referenceContent = new Set(references.map(contentKey));
  const referenceCoordinates = new Set(references.map(coordinateKey));
  const result = [];
  let exactMatches = 0;
  let overrides = 0;
  let unique = 0;

  for (const marker of uploaded) {
    if (referenceContent.has(contentKey(marker))) {
      exactMatches += 1;
      continue;
    }
    if (referenceCoordinates.has(coordinateKey(marker))) {
      overrides += 1;
    } else {
      unique += 1;
    }
    result.push(marker);
  }

  return { result, exactMatches, overrides, unique, total: result.length };
}
