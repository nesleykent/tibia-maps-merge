"""Parsing, writing, sorting, and merging of Tibia minimap markers."""
from __future__ import annotations

import json
from pathlib import Path

from .constants import ICONS_BY_ID, ICONS_BY_NAME


def _minimap_bytes_to_coordinate(x1: int, x2: int, x3: int) -> int:
    # https://tibiamaps.io/guides/minimap-file-format#coordinates
    return x1 + 0x80 * x2 + 0x4000 * x3 - 0x4080


def _coordinate_to_minimap_bytes(x: int) -> tuple[int, int, int]:
    x3 = x >> 14
    x1 = 0x80 + x % 0x80
    x2 = (x - 0x4000 * x3 - x1 + 0x4080) >> 7
    return x1, x2, x3


def sort_markers(markers: list[dict]) -> list[dict]:
    """Sort top-to-bottom, left-to-right, floor by floor."""
    markers.sort(key=lambda m: m['z'] * 10**10 + m['x'] * 10**5 + m['y'])
    return markers


def parse_markers_bin(data: bytes, *, source: str | None = None) -> list[dict]:
    """Parse the contents of a `minimapmarkers.bin` file into marker dicts."""
    label = source or '<buffer>'
    markers = []
    index = 0
    length = len(data)
    while index < length:
        if data[index] != 0x0A:
            raise ValueError(f'{label}: expected marker start at byte {index}')
        index += 1
        index += 1  # marker size byte -- not needed, we resync on 0x0A instead
        if data[index] != 0x0A:
            raise ValueError(f'{label}: expected coordinate block at byte {index}')
        index += 1
        coordinate_size = data[index]
        index += 1
        if coordinate_size != 0x0A:
            raise ValueError(f'{label}: unsupported coordinate size {coordinate_size:#x}')
        index += 1  # 0x08
        x = _minimap_bytes_to_coordinate(data[index], data[index + 1], data[index + 2])
        index += 3
        index += 1  # 0x10
        y = _minimap_bytes_to_coordinate(data[index], data[index + 1], data[index + 2])
        index += 3
        index += 1  # 0x18
        z = data[index]
        index += 1
        index += 1  # 0x10
        icon = ICONS_BY_ID.get(data[index])
        index += 1
        index += 1  # 0x1A
        description_length = data[index]
        index += 1
        description = data[index:index + description_length].decode('utf-8', errors='replace')
        index += description_length
        # The client occasionally produces malformed trailing bytes instead of
        # the usual 0x20 0x00 terminator; resync on the next marker instead of
        # assuming a fixed terminator.
        # https://github.com/tibiamaps/tibia-maps-script/issues/21
        while index < length and data[index] != 0x0A:
            index += 1
        markers.append({
            'description': description,
            'icon': icon,
            'x': x,
            'y': y,
            'z': z,
        })

    sort_markers(markers)

    seen = set()
    unique = []
    for marker in markers:
        key = json.dumps(marker, sort_keys=True).lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(marker)
    return unique


def write_markers_bin(markers: list[dict]) -> bytes:
    """Serialize marker dicts back into the Tibia client's binary format."""
    out = bytearray()
    for marker in sort_markers(list(markers)):
        description = (marker.get('description') or '').encode('utf-8')
        if len(description) > 100:
            raise ValueError(f'marker description too long ({len(description)} bytes): {marker!r}')
        icon_byte = ICONS_BY_NAME.get(marker.get('icon'))
        if icon_byte is None:
            raise ValueError(f'unknown marker icon {marker.get("icon")!r}: {marker!r}')
        marker_size = 20 + len(description)
        x1, x2, x3 = _coordinate_to_minimap_bytes(marker['x'])
        y1, y2, y3 = _coordinate_to_minimap_bytes(marker['y'])
        out += bytes([
            0x0A, marker_size - 2,
            0x0A, 0x0A,
            0x08, x1, x2, x3,
            0x10, y1, y2, y3,
            0x18, marker['z'],
            0x10, icon_byte,
            0x1A, len(description),
        ])
        out += description
        out += bytes([0x20, 0x00])
    return bytes(out)


def load_markers_json(path: Path) -> list[dict]:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_markers_json(path: Path, markers: list[dict]) -> None:
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(markers, f, indent=4)
        f.write('\n')


def merge_markers(*marker_groups: list[dict]) -> list[dict]:
    """Union markers from multiple groups, keyed by (x, y, z). Later groups
    win on conflicts -- pass sources in priority order, lowest priority first."""
    by_coordinate: dict[tuple[int, int, int], dict] = {}
    for group in marker_groups:
        for marker in group:
            key = (marker['x'], marker['y'], marker['z'])
            by_coordinate[key] = marker
    return sort_markers(list(by_coordinate.values()))
