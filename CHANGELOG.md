# Changelog

All notable changes to the web app are tracked here. Versions follow
[Semantic Versioning](https://semver.org/); the version shown in the app
footer always matches the latest entry below.

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
