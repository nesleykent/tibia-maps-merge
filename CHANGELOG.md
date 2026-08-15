# Changelog

All notable changes to the web app are tracked here. Versions follow
[Semantic Versioning](https://semver.org/); the version shown in the app
footer always matches the latest entry below.

## [1.6.1] - 2026-08-15

### Fixed

- The extraction prompt contradicted itself about code blocks: the output
  format asked for the marks "inside exactly ONE plain-text code block",
  while the rules below told the assistant not to output "code fences around
  the extracted marks". Either instruction could win, which is why a run
  sometimes came back as bare text. The format now asks for one block fenced
  with triple backticks and says the whole response must be that block and
  nothing else, and the rule was narrowed to what it actually meant -- no
  headings, prose or per-line fences *inside* the block.

## [1.6.0] - 2026-08-15

### Added

- **Copy Prompt** and **Open in ChatGPT**, beside Import. Both take the URL
  already in the field, drop it into the extraction prompt from the
  [quest marks guide](guides/quest-marks-from-tibia-wiki.md), and hand the
  result over -- one to the clipboard, the other straight to
  `chatgpt.com/?q=`.
  - This is the route to the accurate labels and per-location icons the
    importer cannot produce on its own, without leaving the page to copy a
    prompt out of the guide by hand.
  - It also reaches wikis the importer cannot: an assistant can browse a site
    that blocks cross-origin reads, so a tibiopedia.pl article -- unreadable
    to the importer -- still turns into a marker list this way.
  - The prompt now lives in `docs/lib/prompt.js` as well as in the guide, so
    a test asserts the two are identical; editing one without the other fails
    rather than leaving the app and the documentation disagreeing.

## [1.5.1] - 2026-08-15

### Changed

- The icon picker moved to the right of the coordinate field and became a
  5x4 grid, so the twenty marks read as a palette beside the text you are
  writing rather than as a long strip underneath it. The two line up at the
  same height, and the label field now runs the full width below both. On a
  phone the palette drops under the coordinates and keeps its 40px targets.

## [1.5.0] - 2026-08-15

### Changed

- **Picking a marker icon is now one click on the icon itself.** The dropdown
  and the modal sheet that sat between you and the choice are both gone; all
  twenty marker types are laid out at once, in a single row on desktop, and
  you click the one you want.
  - No names next to the icons -- anyone playing the game recognises them,
    and twenty labels was just noise. Each icon still carries its name as a
    tooltip and as text for screen readers, and the group is backed by real
    radio inputs, so it keeps native single-selection and arrow-key movement.
- The icon names moved to where they are actually needed: a reference sheet
  opened from the coordinate-syntax hint, listing each icon with the exact
  name to type at the end of a line and the byte it writes. That is the one
  place the names matter -- typing `32250, 31385, 5, Depot, flag` by hand, or
  checking what the AI-assisted guide should emit.

## [1.4.2] - 2026-08-15

### Added

- The wiki importer now says which wikis it works with and links to their
  quest lists ([tibiawiki.com.br](https://www.tibiawiki.com.br/wiki/Quests),
  [tibia.fandom.com](https://tibia.fandom.com/wiki/Quests)), so finding an
  article to paste doesn't require guessing.
- A pointer to the
  [quest marks guide](guides/quest-marks-from-tibia-wiki.md) next to it. The
  importer extracts coordinates accurately but lifts labels from the
  surrounding prose and gives every mark the batch icon; the guide's
  AI-assisted route is what produces labels written for a player and an icon
  chosen per location, so the two are now presented as what they are --
  quick extraction, or a more accurate pass.

## [1.4.1] - 2026-08-15

### Changed

- The Review table's Icon column now shows just the icon. Repeating its name
  as text beside it made every row read twice as wide as it needed to. The
  name is still there as a tooltip and for screen readers.
- Added a first **Map** column linking each mark to its position on
  tibiamaps.io (`https://tibiamaps.io/map#x,y,z:1`), opening in a new tab --
  so a coordinate can be checked against the real map before it is written
  to the file.

## [1.4.0] - 2026-08-15

### Changed

- The icon picker now shows the **Tibia client's own minimap symbols**
  instead of the hand-drawn SVG approximations that stood in for them. The
  artwork is the sprite sheet the
  [TibiaWiki Mapper](https://tibia.fandom.com/wiki/Mapper) uses, added as
  `docs/assets/minimap-symbols.png` (121x22 -- eleven 11x11 symbols per row,
  two rows) and positioned with CSS, so it costs one small request and stays
  crisp via `image-rendering: pixelated`.
  - The sheet's slot order is **not** the format's byte order: it follows the
    Mapper's own picker layout, putting the four red arrows at slots 7, 8, 18
    and 19 and the two green ones at 9 and 20, interleaved with the rest.
    Slot 10 is a numbered badge and slot 21 is empty; neither exists in
    `minimapmarkers.bin`. The mapping was read off the sheet, confirmed by
    sampling each slot's glyph colours, and is now pinned by a test that also
    asserts no icon points at a non-format slot.

## [1.3.1] - 2026-08-15

### Fixed

- The wiki importer returned nothing for **tibia.fandom.com** articles, even
  though 1.3.0 claimed to support them. Two reasons, both now handled:
  - Fandom keeps the walkthrough on a `/Spoiler` subpage, so the quest
    article itself is only an infobox. The importer now follows the subpage
    when the page you pasted has no positions of its own.
  - Fandom writes positions in Mapper's `sector.offset` form
    (`{{Minimap|x=130.1|y=123.236|z=7}}`, `{{Mapper Coords|...}}`) rather
    than as plain coordinates. A sector is one 256x256 minimap tile -- the
    same grid this project's own `Minimap_Color_<x>_<y>_<z>.png` files are
    named after -- so the game coordinate is `sector * 256 + offset`.
    Verified against the Mapper page's own town links and against the same
    quest on tibiawiki.com.br, where 17 of the extracted positions land
    within a few tiles of that wiki's coordinates for the same locations.
  - A `{{Minimap}}` that carries a `mark1=` uses the mark's exact position;
    without one, the map centre is used.
- Template parameters could leak into a label when the text before a link
  started inside an unclosed template, producing labels like
  "width=1 height=1 centermark=yes". The label context is now cut back to
  the unclosed `{{`.

## [1.3.0] - 2026-08-15

### Added

- **Add Marks can read a Tibia Wiki quest article directly.** Paste an
  article URL into step 2 and the coordinate field fills with every position
  the article links to, labelled from the surrounding sentence. It is one
  more way to write those lines, not a second way to add marks -- editing,
  the batch label and icon, and Review all work exactly as before.
  - Reads the article's wikitext through the MediaWiki API with `origin=*`,
    which is the only part of these sites a static page can reach: the
    rendered HTML is cross-origin and often behind a bot check, while the API
    answers with CORS headers. No proxy and no server of our own is involved,
    and only public article text is requested.
  - Works with any MediaWiki install -- the API endpoint and page title are
    derived from the URL -- so both tibiawiki.com.br and tibia.fandom.com
    links work, in `/wiki/Title` or `/index.php?title=` form.
  - Coordinates come from the `{{Mapa|x,y,z}}` map-link template, falling
    back to bare `(x,y,z)` positions for articles that write them inline.
    Labels are built from the clause preceding each link, with wiki markup,
    gallery captions, file names and nested templates stripped out.
  - Labels are a starting point, not an answer: they are drafted into the
    editable coordinate field so they can be fixed before adding, and again
    per row under Review. For semantic icons and hand-written labels, the
    [quest marks guide](guides/quest-marks-from-tibia-wiki.md) still covers
    the AI-assisted route.

## [1.2.0] - 2026-08-14

### Added

- **Add Marks**, a third mode for writing markers by hand instead of
  uploading them. The panel is one path, top to bottom -- **1** your marker
  file, **2** define marks, **3** review -- ending in the view's single
  prominent action, "Download minimapmarkers.bin", which produces a `.zip`
  with a ready-to-install `minimapmarkers.bin`, a backup of anything you
  loaded, and `add-marks-log.txt`. Details:
  - Step 1 is optional: load your existing `minimapmarkers.bin` /
    `markers.json` and the new marks are merged into it by coordinate,
    yours winning where they collide, so the download is your whole marker
    file rather than just the new marks. Leave it empty and you get a file
    containing only what you typed.
  - Step 2 is a single form for one mark or a hundred -- a coordinate field
    taking one mark per line (`x, y, z`), plus a label and an icon applied
    to the batch. A line can carry its own label and trailing icon name to
    override them. A single line is simply a batch of one, so there is no
    separate "add one" form to choose between. Unparseable lines are
    reported and skipped rather than failing the batch, and the action
    names what it will do: "Add 6 Marks", recounting as you type.
  - Step 3 appears only once there is something to review: a table
    (x, y, z, label, icon) with Edit and Delete per row, surviving a page
    reload via `localStorage`.
  - The icon picker offers all 20 marker types the binary format defines,
    derived from the same `ICONS_BY_ID` table the parser and encoder use
    (so it can't drift from the format), each drawn as a small inline SVG
    and listed with its numeric type byte. Clicking the current icon opens
    a sheet with all of them; a plain `<select>` beside it does the same job
    for keyboard and screen-reader use.
  - Action hierarchy follows the Apple HIG: one prominent action per view,
    with `Cancel` confined to temporary, cancellable contexts -- editing a
    mark opens a sheet (Cancel / **Save Changes**) and "Remove All" opens a
    confirmation (Cancel / **Remove All Marks**), both with the completing
    action trailing per the macOS convention and destructive actions styled
    as such. Sheets are centred modals on desktop, bottom sheets on phones.
  - The output is validated and round-trip checked with the same
    parser/encoder the other two modes use.

### Changed

- Merge Mode and Conversion Mode now use the same structure as Add Marks,
  so the three modes read and behave identically: numbered steps, one
  prominent action per panel, and a primary action that names what it
  produces -- "Download merged minimapmarkers.bin", and in Conversion Mode
  a label that follows the chosen conversion ("Download markers.json" /
  "Download minimapmarkers.bin" / "Download community-markers.json"),
  replacing the generic "Merge & Download" / "Convert & Download". Field
  hints that only qualified a step moved onto the step header.

### Fixed

- `<select>` controls rendered differently in Safari, which keeps the
  native macOS pull-down bezel and ignores much of the applied styling.
  Reset `appearance` on form controls and buttons app-wide and drew the
  pull-down indicator ourselves, so every engine shows the same control.

## [1.1.1] - 2026-06-26

### Changed

- Extended the community marker cache from 10 minutes to 24 hours.
  tibiamaps.io's data only changes a handful of times a year (tied to game
  updates), so this keeps things current in practice while cutting repeat-
  visit load against tibiamaps.io's server much further. The "Check for
  updates" button still bypasses the cache instantly for anyone who wants
  the latest data right away.

## [1.1.0] - 2026-06-26

### Changed

- The community `minimapmarkers.bin` download (~6.5MB) was being fetched
  on every single page load, with `cache: 'no-cache'` forcing revalidation
  every time -- no caching at all. Added a `localStorage` cache (10-minute
  TTL, matching tibiamaps.io's own `Cache-Control: max-age=600`), so
  reloading or revisiting the page within that window loads instantly from
  cache instead of re-downloading. Added a "Check for updates" button next
  to the status line for anyone who wants the latest data immediately
  regardless of cache age.

## [1.0.1] - 2026-06-26

### Fixed

- Merge Mode's result summary and `merge-log.txt` had a confusing, redundant
  "Yours replaced community markers" line equal to identical + conflicts,
  immediately followed by "Of those, real conflicts" -- worded as if
  conflicts were a subset of the identical-and-skipped count rather than a
  sibling category. Dropped the redundant line and relabeled the remaining
  three as a clean, mutually-exclusive breakdown of "your markers loaded":
  new-only-in-yours + unchanged + conflicts-resolved-in-your-favor, which
  now visibly sums to that total.

## [1.0.0] - 2026-06-26

First tracked version. Established the version/changelog practice itself,
and split the tool into two modes:

### Added

- **Merge Mode**: merges your personal markers with tibiamaps.io's live
  community markers (existing behavior), now producing a `.zip` containing:
  - `minimapmarkers.bin` -- the merged result
  - `backup-<timestamp>_<filename>` -- an unmodified copy of each marker
    file you uploaded, before merging
  - `merge-log.txt` -- a full audit log (counts loaded/added/identical/
    conflicting, the conflict-resolution policy, and the complete list of
    detected conflicts)
  - optional `merged-markers.json` and `conflicts.json`, via a new "Export
    audit files" checkbox, for manual editing or third-party tooling
- **Conversion Mode**: pure format conversion, no merging --
  `minimapmarkers.bin` to `markers.json`, `markers.json` back to
  `minimapmarkers.bin`, or tibiamaps.io's live community markers to
  `community-markers.json`. Produces a `.zip` with the converted file plus
  a `conversion-log.txt` (source/output format, marker count, a round-trip
  validation check, and confirmation nothing was modified or uploaded).
- App version number + link to this changelog, shown in the footer.
