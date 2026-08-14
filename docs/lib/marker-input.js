// Turning hand-typed text into markers, for Add Marks mode.
//
// Pure functions, with no DOM and no language baked in: problems come back as
// an i18n `{key, args}` pair for the caller to translate, the same way
// logs.js takes its `lang` explicitly. The markers produced here are ordinary
// {description, icon, x, y, z} objects -- exactly what parseMarkersBin
// returns and what writeMarkersBin accepts -- so they flow through the rest
// of the pipeline (merge, validate, serialize) unchanged.

import { ICONS_BY_NAME } from './constants.js';
import { DEFAULT_ICON } from './icons.js';
import { MAX_COORDINATE, MAX_DESCRIPTION_BYTES } from './markers.js';

const MAX_FLOOR = 15;
const COMMENT_LINE = /^(#|\/\/)/;
// `32250, 31385, 5` -- also accepts semicolons and tabs, and bare spaces for
// the plain three-number form (a label may itself contain spaces).
const SEPARATORS = /\s*[,;\t]\s*/;

/** Strict integer parse: returns null for blanks, decimals, or junk. */
export function toInteger(value) {
  const text = String(value ?? '').trim();
  return /^-?\d+$/.test(text) ? Number(text) : null;
}

export function descriptionBytes(description) {
  return new TextEncoder().encode(description ?? '').length;
}

/**
 * Field-level validation for a marker the user is typing. Returns null when
 * the marker is fine, or `{key, args}` naming the first problem found.
 *
 * The format-level guarantees still live in writeMarkersBin -- this only
 * exists so the UI can reject bad input *before* it reaches the encoder, with
 * a message that says which field is wrong.
 */
export function checkMarkerFields({ x, y, z, description }) {
  for (const [axis, value] of [['X', x], ['Y', y]]) {
    if (!Number.isInteger(value)) return { key: 'markerErrorNumber', args: [axis] };
    if (value < 0 || value > MAX_COORDINATE) return { key: 'markerErrorRange', args: [axis, MAX_COORDINATE] };
  }
  if (!Number.isInteger(z) || z < 0 || z > MAX_FLOOR) return { key: 'markerErrorFloor', args: [MAX_FLOOR] };
  const bytes = descriptionBytes(description);
  if (bytes > MAX_DESCRIPTION_BYTES) return { key: 'markerErrorLabel', args: [bytes, MAX_DESCRIPTION_BYTES] };
  return null;
}

/** Normalize a user-supplied icon name, or null if it isn't a real icon. */
export function resolveIcon(name) {
  const key = String(name ?? '').trim().toLowerCase();
  return ICONS_BY_NAME.has(key) ? key : null;
}

/**
 * Parse the coordinate field -- one marker per line. A single line is just
 * a batch of one, which is why the UI needs no separate "add one" form:
 *
 *     32250, 31385, 5
 *     31938, 31652, 10, Rope spot
 *     32057, 32792, 13, Boss room, skull
 *
 * The 4th value is a label and a trailing recognized icon name is the icon;
 * both fall back to `defaultLabel` / `defaultIcon` when omitted, so a batch
 * can be pasted, labelled and iconned in one go. Blank lines and lines
 * starting with `#` or `//` are ignored.
 *
 * A bad line is collected in `errors` rather than aborting the batch -- the
 * same "skip with a warning" behaviour the merge pipeline uses for files it
 * can't read.
 *
 * @returns {{markers: Array, errors: Array<{line: number, text: string, key: string, args: Array}>}}
 */
export function parseMarkerLines(text, { defaultLabel = '', defaultIcon = DEFAULT_ICON } = {}) {
  const fallbackIcon = resolveIcon(defaultIcon) ?? DEFAULT_ICON;
  const markers = [];
  const errors = [];

  String(text ?? '').split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || COMMENT_LINE.test(line)) return;
    const number = index + 1;
    const fail = (key, ...args) => errors.push({ line: number, text: line, key, args });

    let parts = line.split(SEPARATORS);
    if (parts.length === 1) parts = line.split(/\s+/);
    while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
    if (parts.length < 3) {
      fail('markerErrorFields');
      return;
    }

    let icon = fallbackIcon;
    if (parts.length >= 4) {
      const trailing = resolveIcon(parts[parts.length - 1]);
      if (trailing) {
        icon = trailing;
        parts = parts.slice(0, -1);
      }
    }

    const description = parts.length > 3 ? parts.slice(3).join(', ') : defaultLabel;
    const marker = {
      description,
      icon,
      x: toInteger(parts[0]),
      y: toInteger(parts[1]),
      z: toInteger(parts[2]),
    };
    const problem = checkMarkerFields(marker);
    if (problem) {
      fail(problem.key, ...(problem.args ?? []));
      return;
    }
    markers.push(marker);
  });

  return { markers, errors };
}
