"""Merge two or more sources (raw minimap exports and/or data directories)
into a single combined data directory."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops

from . import bounds as bounds_mod
from .constants import UNEXPLORED_MAP_COLOR, UNEXPLORED_PATH_COLOR
from .markers import merge_markers, save_markers_json
from .sources import open_source


def _explored_mask(image: Image.Image, unexplored_rgb: tuple[int, int, int]) -> Image.Image:
    """255 where `image` differs from the unexplored background color, else 0."""
    background = Image.new('RGB', image.size, unexplored_rgb)
    diff = ImageChops.difference(image, background)
    dr, dg, db = diff.split()
    combined = ImageChops.lighter(ImageChops.lighter(dr, dg), db)
    return combined.point(lambda p: 255 if p else 0)


def merge_sources(
    paths: list[Path],
    output_dir: Path,
    *,
    include_markers: bool = True,
    include_maps: bool = True,
    floors: set[int] | None = None,
    log=print,
) -> dict:
    """Merge `paths` in order -- later sources win where explored tiles
    overlap; everywhere else, exploration from every source is unioned."""
    if len(paths) < 2:
        raise ValueError('need at least two sources to merge')

    sources = [(str(p), open_source(p)) for p in paths]
    union = bounds_mod.union_bounds([source.bounds for _, source in sources])

    floor_ids = union['floorIDs']
    if floors is not None:
        floor_ids = [fid for fid in floor_ids if int(fid) in floors]

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    stats = {'floors': {}, 'marker_count': 0}

    if include_maps:
        for fid in floor_ids:
            z = int(fid)
            log(f'Merging floor {fid}...')
            map_canvas = Image.new('RGB', (union['width'], union['height']), UNEXPLORED_MAP_COLOR)
            path_canvas = Image.new('RGB', (union['width'], union['height']), UNEXPLORED_PATH_COLOR)
            contributors = 0
            for label, source in sources:
                offset = (
                    source.bounds['xMin'] - union['xMin'],
                    source.bounds['yMin'] - union['yMin'],
                )
                map_image = source.floor_map_image(z)
                if map_image is not None:
                    mask = _explored_mask(map_image, UNEXPLORED_MAP_COLOR)
                    map_canvas.paste(map_image, offset, mask)
                    contributors += 1
                path_image = source.floor_path_image(z)
                if path_image is not None:
                    mask = _explored_mask(path_image, UNEXPLORED_PATH_COLOR)
                    path_canvas.paste(path_image, offset, mask)
            map_canvas.save(output_dir / f'floor-{fid}-map.png')
            path_canvas.save(output_dir / f'floor-{fid}-path.png')
            stats['floors'][fid] = contributors
        bounds_mod.save_bounds(output_dir / 'bounds.json', union)

    markers = []
    if include_markers:
        marker_groups = [source.markers() for _, source in sources]
        markers = merge_markers(*marker_groups)
        stats['marker_count'] = len(markers)
    save_markers_json(output_dir / 'markers.json', markers)

    stats['bounds'] = union
    return stats
