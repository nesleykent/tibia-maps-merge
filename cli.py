#!/usr/bin/env python3
"""tibiamaps -- convert and merge Tibia minimap exports.

    convert       raw minimap export  -> PNG + JSON data directory
    merge         N sources (raw or data, any mix) -> merged data directory
    info          stats about a raw export or data directory
    markers-to-json   minimapmarkers.bin -> markers.json
    markers-to-bin    markers.json -> minimapmarkers.bin
    merge-markers     merge any number of .bin/.json marker files
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from tibiamaps.convert import convert_from_minimap
from tibiamaps.markers import (
    load_markers_json,
    merge_markers,
    parse_markers_bin,
    save_markers_json,
    write_markers_bin,
)
from tibiamaps.merge import merge_sources
from tibiamaps.sources import ConvertedDataSource, RawMinimapSource, open_source


def _parse_floors(value: str | None) -> set[int] | None:
    if not value:
        return None
    floors: set[int] = set()
    for part in value.split(','):
        part = part.strip()
        if '-' in part:
            start, end = part.split('-')
            floors.update(range(int(start), int(end) + 1))
        else:
            floors.add(int(part))
    return floors


def _load_markers_any(path: Path) -> list[dict]:
    if path.suffix == '.bin':
        return parse_markers_bin(path.read_bytes(), source=str(path))
    return load_markers_json(path)


def _load_markers_any_safe(path: Path) -> list[dict] | None:
    try:
        return _load_markers_any(path)
    except ValueError as error:
        print(f'Warning: skipping {path} -- {error}', file=sys.stderr)
        return None


def cmd_convert(args: argparse.Namespace) -> int:
    stats = convert_from_minimap(
        args.minimap_dir,
        args.output,
        include_markers=not args.no_markers,
        markers_only=args.markers_only,
        floors=_parse_floors(args.floors),
    )
    print(f'Converted {args.minimap_dir} -> {args.output}')
    print(f"  Markers: {stats['marker_count']}")
    if stats['floors_rendered']:
        print(f"  Floors rendered: {', '.join(stats['floors_rendered'])}")
    return 0


def cmd_merge(args: argparse.Namespace) -> int:
    stats = merge_sources(
        [Path(p) for p in args.sources],
        args.output,
        include_markers=not args.no_markers,
        include_maps=not args.no_maps,
        floors=_parse_floors(args.floors),
    )
    print(f'Merged {len(args.sources)} sources -> {args.output}')
    print(f"  Markers: {stats['marker_count']}")
    if stats['floors']:
        print(f"  Floors: {', '.join(stats['floors'])}")
    return 0


def cmd_info(args: argparse.Namespace) -> int:
    source = open_source(args.path)
    kind = 'converted data directory' if isinstance(source, ConvertedDataSource) else 'raw minimap export'
    b = source.bounds
    markers = source.markers()
    print(f'{args.path} -- {kind}')
    print(f"  Bounds: x[{b['xMin']}, {b['xMax']}] y[{b['yMin']}, {b['yMax']}] z[{b['zMin']}, {b['zMax']}]")
    print(f"  Size: {b['width']}x{b['height']}")
    print(f"  Floors: {', '.join(b['floorIDs'])}")
    print(f'  Markers: {len(markers)}')
    if isinstance(source, RawMinimapSource):
        print(f'  Color tiles: {len(source.color_tiles)}')
        print(f'  WaypointCost tiles: {len(source.path_tiles)}')
    return 0


def cmd_markers_to_json(args: argparse.Namespace) -> int:
    try:
        markers = parse_markers_bin(Path(args.bin_file).read_bytes(), source=args.bin_file)
    except ValueError as error:
        print(f'Error: {error}', file=sys.stderr)
        return 1
    save_markers_json(Path(args.output), markers)
    print(f'Wrote {len(markers)} markers -> {args.output}')
    return 0


def cmd_markers_to_bin(args: argparse.Namespace) -> int:
    markers = load_markers_json(Path(args.json_file))
    Path(args.output).write_bytes(write_markers_bin(markers))
    print(f'Wrote {len(markers)} markers -> {args.output}')
    return 0


def cmd_merge_markers(args: argparse.Namespace) -> int:
    loaded = [(p, _load_markers_any_safe(Path(p))) for p in args.files]
    groups = [g for _, g in loaded if g is not None]
    skipped = [p for p, g in loaded if g is None]
    if not groups:
        print('Error: no marker files could be parsed.', file=sys.stderr)
        return 1
    merged = merge_markers(*groups)
    output = Path(args.output)
    if output.suffix == '.bin':
        output.write_bytes(write_markers_bin(merged))
    else:
        save_markers_json(output, merged)
    total = sum(len(g) for g in groups)
    used = len(args.files) - len(skipped)
    print(f'Merged {used} marker files ({total} entries) -> {len(merged)} unique markers -> {output}')
    if skipped:
        print(f'Skipped {len(skipped)} unparseable file(s): {", ".join(skipped)}')
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog='tibiamaps',
        description='Convert and merge Tibia minimap exports (binary tiles + markers) into PNG + JSON.',
    )
    sub = parser.add_subparsers(dest='command', required=True)

    p = sub.add_parser('convert', help='Convert a raw minimap export into PNG + JSON.')
    p.add_argument('minimap_dir', help='Directory with Minimap_Color_*.png / Minimap_WaypointCost_*.png / minimapmarkers.bin')
    p.add_argument('--output', '-o', required=True, help='Output data directory')
    p.add_argument('--markers-only', action='store_true', help='Only (re)write markers.json; skip rendering floor images')
    p.add_argument('--no-markers', action='store_true', help='Skip markers entirely')
    p.add_argument('--floors', help='Limit to specific floors, e.g. "0,1,7-9"')
    p.set_defaults(func=cmd_convert)

    p = sub.add_parser('merge', help='Merge two or more sources (raw exports and/or data directories).')
    p.add_argument('sources', nargs='+', help='Two or more source directories, in priority order (later wins on conflicts)')
    p.add_argument('--output', '-o', required=True, help='Output merged data directory')
    p.add_argument('--no-markers', action='store_true', help='Skip markers')
    p.add_argument('--no-maps', action='store_true', help='Skip map/path image merging (markers only)')
    p.add_argument('--floors', help='Limit to specific floors, e.g. "0,1,7-9"')
    p.set_defaults(func=cmd_merge)

    p = sub.add_parser('info', help='Show stats about a raw export or data directory.')
    p.add_argument('path')
    p.set_defaults(func=cmd_info)

    p = sub.add_parser('markers-to-json', help='Convert minimapmarkers.bin -> markers.json.')
    p.add_argument('bin_file')
    p.add_argument('--output', '-o', required=True)
    p.set_defaults(func=cmd_markers_to_json)

    p = sub.add_parser('markers-to-bin', help='Convert markers.json -> minimapmarkers.bin.')
    p.add_argument('json_file')
    p.add_argument('--output', '-o', required=True)
    p.set_defaults(func=cmd_markers_to_bin)

    p = sub.add_parser('merge-markers', help='Merge any number of .bin/.json marker files (priority order, later wins).')
    p.add_argument('files', nargs='+')
    p.add_argument('--output', '-o', required=True, help='Output path; .bin or .json based on extension')
    p.set_defaults(func=cmd_merge_markers)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == '__main__':
    sys.exit(main())
