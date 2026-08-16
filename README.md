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
with the latest game update). **Your markers** is one shared upload above the
tools: choose the file once and Merge, Extract Own, Convert, Edit Marks and
Marker Sets all use it. Clear it there to switch files. Five modes:

- **Merge** -- your uploaded marker file(s) (`minimapmarkers.bin` from
  your Tibia client, or `markers.json`) are merged with the live
  community markers, yours taking priority at any shared coordinate.
  A live pre-download review shows the community, personal, new, identical,
  overridden, and final marker totals before anything is downloaded.
  Downloads a `.zip` containing the merged `minimapmarkers.bin`, an
  unmodified backup of whatever you uploaded, and `merge-log.txt` (a full
  audit: counts loaded/added/identical/conflicting, the policy applied, and
  every detected conflict). An "export audit files" checkbox adds
  `merged-markers.json` and `conflicts.json` for manual editing or
  third-party tooling.
- **Extract Own** -- recovers personal markers from a file that already mixes
  them with Community markers and/or any combination of the nine published
  Marker Sets. It subtracts exact published copies, while preserving a marker
  at a shared coordinate when its label or icon differs -- that is a personal
  override, not published data. Its persistent review explains what input is
  needed and previews exact copies removed, overrides kept, unique personal
  marks, and the final total before download. Community and Marker Set sources
  use the same shared checkbox-card component, without visible native inputs.
  The download contains both
  `own-minimapmarkers.bin` and `own-markers.json`, backups, and an audit log.
- **Convert** -- pure format conversion, no merging:
  `minimapmarkers.bin` ↔ `markers.json`, or the live community markers
  straight to `community-markers.json`. Downloads a `.zip` with the
  converted file and `conversion-log.txt` (source/output format, marker
  count, and a real round-trip validation check).
