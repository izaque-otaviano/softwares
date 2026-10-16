# FigCraft app icon

A **chameleon**: a black silhouette in profile (head, eye, front leg and the start of the curled
tail) on a yellow square with a dark border; the body runs off the tile's left and bottom edges.
Supplied by the repository owner (izaque-otaviano) on 2026-10-16; it replaces the previous
engraving-style chameleon icon.

## Palette

| Colour | Hex | Used for |
|---|---|---|
| Ink | `#1d1a1b` / `#1e1b1c` | the silhouette and the border |
| Yellow | `#ffc63d` | the field |

## Geometry

The owner's art is drawn on a 1000-unit square. The masters wrap it unchanged (scaled by 0.512)
onto the 512-unit tile `cargo xtask icon` expects (`viewBox="0 0 512 512"`), clipped to the tile
because the silhouette runs past its edges. The tile is a plain square, no rounded corners. The
macOS renders pad it onto Apple's 824/1024 icon grid; Windows and Linux use the tile edge to edge.

## Files

- `figcraft.svg`: canonical master, the owner's art as supplied (border 50 units of 1000).
- `figcraft-small.svg`: small-size variant for 16–32 px: the same art with the border at 1/16 of
  the side (62.5 of 1000), so it falls on whole pixels at 16, 32 and 48 px instead of blurring;
  also the hicolor scalable icon.
- `figcraft-<size>.png` (16–1024): renders on the macOS grid; `packaging/macos/package.sh` builds
  the `.icns` from them.
- `figcraft.ico`: Windows icon, 16–256 px, embedded in the `.exe` by `apps/figcraft/build.rs`.
- `hicolor/<size>/apps/ai.storyteller.figcraft.png` (16–512) and `hicolor/scalable/...svg`:
  Linux icon theme; the 256 px one is also the runtime window icon off macOS, the 64 px one the
  web app's favicon (`apps/figcraft-web/index.html`).
- In the app, `crates/ui-egui/src/brand.rs` embeds both masters and rasterises them at the exact
  pixel size shown (left rail main-menu button, Home sidebar, About window).

Sizes up to 32 px (PNG, `.ico` and hicolor entries) are rendered from `figcraft-small.svg`, the
rest from `figcraft.svg`.

## Provenance

Supplied by the repository owner, 2026-10-16. License: see `LICENSE.txt`.

## Regenerate

Replace `figcraft.svg` (and `figcraft-small.svg`), then run `cargo xtask icon`. It needs `resvg`
(`cargo install resvg`). The installer art in `../../../instaladores/figcraft/arte/` is made from
these renders by `gerar.py` (see its README).
