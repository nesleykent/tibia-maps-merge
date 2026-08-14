// Presentation layer for the marker icon picker.
//
// The icon list itself is *derived* from ICONS_BY_ID -- the exact same table
// the parser and the encoder use -- so the picker can never offer an icon the
// binary format doesn't have, and the numeric type byte written to
// `minimapmarkers.bin` always comes from that table rather than from anything
// here. Everything in this file is purely visual: a small inline SVG drawn to
// match the icon each id actually renders as in the Tibia client, per the
// descriptions documented next to the ids upstream
// (https://github.com/tibiamaps/tibia-maps-script/blob/main/src/icons.mjs).

import { ICONS_BY_ID } from './constants.js';

/** Every marker type the format supports, in `minimapmarkers.bin` id order. */
export const MARKER_ICONS = [...ICONS_BY_ID].map(([id, name]) => ({ id, name }));

/** The icon used when nothing has been picked yet (id 0x00). */
export const DEFAULT_ICON = MARKER_ICONS[0].name;

const GREEN = '#2e9e3e';
const BLUE = '#2b6cd4';
const RED = '#e8322b';
const DARK_RED = '#8f1c1c';
const ORANGE = '#f0932b';
const LIPS = '#d6396b';
const LIPS_DARK = '#8d1f42';
const STEEL = '#b6c0cb';
const STEEL_DARK = '#6f7c8a';
const WOOD = '#8b5a2b';
const WOOD_DARK = '#5e3d1c';
const GOLD = '#e0a92b';
const GOLD_DARK = '#8a6410';
const BONE = '#ece9e0';
const BONE_DARK = '#3d3a34';

const TEXT = 'font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700" text-anchor="middle"';
const arrow = (d, color) => `<path d="${d}" fill="${color}"/>`;
const ARROW_UP = 'M8 1.6l5.4 6.2H10.3v6.6H5.7V7.8H2.6z';
const ARROW_DOWN = 'M8 14.4L2.6 8.2h3.1V1.6h4.6v6.6h3.1z';
const ARROW_RIGHT = 'M14.4 8l-6.2 5.4v-3.1H1.6V5.7h6.6V2.6z';
const ARROW_LEFT = 'M1.6 8l6.2-5.4v3.1h6.6v4.6H7.8v3.1z';

// Keyed by the canonical icon name from ICONS_BY_ID.
const GLYPHS = new Map([
  ['checkmark', `<path d="M2.6 8.4l3.4 3.4 7.4-7.9" fill="none" stroke="${GREEN}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`],
  ['?', `<text x="8" y="13.2" ${TEXT} fill="${BLUE}">?</text>`],
  ['!', `<text x="8" y="13.2" ${TEXT} fill="${RED}">!</text>`],
  ['star', `<path d="M8 1.4l1.9 4 4.4.6-3.2 3 .8 4.4L8 11.3l-3.9 2.1.8-4.4-3.2-3 4.4-.6z" fill="${ORANGE}"/>`],
  ['crossmark', `<path d="M3.6 3.6l8.8 8.8M12.4 3.6l-8.8 8.8" fill="none" stroke="${RED}" stroke-width="2.6" stroke-linecap="round"/>`],
  ['cross', `<path d="M6.5 1.4h3v3.7h3.7v3H9.5v6.5h-3V8.1H2.8v-3h3.7z" fill="${DARK_RED}"/>`],
  ['mouth', `<path d="M1.8 8c2-2.7 4-4 6.2-4s4.2 1.3 6.2 4c-2 2.7-4 4-6.2 4S3.8 10.7 1.8 8z" fill="${LIPS}"/><path d="M1.8 8h12.4" fill="none" stroke="${LIPS_DARK}" stroke-width="1.2" stroke-linecap="round"/>`],
  ['spear', `<path d="M3 13l8.2-8.2" fill="none" stroke="${WOOD}" stroke-width="1.8" stroke-linecap="round"/><path d="M14.4 1.6l-1.1 4.3-3.2-3.2z" fill="${STEEL}"/><path d="M9.4 5.4l1.2 1.2" fill="none" stroke="${STEEL_DARK}" stroke-width="1.4" stroke-linecap="round"/>`],
  ['sword', `<path d="M8 1.2l1.7 2.6v6.1H6.3V3.8z" fill="${STEEL}"/><rect x="3.6" y="9.9" width="8.8" height="1.8" rx=".9" fill="${GOLD}"/><rect x="7.1" y="11.7" width="1.8" height="3.1" rx=".9" fill="${WOOD_DARK}"/>`],
  ['flag', `<rect x="2.8" y="1.4" width="1.6" height="13.2" rx=".8" fill="${STEEL_DARK}"/><path d="M4.4 2.2h8.8l-2.1 3.1 2.1 3.1H4.4z" fill="${BLUE}"/>`],
  ['lock', `<path d="M5 7.2V5.4a3 3 0 016 0v1.8" fill="none" stroke="${GOLD}" stroke-width="1.8"/><rect x="3.2" y="7.2" width="9.6" height="7.2" rx="1.4" fill="${GOLD}"/><circle cx="8" cy="10.4" r="1.2" fill="${GOLD_DARK}"/>`],
  ['bag', `<path d="M3.8 5.6h8.4l1 8.8H2.8z" fill="${WOOD}"/><path d="M5.9 5.6V4.4a2.1 2.1 0 014.2 0v1.2" fill="none" stroke="${WOOD_DARK}" stroke-width="1.4"/>`],
  ['skull', `<path d="M8 1.4c3.3 0 5.6 2.3 5.6 5.4 0 1.9-.9 3.3-2.1 4.1v1.9c0 .9-.6 1.5-1.5 1.5H6c-.9 0-1.5-.6-1.5-1.5v-1.9c-1.2-.8-2.1-2.2-2.1-4.1 0-3.1 2.3-5.4 5.6-5.4z" fill="${BONE}"/><circle cx="5.8" cy="7" r="1.6" fill="${BONE_DARK}"/><circle cx="10.2" cy="7" r="1.6" fill="${BONE_DARK}"/><path d="M7.1 10.2h1.8v1.9H7.1z" fill="${BONE_DARK}"/>`],
  ['$', `<text x="8" y="13.4" ${TEXT} fill="${GREEN}">$</text>`],
  ['red up', arrow(ARROW_UP, RED)],
  ['red down', arrow(ARROW_DOWN, RED)],
  ['red right', arrow(ARROW_RIGHT, RED)],
  ['red left', arrow(ARROW_LEFT, RED)],
  ['up', arrow(ARROW_UP, GREEN)],
  ['down', arrow(ARROW_DOWN, GREEN)],
]);

/**
 * Inline `<svg>` markup for a marker icon, as a decorative glyph (the
 * accessible name always comes from the text next to it). Returns an empty
 * string for an unknown name, so a marker with an icon this build doesn't
 * know about still renders its text.
 */
export function iconSvg(name, { size = 16 } = {}) {
  const glyph = GLYPHS.get(name);
  if (!glyph) return '';
  return `<svg class="marker-icon" viewBox="0 0 16 16" width="${size}" height="${size}" `
    + `role="img" aria-hidden="true" focusable="false">${glyph}</svg>`;
}
