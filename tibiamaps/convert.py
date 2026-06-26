"""Raw minimap export -> PNG + JSON data directory."""
from __future__ import annotations

from pathlib import Path

from . import bounds as bounds_mod
from .markers import save_markers_json, sort_markers
from .sources import RawMinimapSource


def convert_from_minimap(
    input_dir: Path,
    output_dir: Path,
    *,
    include_markers: bool = True,
    markers_only: bool = False,
    floors: set[int] | None = None,
    log=print,
) -> dict:
    source = RawMinimapSource(Path(input_dir))
    b = source.bounds
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    floor_ids = b['floorIDs']
    if floors is not None:
        floor_ids = [fid for fid in floor_ids if int(fid) in floors]

    if not markers_only:
        for fid in floor_ids:
            z = int(fid)
            log(f'Rendering floor {fid}...')
            source.floor_map_image(z).save(output_dir / f'floor-{fid}-map.png')
            source.floor_path_image(z).save(output_dir / f'floor-{fid}-path.png')
        bounds_mod.save_bounds(output_dir / 'bounds.json', b)

    markers = sort_markers(source.markers()) if include_markers else []
    save_markers_json(output_dir / 'markers.json', markers)

    return {
        'bounds': b,
        'floors_rendered': [] if markers_only else floor_ids,
        'marker_count': len(markers),
    }
