import { mergeMarkers } from './markers.js';

const markerKey = (marker) => `${marker.x},${marker.y},${marker.z}`;
const sameContent = (a, b) => a.icon === b.icon && a.description === b.description;

/**
 * Apply a new marker list to an existing marker file.
 *
 * A shared coordinate is only a conflict when its label or icon differs.
 * `replace` makes the reviewed-list mark win; `keep` preserves the mark from
 * the loaded file. `conflictResolutions` can override that fallback for each
 * coordinate. Removal is coordinate-only and ignores all conflict choices.
 */
export function applyEditedMarks(base, reviewed, {
  mode = 'add',
  conflictPolicy = 'replace',
  conflictResolutions = null,
} = {}) {
  const existing = mergeMarkers(base);
  const incoming = mergeMarkers(reviewed);
  const incomingKeys = new Set(incoming.map(markerKey));

  if (mode === 'remove') {
    const result = existing.filter((marker) => !incomingKeys.has(markerKey(marker)));
    return {
      result,
      added: 0,
      identical: 0,
      conflicts: [],
      replaced: 0,
      kept: 0,
      removed: existing.length - result.length,
      total: result.length,
    };
  }

  if (!['replace', 'keep'].includes(conflictPolicy)) {
    throw new Error(`Unknown Edit Marks conflict policy: ${conflictPolicy}`);
  }

  const existingByKey = new Map(existing.map((marker) => [markerKey(marker), marker]));
  let added = 0;
  let identical = 0;
  const conflicts = [];

  for (const marker of incoming) {
    const current = existingByKey.get(markerKey(marker));
    if (!current) {
      added += 1;
    } else if (sameContent(current, marker)) {
      identical += 1;
    } else {
      const key = markerKey(marker);
      const explicitResolution = conflictResolutions instanceof Map
        ? conflictResolutions.get(key)
        : conflictResolutions?.[key];
      const resolution = explicitResolution ?? conflictPolicy;
      if (!['replace', 'keep'].includes(resolution)) {
        throw new Error(`Unknown Edit Marks conflict resolution at ${key}: ${resolution}`);
      }
      conflicts.push({ existing: current, incoming: marker, resolution });
    }
  }

  const resolutionByKey = new Map(conflicts.map((conflict) => [
    markerKey(conflict.incoming),
    conflict.resolution,
  ]));
  const acceptedIncoming = incoming.filter((marker) => (
    resolutionByKey.get(markerKey(marker)) !== 'keep'
  ));
  const result = mergeMarkers(existing, acceptedIncoming);
  const replaced = conflicts.filter((conflict) => conflict.resolution === 'replace').length;
  const kept = conflicts.length - replaced;

  return {
    result,
    added,
    identical,
    conflicts,
    replaced,
    kept,
    removed: 0,
    total: result.length,
  };
}
