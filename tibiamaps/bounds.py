"""Computing and persisting the `bounds.json` metadata for a data directory."""
from __future__ import annotations

import json
from pathlib import Path

from .constants import TILE_SIZE


def floor_id(z: int) -> str:
    return str(z).zfill(2)


def bounds_from_xyz(coords) -> dict:
    coords = list(coords)
    if not coords:
        raise ValueError('cannot compute bounds from an empty set of coordinates')
    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]
    zs = [c[2] for c in coords]
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    z_min, z_max = min(zs), max(zs)
    floor_ids = sorted({floor_id(z) for z in zs})
    return {
        'xMin': x_min, 'xMax': x_max,
        'yMin': y_min, 'yMax': y_max,
        'zMin': z_min, 'zMax': z_max,
        'width': TILE_SIZE + x_max - x_min,
        'height': TILE_SIZE + y_max - y_min,
        'floorIDs': floor_ids,
    }


def union_bounds(bounds_list: list[dict]) -> dict:
    bounds_list = [b for b in bounds_list if b]
    if not bounds_list:
        raise ValueError('cannot union an empty list of bounds')
    x_min = min(b['xMin'] for b in bounds_list)
    x_max = max(b['xMax'] for b in bounds_list)
    y_min = min(b['yMin'] for b in bounds_list)
    y_max = max(b['yMax'] for b in bounds_list)
    z_min = min(b['zMin'] for b in bounds_list)
    z_max = max(b['zMax'] for b in bounds_list)
    floor_ids = sorted({fid for b in bounds_list for fid in b['floorIDs']})
    return {
        'xMin': x_min, 'xMax': x_max,
        'yMin': y_min, 'yMax': y_max,
        'zMin': z_min, 'zMax': z_max,
        'width': TILE_SIZE + x_max - x_min,
        'height': TILE_SIZE + y_max - y_min,
        'floorIDs': floor_ids,
    }


def load_bounds(path: Path) -> dict:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_bounds(path: Path, bounds: dict) -> None:
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(bounds, f, indent=4)
        f.write('\n')
