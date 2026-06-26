// See https://tibiamaps.io/guides/minimap-file-format for the underlying spec.

export const ICONS_BY_ID = new Map([
  [0x00, 'checkmark'],
  [0x01, '?'],
  [0x02, '!'],
  [0x03, 'star'],
  [0x04, 'crossmark'],
  [0x05, 'cross'],
  [0x06, 'mouth'],
  [0x07, 'spear'],
  [0x08, 'sword'],
  [0x09, 'flag'],
  [0x0A, 'lock'],
  [0x0B, 'bag'],
  [0x0C, 'skull'],
  [0x0D, '$'],
  [0x0E, 'red up'],
  [0x0F, 'red down'],
  [0x10, 'red right'],
  [0x11, 'red left'],
  [0x12, 'up'],
  [0x13, 'down'],
]);

export const ICONS_BY_NAME = new Map([...ICONS_BY_ID].map(([id, name]) => [name, id]));
