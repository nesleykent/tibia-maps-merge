# tibia-maps-merge

Tibia's map changes with every game update, and the community at
[tibiamaps.io](https://tibiamaps.io/) keeps its marker data updated to match.
**The web app** merges *your* personal Tibia markers with the latest
community markers, so you get both -- your own win if you've marked the same
spot differently.

This repo also has a separate, broader **Python CLI** with no tibiamaps.io
integration -- it converts/merges raw minimap exports (images + markers)
entirely from local files. See [CLI](#cli-for-scripting--automation) below.

## Web app (recommended)

**[nesleykent.github.io/tibia-maps-merge](https://nesleykent.github.io/tibia-maps-merge/)**

A static page, hosted on GitHub Pages -- no install, no server. It fetches
the live community `minimapmarkers.bin` straight out of tibiamaps.io's own
["minimap with markers"](https://tibiamaps.io/downloads/minimap-with-markers)
download (the same file the site itself distributes -- so it's always current
with the latest game update). Three modes:

- **Merge Mode** -- pick your own marker file(s) (`minimapmarkers.bin` from
  your Tibia client, or `markers.json`); they're merged with the live
  community markers, yours taking priority at any shared coordinate.
  Downloads a `.zip` containing the merged `minimapmarkers.bin`, an
  unmodified backup of whatever you uploaded, and `merge-log.txt` (a full
  audit: counts loaded/added/identical/conflicting, the policy applied, and
  every detected conflict). An "export audit files" checkbox adds
  `merged-markers.json` and `conflicts.json` for manual editing or
  third-party tooling.
- **Conversion Mode** -- pure format conversion, no merging:
  `minimapmarkers.bin` ↔ `markers.json`, or the live community markers
  straight to `community-markers.json`. Downloads a `.zip` with the
  converted file and `conversion-log.txt` (source/output format, marker
  count, and a real round-trip validation check).
- **Add Marks** -- write markers by hand instead of uploading them. One
  path, top to bottom: **1** your marker file, **2** define marks, **3**
  review, then download. Step 1 is optional -- load your own
  `minimapmarkers.bin`/`markers.json` and the new marks are merged into it
  by coordinate, yours winning on a clash, so the download is your whole
  marker file rather than just the new marks; leave it empty and you get a
  file containing only what you typed. Step 2 is a single form for one mark
  or a hundred: a coordinate field taking one mark per line (`x, y, z`),
  plus a label and icon applied to the batch, either of which a line can
  override by appending its own (`32250, 31385, 5, Depot, flag`).
  Unparseable lines are reported and skipped rather than failing the batch.
  Step 2 can also fill itself from a **Tibia Wiki quest article**: paste the
  URL and it pulls every coordinate the article links to, labelled from the
  surrounding sentence, ready to edit. It reads the article's wikitext
  through the MediaWiki API (`origin=*`), so no proxy or server is involved
  and only public article text is requested. Both wiki styles are handled:
  tibiawiki.com.br's plain `{{Mapa|x,y,z}}` links, and tibia.fandom.com's
  Mapper `sector.offset` templates (following the `/Spoiler` subpage where
  the walkthrough actually lives). Step 3 is a table with
  Edit/Delete per row, kept across reloads in `localStorage`. Downloads a
  `.zip` with the new `minimapmarkers.bin`, a backup of any file you loaded,
  and `add-marks-log.txt`.

  The icon picker covers all 20 marker types the binary format defines --
  the list is derived from the same `ICONS_BY_ID` table the parser and
  encoder use ([`docs/lib/constants.js`](docs/lib/constants.js)), so it
  can't drift from the format, and each is shown as the Tibia client's own
  minimap symbol alongside its numeric type byte
  ([`docs/lib/icons.js`](docs/lib/icons.js)). The artwork comes from the
  sprite sheet the [TibiaWiki Mapper](https://tibia.fandom.com/wiki/Mapper)
  uses (`docs/assets/minimap-symbols.png`); its slot order is not the
  format's byte order, so the mapping is pinned by a test.

### Guides

- [**Generating quest marks from Tibia Wiki with an AI assistant**](guides/quest-marks-from-tibia-wiki.md)
  -- hand a Tibia Wiki quest URL to ChatGPT with an extraction prompt, get
  back `x, y, z, Label, icon` lines for every NPC, entrance, floor
  transition, item and boss in the walkthrough, and paste them straight into
  Add Marks. Includes the full prompt and the exact icon names the parser
  accepts.

Everything runs client-side (vanilla JS: a ZIP reader + native
`DecompressionStream` to unpack tibiamaps.io's download, a ZIP writer for
the output archive, the same binary marker parser/writer as the CLI below).
Your files never leave your machine.

Also available in [Brazilian Portuguese](https://nesleykent.github.io/tibia-maps-merge/pt-br/)
(`docs/pt-br/index.html`) -- a language switcher links between the two. Page
text lives directly in each language's HTML file; the handful of strings
`app.js` generates dynamically (status/result messages) go through
[`docs/lib/i18n.js`](docs/lib/i18n.js), keyed off each page's `<html lang>`.

All three modes share one structure, so they read and behave the same way:
numbered steps, one prominent action per panel, and a primary action that
names what it produces (in Conversion Mode the label follows the chosen
conversion). Temporary contexts -- editing a mark, confirming a removal,
picking an icon -- are sheets with `Cancel` and the completing action
trailing, per the macOS convention.

Source lives in [`docs/`](docs/) -- `index.html` + `app.js` wire up the UI,
`lib/` has the actual fetch/parse/merge logic, framework-free.

### Versioning

The web app's version is tracked in [`docs/lib/version.js`](docs/lib/version.js)
and shown (linked to the changelog) in the footer of both language pages.
Every web app change bumps `VERSION` and gets an entry in
[`CHANGELOG.md`](CHANGELOG.md). The CLI doesn't have its own version number --
it's a separate tool, versioned implicitly by git history.

## CLI (for scripting / automation)

A separate, independent Python/Pillow tool -- it does **not** fetch anything
from tibiamaps.io and has no "merge with community markers" feature. It
covers the original, broader scope instead: converting raw minimap exports
to PNG + JSON and merging multiple exports (map/path tile images included,
not just markers), entirely from local files.

### Setup

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### Commands

#### Convert a raw minimap export to PNG + JSON

A raw export is whatever's in your Tibia client's `minimap` folder:
`Minimap_Color_<x>_<y>_<z>.png`, `Minimap_WaypointCost_<x>_<y>_<z>.png`, and
`minimapmarkers.bin`.

```sh
.venv/bin/python cli.py convert /path/to/minimap --output ./data
```

- `--markers-only` -- only (re)write `markers.json`, skip rendering floor images
- `--no-markers` -- skip markers entirely
- `--floors 0,1,7-9` -- only process the given floors

#### Merge two or more sources

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

#### Inspect a source

```sh
.venv/bin/python cli.py info ./data-a
```

Prints bounds, floor list, tile counts, and marker count.

#### Standalone marker conversion

For working with `minimapmarkers.bin` snapshots directly, without the image
pipeline:

```sh
.venv/bin/python cli.py markers-to-json minimapmarkers.bin --output markers.json
.venv/bin/python cli.py markers-to-bin markers.json --output minimapmarkers.bin
.venv/bin/python cli.py merge-markers snapshot-a.bin snapshot-b.json --output merged.json
```

`merge-markers` accepts any mix of `.bin` and `.json` files and skips (with a
warning) any file it can't parse, rather than aborting the whole merge.

### CLI limitations

- Only writes `data/*` (PNG + JSON). It does not write a Tibia-compatible
  `minimap/*` export back out (no client-side tile re-encoding) -- only the
  marker `.bin` round-trip (`markers-to-bin`) is supported for pushing data
  back into the client.
- The marker binary format has an older variant (seen in some legacy/renamed
  `.bin` files, e.g. one using a 14-byte coordinate block instead of the
  modern 10-byte one) that isn't supported -- same limitation as the
  upstream tool, and the same one the web app has. Affected files are
  skipped with a warning rather than aborting.

## Disclaimer & credits

This is an independent, unofficial project -- not affiliated with,
endorsed by, or sponsored by CipSoft GmbH or tibiamaps.io. **Tibia** is a
registered trademark of CipSoft GmbH; see [tibia.com](https://www.tibia.com/)
for the actual game.

Community marker data is fetched live and unmodified from
[tibiamaps.io's public "minimap with markers" download](https://tibiamaps.io/downloads/minimap-with-markers).
Full credit for that data belongs to [tibiamaps.io](https://tibiamaps.io/)
and its contributors -- this project only combines it with your own
personal markers, entirely in your browser; nothing is uploaded anywhere.

The binary minimap/marker file formats this project implements from
scratch (in both the web app's JS and the CLI's Python) are documented by
tibiamaps.io at
[tibiamaps.io/guides/minimap-file-format](https://tibiamaps.io/guides/minimap-file-format)
and [tibiamaps.io/guides/map-file-format](https://tibiamaps.io/guides/map-file-format).
The CLI's original concept -- convert a `minimap` export to PNG + JSON and
merge multiple exports -- is based on
[tibiamaps/tibia-maps-script](https://github.com/tibiamaps/tibia-maps-script),
also by tibiamaps.io.
