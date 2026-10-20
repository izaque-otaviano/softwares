# FigCraft app icon and document icon

The FigCraft logo is a **pen**: a tilted dark pen with a yellow tip, three blue beads along its
barrel, a pale pink outline and two pink swirls around it. Supplied by the repository owner
(izaque-otaviano) on 2026-10-20; it replaces the chameleon icon.

## Palette

| Colour | Hex | Used for |
|---|---|---|
| Ink | `#1b1818` | the pen's body (light theme); `#f2f2f2` on the dark theme |
| Pink | `#e5b8d0` | the outline, the cap and the swirls |
| Yellow | `#febb00` | the tip |
| Blues | `#4390cf` / `#2678b9` / `#005795` | the beads |
| Grey | `#5b5a5a` | the bead's pin |
| Ice white | `#f6f3f5` | the app icon's tile |

## Files

The owner's art is drawn on a 1000-unit square (bounding box 55–917 × 128–870). The files are
generated from it (the `<title>` and an empty group removed, the CSS classes inlined as fills).

The mark in the app (`crates/ui-egui/src/brand.rs`, rasterised at the exact pixel size shown: the
left rail, the Home sidebar, the About window):
- `figcraft-mark.svg`: the art as supplied, on a transparent ground (light theme).
- `figcraft-dark.svg`: the same with the dark ink swapped for `#f2f2f2`, so the pen reads on dark
  panels; `brand.rs` picks it when `theme::Tokens::dark` is set.

The app icon (one version for both light and dark desktops: the art on an ice-white rounded
square, corner radius 22 % of the side, which keeps the dark ink readable on a dark Dock too):
- `figcraft.svg`: master, `viewBox="0 0 512 512"`, the art 392 units wide on the tile.
- `figcraft-small.svg`: the variant for 16–32 px, the art 440 units wide so the pen stays legible.
- `figcraft-<size>.png` (16–1024): renders on Apple's icon grid (transparent margin);
  `packaging/macos/package.sh` builds `FigCraft.icns` from them.
- `figcraft.ico`: Windows icon, 16–256 px, embedded in the `.exe` by `apps/figcraft/build.rs`.
- `hicolor/<size>/apps/ai.storyteller.figcraft.png` (16–512) and `hicolor/scalable/apps/…svg`:
  Linux icon theme; the 256 px one is also the runtime window icon off macOS, the 64 px one the
  web app's favicon (`apps/figcraft-web/index.html`).

The `.figcraft` document icon, drawn from scratch for FigCraft in the usual desktop convention: a
white sheet with a folded top-right corner, the logo in its upper half and a grey "FIGCRAFT" label
(stroked block letters, no font) below:
- `document.svg`: master, 512 grid; `document-small.svg`: no label and a larger logo, for 16–32 px.
- `document-<size>.png` (16–1024): Apple grid, `FigCraftDocument.icns` in the macOS bundle
  (`CFBundleTypeIconFile` / `UTTypeIconFile` in `packaging/macos/Info.plist.in`).
- `document.ico`: installed as `figcraft-document.ico` and set as the `.figcraft` `DefaultIcon`
  (`packaging/windows/figcraft.wxs`, `instaladores/figcraft/windows/figcraft.iss`).
- `hicolor/<size>/mimetypes/application-x-figcraft.png` and `hicolor/scalable/mimetypes/…svg`:
  the icon `packaging/linux/ai.storyteller.figcraft.mime.xml` names.
- In the app the same sheet is the document mark before a file's name (tabs, open and recent
  files) and the recents' placeholder picture (`brand.rs`, `Art::Document`).

Sizes up to 32 px (PNG, `.ico` and hicolor entries) are rendered from the `-small` masters, the
rest from the main ones.

## Provenance

The pen logo: supplied by the repository owner, 2026-10-20. The sheet and the label: drawn for
FigCraft. License: see `LICENSE.txt` (MIT OR Apache-2.0).

## Regenerate

Replace the masters, then run `cargo xtask icon`. It needs `resvg` (`cargo install resvg`). The
installer art in `../../../instaladores/figcraft/arte/` is made from these renders by `gerar.py`
(see its README).
