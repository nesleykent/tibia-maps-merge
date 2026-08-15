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
//
// A collection is a fixed, published list, so this mode is a picker and a
// preview. Marks you assemble yourself -- typed in, or pulled out of a quest
// article -- go through Edit Marks instead, where they can be edited row by
// row before being applied.

import { mergeMarkers } from './markers.js';

const SOURCE = 'https://raw.githubusercontent.com/tibiamaps/tibia-map-data/main/extra';

/** Where each set comes from, in the order the picker lists them. */
export const MARKER_SETS = [
  { id: 'achievements', name: 'Achievements' },
  { id: 'rapid-respawn', name: 'Rapid Respawn' },
  { id: 'points-of-interest', name: 'Points of Interest (PoI)', large: true, mostlyUnlabelled: true },
  { id: 'anniversary', name: 'Anniversary' },
  { id: 'lightbearer', name: 'Lightbearer' },
  { id: 'orcsoberfest-island', name: 'Orcsoberfest Island' },
  { id: 'percht-island', name: 'Percht Island' },
  { id: 'devovorga', name: 'Devovorga' },
  { id: 'ignore', name: 'Ignore' },
];

export const setSourceUrl = (id) => `${SOURCE}/${id}/markers.json`;

// ---------- when each collection was last touched ----------
// These are published data, not a live feed: one has not changed since 2020,
// another changed last week. Which is worth knowing before you take one, so
// each card carries the date of the last commit to its markers.json.
//
// raw.githubusercontent.com sends no Last-Modified, so the date has to come
// from the API. That is rate-limited to 60 requests an hour per IP without a
// token, and there is no one request that answers for all nine -- so the
// answers are cached for half a day, and a failure is silent: a card without
// a date is worse than no cards at all.
const COMMITS_API = 'https://api.github.com/repos/tibiamaps/tibia-map-data/commits';
const DATE_CACHE_KEY = 'tibia-maps-merge.set-dates.v1';
const DATE_CACHE_MS = 12 * 60 * 60 * 1000;

const readDateCache = (storage, now) => {
  try {
    const cached = JSON.parse(storage.getItem(DATE_CACHE_KEY) ?? 'null');
    if (!cached || typeof cached.dates !== 'object') return null;
    return { dates: cached.dates, fresh: now - cached.at < DATE_CACHE_MS };
  } catch {
    return null;
  }
};

async function fetchOneDate(id, fetchImpl) {
  const url = `${COMMITS_API}?path=extra/${id}/markers.json&per_page=1`;
  const response = await fetchImpl(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error('unreachable');
  const commits = await response.json();
  const date = commits?.[0]?.commit?.committer?.date;
  if (typeof date !== 'string') throw new Error('unreachable');
  return date.slice(0, 10);
}

/**
 * `{id: 'YYYY-MM-DD'}` for every set whose date could be established. Sets
 * that failed are simply absent -- callers show what they got.
 */
export async function fetchSetDates({
  fetchImpl = fetch, storage = localStorage, now = Date.now(),
} = {}) {
  const cached = readDateCache(storage, now);
  if (cached?.fresh) return cached.dates;

  const settled = await Promise.all(MARKER_SETS.map(
    ({ id }) => fetchOneDate(id, fetchImpl).then((date) => [id, date], () => null),
  ));
  const dates = Object.fromEntries(settled.filter(Boolean));

  // Rate-limited or offline: a cache past its half-day is still far better
  // than blank cards, since these dates move at most a few times a year.
  if (Object.keys(dates).length === 0) return cached?.dates ?? {};

  try {
    storage.setItem(DATE_CACHE_KEY, JSON.stringify({ at: now, dates }));
  } catch {
    // Private browsing or a full quota just means fetching again next time.
  }
  return dates;
}

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
