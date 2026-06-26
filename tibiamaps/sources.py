"""Abstractions over the two directory shapes this tool reads from:

- `RawMinimapSource`: a Tibia client `minimap` export -- 256x256 tiles named
  `Minimap_Color_<x>_<y>_<z>.png` / `Minimap_WaypointCost_<x>_<y>_<z>.png`,
  plus an optional `minimapmarkers.bin`.
- `ConvertedDataSource`: a previously converted `data` directory --
  `floor-NN-map.png` / `floor-NN-path.png` / `bounds.json` / `markers.json`.

Both expose the same interface so `merge.py` can combine any mix of the two.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from PIL import Image

from . import bounds as bounds_mod
from .constants import UNEXPLORED_MAP_COLOR, UNEXPLORED_PATH_COLOR
from .markers import load_markers_json, parse_markers_bin

_TILE_RE = re.compile(r'^Minimap_(Color|WaypointCost)_(-?\d+)_(-?\d+)_(\d+)\.png$')


class RawMinimapSource:
    def __init__(self, directory: Path, *, markers_bin: Path | None = None):
        self.directory = Path(directory)
        self.color_tiles: dict[tuple[int, int, int], Path] = {}
        self.path_tiles: dict[tuple[int, int, int], Path] = {}
        self._markers_bin = markers_bin
        self._bounds: dict | None = None
        self._scan()

    def _scan(self) -> None:
        for file in self.directory.glob('*.png'):
            match = _TILE_RE.match(file.name)
            if not match:
                continue
            kind, x, y, z = match.groups()
            key = (int(x), int(y), int(z))
            if kind == 'Color':
                self.color_tiles[key] = file
            else:
                self.path_tiles[key] = file
        if self._markers_bin is None:
            default = self.directory / 'minimapmarkers.bin'
            if default.exists():
                self._markers_bin = default

    @property
    def bounds(self) -> dict:
        if self._bounds is None:
            coords = set(self.color_tiles) | set(self.path_tiles)
            self._bounds = bounds_mod.bounds_from_xyz(coords)
        return self._bounds

    def floor_map_image(self, z: int) -> Image.Image | None:
        b = self.bounds
        if bounds_mod.floor_id(z) not in b['floorIDs']:
            return None
        canvas = Image.new('RGB', (b['width'], b['height']), UNEXPLORED_MAP_COLOR)
        for (x, y, tile_z), path in self.color_tiles.items():
            if tile_z != z:
                continue
            tile = Image.open(path).convert('RGB')
            canvas.paste(tile, (x - b['xMin'], y - b['yMin']))
        return canvas

    def floor_path_image(self, z: int) -> Image.Image | None:
        b = self.bounds
        if bounds_mod.floor_id(z) not in b['floorIDs']:
            return None
        canvas = Image.new('RGB', (b['width'], b['height']), UNEXPLORED_PATH_COLOR)
        for (x, y, tile_z), path in self.path_tiles.items():
            if tile_z != z:
                continue
            tile = Image.open(path).convert('RGB')
            canvas.paste(tile, (x - b['xMin'], y - b['yMin']))
        return canvas

    def markers(self) -> list[dict]:
        if not self._markers_bin or not self._markers_bin.exists():
            return []
        data = self._markers_bin.read_bytes()
        try:
            return parse_markers_bin(data, source=str(self._markers_bin))
        except ValueError as error:
            print(f'Warning: could not parse {self._markers_bin} -- {error}', file=sys.stderr)
            return []


class ConvertedDataSource:
    def __init__(self, directory: Path):
        self.directory = Path(directory)
        self._bounds = bounds_mod.load_bounds(self.directory / 'bounds.json')

    @property
    def bounds(self) -> dict:
        return self._bounds

    def floor_map_image(self, z: int) -> Image.Image | None:
        fid = bounds_mod.floor_id(z)
        if fid not in self._bounds['floorIDs']:
            return None
        path = self.directory / f'floor-{fid}-map.png'
        if not path.exists():
            return None
        return Image.open(path).convert('RGB')

    def floor_path_image(self, z: int) -> Image.Image | None:
        fid = bounds_mod.floor_id(z)
        if fid not in self._bounds['floorIDs']:
            return None
        path = self.directory / f'floor-{fid}-path.png'
        if not path.exists():
            return None
        return Image.open(path).convert('RGB')

    def markers(self) -> list[dict]:
        path = self.directory / 'markers.json'
        if not path.exists():
            return []
        return load_markers_json(path)


def open_source(path: Path):
    path = Path(path)
    if (path / 'bounds.json').exists():
        return ConvertedDataSource(path)
    return RawMinimapSource(path)
