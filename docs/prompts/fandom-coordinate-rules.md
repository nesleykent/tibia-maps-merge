### Decode Tibia Fandom Coordinates

This source comes from **tibia.fandom.com** and may be the article's `/Spoiler` subpage. Inspect its template and URL source, not only visible prose.

- **`Mapper Coords`:** `{{Mapper Coords|text=here|128.1|127.109|10|...}}` uses `sector.offset` for the first two positional values. Convert each axis with `absolute = sector * 256 + offset`, so `128.1` becomes `32769` and `127.109` becomes `32621`; the next positional integer is `z=10`. The template can instead use named coordinate parameters such as `{{Mapper Coords|x=128.182|y=124.66|z=7|...}}`; decode `x=`, `y=`, and `z=` identically. Ignore display parameters and later Mapper metadata.
- **`Minimap`:** `x=<sector.offset>`, `y=<sector.offset>`, and `z=<floor>` describe the map centre. If the template has `mark1=`, `mark2=`, or other numbered marks, extract every mark's first two `sector.offset` values instead of the centre and use the template's `z` value as their floor. Later mark fields select appearance; they are not the Tibia `z` coordinate. If there are no numbered marks, convert the centre coordinates.
- **Legacy Mapper URLs:** links may encode a centre as `coords=130.231-126.63-6-...` and exact marks as `mark1=130.231-126.63-6-...`. The first hyphen-separated value is X in `sector.offset` form, the second is Y in `sector.offset` form, and the third is the actual `z`. When numbered marks exist, extract those exact marks instead of the display centre.

For every X or Y value, keep the digits before and after the dot separate: the dot is a sector/offset delimiter, not a decimal point. For example, `126.169` is `126 * 256 + 169 = 32425`, not the decimal number 126.169.
