# tibia-maps-merge

Convert and merge Tibia minimap exports -- a from-scratch reimplementation of
[tibiamaps/tibia-maps-script](https://github.com/tibiamaps/tibia-maps-script),
with more control over merging multiple exports.

## Web app (recommended)

**[nesleykent.github.io/tibia-maps-merge](https://nesleykent.github.io/tibia-maps-merge/)**

A static page, hosted on GitHub Pages -- no install, no server. Everything
runs client-side in your browser (vanilla JS, Canvas for image stitching, a
hand-rolled ZIP writer for output) using plain folder/file pickers, so it
works in Safari too, not just Chrome. Your Tibia files never leave your
machine -- nothing is uploaded anywhere; results download as a `.zip` (or a
single file, for the Markers tab) that you unzip into place yourself.

Source for the web app lives in [`docs/`](docs/) -- `index.html` + `app.js`
wire up the UI, `lib/` has the actual conversion/merge/zip logic, framework-free.

## CLI (for scripting / automation)

A separate Python/Pillow implementation of the same logic, for terminal use
or automation -- reads/writes directly on disk instead of zip downloads.

### Setup

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Commands

### Convert a raw minimap export to PNG + JSON

A raw export is whatever's in your Tibia client's `minimap` folder:
`Minimap_Color_<x>_<y>_<z>.png`, `Minimap_WaypointCost_<x>_<y>_<z>.png`, and
`minimapmarkers.bin`.

```sh
.venv/bin/python cli.py convert /path/to/minimap --output ./data
```

- `--markers-only` -- only (re)write `markers.json`, skip rendering floor images
- `--no-markers` -- skip markers entirely
- `--floors 0,1,7-9` -- only process the given floors

### Merge two or more sources

Sources can be raw exports, already-converted data directories, or a mix --
each is auto-detected. Markers are unioned by `(x, y, z)`; explored map/path
tiles are unioned pixel-by-pixel so gaps in one source get filled from
another. Pass sources in priority order -- later sources win where two
sources explored the same tile differently.

```sh
.venv/bin/python cli.py merge ./data-a ./data-b --output ./data-merged
```

- `--no-markers` / `--no-maps` -- merge only the other half
- `--floors 0,1,7-9` -- only merge the given floors

### Inspect a source

```sh
.venv/bin/python cli.py info ./data-a
```

Prints bounds, floor list, tile counts, and marker count.

### Standalone marker conversion

For working with `minimapmarkers.bin` snapshots directly, without the image
pipeline:

```sh
.venv/bin/python cli.py markers-to-json minimapmarkers.bin --output markers.json
.venv/bin/python cli.py markers-to-bin markers.json --output minimapmarkers.bin
.venv/bin/python cli.py merge-markers snapshot-a.bin snapshot-b.json --output merged.json
```

`merge-markers` accepts any mix of `.bin` and `.json` files and skips (with a
warning) any file it can't parse, rather than aborting the whole merge.

## Notes / limitations

- Only writes `data/*` (PNG + JSON). It does not write a Tibia-compatible
  `minimap/*` export back out (no client-side tile re-encoding) -- only the
  marker `.bin` round-trip (`markers-to-bin`) is supported for pushing data
  back into the client.
- The marker binary format has an older variant (seen in some legacy/renamed
  `.bin` files, e.g. one using a 14-byte coordinate block instead of the
  modern 10-byte one) that isn't supported -- same limitation as the
  upstream tool. Affected files are skipped with a warning rather than
  aborting.