- **Edit Marks** -- put a list of marks together yourself, edit it, then add
  it to your marker file or take it back out. One path, top to bottom: **1**
  define marks, **2** review, **3** add or remove, then download. The shared
  upload is optional when adding -- load your own `minimapmarkers.bin` or
  `markers.json` above the tools and the new marks are merged into it
  by coordinate, yours winning on a clash, so the download is your whole
  marker file rather than just the new marks; leave it empty and you get a
  file containing only what you typed. Step 1 is a single form for one mark
  or a hundred: a coordinate field taking one mark per line (`x, y, z`),
  plus a label and icon applied to the batch, either of which a line can
  override by appending its own (`32250, 31385, 5, Depot, flag`).
  Unparseable lines are reported and skipped rather than failing the batch.
  Step 1 can also fill itself from a **Tibia Wiki quest article**: paste the
  URL and it pulls every coordinate the article links to, labelled from the
  surrounding sentence, ready to edit. It reads the article's wikitext
  through the MediaWiki API (`origin=*`), so no proxy or server is involved
  and only public article text is requested. Both wiki styles are handled:
  tibiawiki.com.br's plain `{{Mapa|x,y,z}}` links, and tibia.fandom.com's
  Mapper `sector.offset` templates (following the `/Spoiler` subpage where
  the walkthrough actually lives). Step 2 is a table with Edit/Delete per
  row, kept across reloads in `localStorage`. Step 3 appears once a file is
  loaded and asks which way to apply the new list: **add** merges it in,
  while **remove** drops every coordinate in the list from the file, whatever
  it is labelled there. When adding, identical overlaps stay unchanged and
  real conflicts appear inside the review table with the loaded-file and
  new-list versions side by side. You decide each coordinate separately,
  using the same **Keep Existing Mark** / **Use New Mark** language as the bulk
  actions. Each decision includes a direct tibiamaps.io coordinate link.
  Download remains disabled until every conflict has a decision. That is what
  makes rewriting labels and icons deliberate instead of implicit. Removing
  is what clears a quest's
  marks once you are done with it: import the quest, delete any row you want
  to keep, remove. With no file loaded the step stays hidden -- there is
  nothing to remove from, so the only possible outcome is a new file.
  Downloads a `.zip` with the new `minimapmarkers.bin`, a backup of any file
  you loaded, and `edit-marks-log.txt`. The log records every coordinate-level
  conflict decision and both versions of each conflicting mark.

  The icon picker covers all 20 marker types the binary format defines --
  the list is derived from the same `ICONS_BY_ID` table the parser and
  encoder use ([`docs/lib/constants.js`](docs/lib/constants.js)), so it
  can't drift from the format, and each is shown as the Tibia client's own
  minimap symbol alongside its numeric type byte
  ([`docs/lib/icons.js`](docs/lib/icons.js)). The artwork comes from the
  sprite sheet the [TibiaWiki Mapper](https://tibia.fandom.com/wiki/Mapper)
  uses (`docs/assets/minimap-symbols.png`); its slot order is not the
  format's byte order, so the mapping is pinned by a test.
- **Marker Sets** -- the same add/remove, with a ready-made collection in
  place of a list you assembled. The collections are the ones tibiamaps.io
  publishes alongside its map data
  ([`extra/`](https://github.com/tibiamaps/tibia-map-data/tree/main/extra) --
  all nine of them: Achievements, Rapid Respawn, Points of Interest,
  Anniversary, Lightbearer, Orcsoberfest Island, Percht Island, Devovorga and
  Ignore), read live from that repository; a test asserts the picker matches
  what is published, in both directions, since a missing set is invisible in
  the UI. Any number of collections can be picked at once and are applied
  together; where two name the same coordinate the mark counts once, decided
  by picker order so the preview always matches the download, and both the
  preview and the log say how many were double-counted. Each card carries the
  date its `markers.json` last changed, which
  ranges from last week to 2020 -- the dates come from the GitHub commits API
  (`raw.githubusercontent.com` sends no `Last-Modified`), asked for once when
  the tab is first opened and cached for half a day, since that API allows 60
  unauthenticated requests an hour and there is no single request that answers
  for all nine. A card simply carries no date if that fails. Nothing else is
  fetched until a collection is picked -- one of them is over 5,000 markers. Adding follows the opposite precedence to Edit Marks:
  a published collection fills gaps and *your* file wins, because those marks
  are not yours. The step shows what will change before you download.
  Points of interest carries a note about where it comes from -- the
  [Measuring Tibia Quest](https://tibia.fandom.com/wiki/Measuring_Tibia_Quest)
  scatters PoIs differently for every character, so the collection is every
  position one can appear in: a search list, not marks meant to stay.

### Guides

- [**Generating quest marks from Tibia Wiki with an AI assistant**](guides/quest-marks-from-tibia-wiki.md)
  -- give the app a Tibia Wiki quest URL and hand a wiki-specific extraction
  prompt to ChatGPT to get back `x, y, z, Label, icon` lines for every NPC,
  entrance, floor transition, item and boss in the walkthrough. TibiaWikiBR
  keeps its already-working URL-only flow, except Gemini can receive an
  asynchronously fetched source excerpt; Fandom embeds a coordinate-complete
  excerpt of raw API wikitext so assistants need no Fandom network access. The prompt parts live in
  [`docs/prompts/`](docs/prompts/) and are used by every assistant button.

### Repository layout

```text
.
├── .github/workflows/    Continuous integration checks
├── docs/                 GitHub Pages application
│   ├── assets/           Web UI images
│   ├── lib/              Browser-side application modules
│   ├── prompts/          Canonical AI-assistant prompts
│   └── pt-br/            Brazilian Portuguese entry point
├── guides/               User-facing workflows and screenshots
├── tests/                Dependency-free browser-module tests
├── tibiamaps/            Reusable Python package
├── CHANGELOG.md          Web app release history
├── cli.py                Python command-line entry point
├── package.json          Web-module test command
└── requirements.txt      Python runtime dependencies
```

Keeping deployable web assets under `docs/` lets GitHub Pages serve the app
directly. Reusable Python logic stays isolated in `tibiamaps/`, while guides
and prompt sources have dedicated directories instead of accumulating at the
repository root.

Everything runs client-side (vanilla JS: a ZIP reader + native
`DecompressionStream` to unpack tibiamaps.io's download, a ZIP writer for
the output archive, the same binary marker parser/writer as the CLI below).
Your files never leave your machine.

Also available in [Brazilian Portuguese](https://nesleykent.github.io/tibia-maps-merge/pt-br/)
(`docs/pt-br/index.html`) -- a language switcher links between the two. Page
text lives directly in each language's HTML file; the handful of strings
`app.js` generates dynamically (status/result messages) go through
[`docs/lib/i18n.js`](docs/lib/i18n.js), keyed off each page's `<html lang>`.

The five modes are a real tablist: `role="tablist"` with `aria-selected` and
`aria-controls`, each panel a `tabpanel` named by its tab, a roving tabindex
so the group is a single tab stop, and arrow keys (plus Home/End) moving
between them. The bar is sticky, since Edit Marks runs well past a screen.
The current mode lives in the URL (`#merge`, `#extract-own`, `#convert`,
`#edit-marks`, `#marker-sets`) so it can be linked to and survives a reload -- the same slugs
in both languages, set with `replaceState` so a tab does not cost a press of
Back. An unrecognised fragment is left alone.

The page is the tool: hero, one shared file source, tabs, and the active panel.
Everything read once or consulted in passing is a sheet instead. **How it
works** is a pill in the header row
beside the language switch, which the page was already paying for, so it
costs no space at all; **where the client keeps `minimapmarkers.bin`** is its
own sheet, offered beside each picker that asks for your file, because that
one is needed mid-task rather than read up front. Both are in the footer as
well. Sheets are declared, not wired: `data-open-sheet`/`data-close-sheet` on
the trigger, backdrop-click and Escape to dismiss.

All five modes share one structure, so they read and behave the same way:
numbered steps, one prominent action per panel, and a primary action that
names what it produces (in Convert the label follows the chosen conversion).
Temporary contexts -- editing a mark, confirming a removal, picking an icon
-- are sheets with `Cancel` leading and the completing action trailing, per
the macOS convention.

The action hierarchy is one ladder, applied everywhere, and
[a test enforces it](#versioning): filled accent for the single action a
panel exists for; an accent *outline* for the action that completes a step
without completing the view (`Add 6 Marks`); a plain outline for the
alternatives beside it (`Import`, `Copy Prompt`); a small chip for step-head
utilities (`Remove All`); filled red only ever as the confirming action of a
destructive sheet. A standalone on/off setting is a switch (`role="switch"`
over a checkbox, label leading and control trailing); checkboxes are for
picking several things from a list, as the collection cards do. Destructive intent is a colour, not a rank -- a row's
`Delete` keeps its row-button size and only changes colour. Labels name their
action rather than agreeing (`Save Changes`, `Remove All Marks`, never `OK`),
and tab labels are the section, not the section plus the word "Mode".

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
