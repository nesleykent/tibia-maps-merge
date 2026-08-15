import { mergeMarkers } from './markers.js';

const markerKey = (marker) => `${marker.x},${marker.y},${marker.z}`;
const sameContent = (a, b) => a.icon === b.icon && a.description === b.description;

/**
 * Apply a reviewed marker list to an existing marker file.
 *
 * A shared coordinate is only a conflict when its label or icon differs.
 * `replace` makes the reviewed-list mark win; `keep` preserves the mark from
 * the loaded file. Removal is coordinate-only and ignores the conflict policy.
 */
export function applyEditedMarks(base, reviewed, {
  mode = 'add',
  conflictPolicy = 'replace',
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
      conflicts.push({ existing: current, incoming: marker });
    }
  }

  const replacing = conflictPolicy === 'replace';
  const result = replacing
    ? mergeMarkers(existing, incoming)
    : mergeMarkers(incoming, existing);

  return {
    result,
    added,
    identical,
    conflicts,
    replaced: replacing ? conflicts.length : 0,
    kept: replacing ? 0 : conflicts.length,
    removed: 0,
    total: result.length,
  };
}
