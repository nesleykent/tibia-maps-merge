# tibia-maps-merge

Tibia's map changes with every game update, and the community at
[tibiamaps.io](https://tibiamaps.io/) keeps its marker data updated to match.
This merges *your* personal Tibia markers with the latest community markers,
so you get both -- your own win if you've marked the same spot differently.

## Web app (recommended)

**[nesleykent.github.io/tibia-maps-merge](https://nesleykent.github.io/tibia-maps-merge/)**

A static page, hosted on GitHub Pages -- no install, no server. It fetches
the live community `minimapmarkers.bin` straight out of tibiamaps.io's own
["minimap with markers"](https://tibiamaps.io/downloads/minimap-with-markers)
download (the same file the site itself distributes -- so it's always current
with the latest game update), lets you pick your own marker file(s)
(`minimapmarkers.bin` from your Tibia client, or `markers.json`), and merges
them -- your markers take priority over community ones at the same
coordinate. Output downloads as `minimapmarkers.bin`, ready to drop back into
your Tibia client's `minimap` folder, or as `.json` if you want the raw data.

Everything runs client-side (vanilla JS: a ZIP reader + native
`DecompressionStream` to unpack tibiamaps.io's download, the same binary
marker parser/writer as the CLI below). Your files never leave your machine.

Also available in [Brazilian Portuguese](https://nesleykent.github.io/tibia-maps-merge/pt-br/)
(`docs/pt-br/index.html`) -- a language switcher links between the two. Page
text lives directly in each language's HTML file; the handful of strings
`app.js` generates dynamically (status/result messages) go through
[`docs/lib/i18n.js`](docs/lib/i18n.js), keyed off each page's `<html lang>`.

Source lives in [`docs/`](docs/) -- `index.html` + `app.js` wire up the UI,
`lib/` has the actual fetch/parse/merge logic, framework-free.

## CLI (for scripting / automation)

A separate Python/Pillow implementation covering the full original scope --
converting raw minimap exports to PNG + JSON and merging multiple exports
(images included, not just markers) -- for terminal use or automation.

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
