// Presentation layer for the marker icon picker.
//
// The icon list itself is *derived* from ICONS_BY_ID -- the exact same table
// the parser and the encoder use -- so the picker can never offer an icon the
// binary format doesn't have, and the numeric type byte written to
// `minimapmarkers.bin` always comes from that table rather than from anything
// here.
//
// The artwork is the Tibia client's own minimap symbols, taken from the sheet
// the TibiaWiki Mapper uses (`assets/minimap-symbols.png`, 121x22: eleven
// 11x11 symbols per row, two rows). Its slot order is NOT the format's byte
// order -- the sheet groups the marks the way the Mapper's own picker lays
// them out, so the four red arrows sit at slots 7, 8, 18 and 19 and the two
// green ones at 9 and 20, interleaved with everything else. Slot 10 is a
// numbered badge and slot 21 is empty; neither exists in the file format.
// The mapping below was read off the sheet and confirmed by sampling each
// slot's glyph colours.

import { ICONS_BY_ID } from './constants.js';

const SPRITE_COLUMNS = 11;

/** Icon name -> slot in the sprite sheet, read left-to-right, top-to-bottom. */
const SPRITE_SLOT = new Map([
  ['checkmark', 0],
  ['?', 1],
  ['!', 2],
  ['star', 3],
  ['crossmark', 4],
  ['cross', 5],
  ['mouth', 6],
  ['red up', 7],
  ['red right', 8],
  ['up', 9],
  ['spear', 11],
  ['sword', 12],
  ['flag', 13],
  ['lock', 14],
  ['bag', 15],
  ['skull', 16],
  ['$', 17],
  ['red down', 18],
  ['red left', 19],
  ['down', 20],
]);

/** Every marker type the format supports, in `minimapmarkers.bin` id order. */
export const MARKER_ICONS = [...ICONS_BY_ID].map(([id, name]) => ({ id, name }));

/** The icon used when nothing has been picked yet (id 0x00). */
export const DEFAULT_ICON = MARKER_ICONS[0].name;

/**
 * Markup for a marker icon: a span positioned over the shared sprite sheet.
 * Decorative -- the accessible name always comes from the text next to it.
 * Returns an empty string for an unknown name, so a marker carrying an icon
 * this build doesn't know about still renders its text.
 */
export function iconGlyph(name, { size = 22 } = {}) {
  const slot = SPRITE_SLOT.get(name);
  if (slot === undefined) return '';
  const column = slot % SPRITE_COLUMNS;
  const row = Math.floor(slot / SPRITE_COLUMNS);
  return `<span class="marker-icon" aria-hidden="true" `
    + `style="--icon-size:${size}px;--icon-col:${column};--icon-row:${row}"></span>`;
}
