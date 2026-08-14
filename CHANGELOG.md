# Changelog

All notable changes to the web app are tracked here. Versions follow
[Semantic Versioning](https://semver.org/); the version shown in the app
footer always matches the latest entry below.

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
