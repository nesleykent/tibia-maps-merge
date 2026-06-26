"""Color, byte, and icon lookup tables for the Tibia minimap binary format.

See https://tibiamaps.io/guides/map-file-format and
https://tibiamaps.io/guides/minimap-file-format for the underlying spec.
"""

TILE_SIZE = 256

MAP_COLOR_BY_BYTE = {
    0x00: (0, 0, 0),        # black (empty / unexplored)
    0x0C: (0, 102, 0),      # dark green (tree)
    0x18: (0, 204, 0),      # green (grass)
    0x33: (51, 102, 153),   # light blue (water)
    0x56: (102, 102, 102),  # dark gray (rock/mountain)
    0x72: (153, 51, 0),     # dark brown (earth/stalagmite)
    0x79: (153, 102, 51),   # brown (earth)
    0x81: (153, 153, 153),  # gray (stone tile/cobbled pavement)
    0x8C: (153, 255, 102),  # light green (light spot in grassy area)
    0xB3: (204, 255, 255),  # light blue (ice)
    0xBA: (255, 51, 0),     # red (wall)
    0xC0: (255, 102, 0),    # orange (lava)
    0xCF: (255, 204, 153),  # beige (sand)
    0xD2: (255, 255, 0),    # yellow (ladder/stairs/hole/...)
    0xD7: (255, 255, 255),  # white (snow)
}
BYTE_BY_MAP_COLOR = {color: byte for byte, color in MAP_COLOR_BY_BYTE.items()}

UNEXPLORED_MAP_BYTE = 0x00
UNEXPLORED_MAP_COLOR = MAP_COLOR_BY_BYTE[UNEXPLORED_MAP_BYTE]

# Pink denotes "unexplored" in pathfinding-cost tiles; yellow denotes
# "non-walkable". Everything else is a grayscale walking-cost value (r=g=b).
UNEXPLORED_PATH_COLOR = (255, 0, 255)
UNEXPLORED_PATH_BYTE = 0xFE
NON_WALKABLE_PATH_COLOR = (255, 255, 0)

ICONS_BY_ID = {
    0x00: 'checkmark',
    0x01: '?',
    0x02: '!',
    0x03: 'star',
    0x04: 'crossmark',
    0x05: 'cross',
    0x06: 'mouth',
    0x07: 'spear',
    0x08: 'sword',
    0x09: 'flag',
    0x0A: 'lock',
    0x0B: 'bag',
    0x0C: 'skull',
    0x0D: '$',
    0x0E: 'red up',
    0x0F: 'red down',
    0x10: 'red right',
    0x11: 'red left',
    0x12: 'up',
    0x13: 'down',
}
ICONS_BY_NAME = {name: byte for byte, name in ICONS_BY_ID.items()}
