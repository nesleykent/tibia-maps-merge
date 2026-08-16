### Decode TibiaWikiBR Coordinates

This source comes from **tibiawiki.com.br**. Inspect its template source, not only visible prose.

- `{{Mapa|32250,31385,5:2|aqui}}` supplies absolute Tibia coordinates directly.
- Read the first three integers as `x=32250`, `y=31385`, and `z=5`.
- A suffix such as `:2` is Mapper display metadata; do not treat it as part of `z`.
- Also accept an exact integer `(x,y,z)` tuple when the quest walkthrough states one directly.
