# Attribution

Every asset bundled in this repository (images, icons, fonts, data files) is listed here with its
author, source and licence. `cargo xtask assets` fails if a file under `assets/`, `docs/brand/` or
`docs/images/` is missing from this list.

FigCraft's user-interface icons are drawn in code (`crates/ui-egui/src/icons.rs`): original work,
MIT OR Apache-2.0. The two exceptions, the logo and the document mark, are rendered from the SVG
files listed below (`crates/ui-egui/src/brand.rs`).

## Assets in this repository

| Path | Author | Source | Licence | Notes |
|---|---|---|---|---|
| `assets/app-icon/` (all files: `figcraft.svg`, `figcraft-small.svg`, `figcraft-*.png`, `figcraft.ico`, `hicolor/`) | izaque-otaviano (repository owner) | Supplied by the repository owner, 2026-10-16 (`figcraft-small.svg` is the same art with a thicker, pixel-snapped border; the PNGs, `.ico` and `hicolor/` are rendered by `cargo xtask icon`; see [`assets/app-icon/README.md`](assets/app-icon/README.md)) | MIT OR Apache-2.0 (as the rest of this fork), [`assets/app-icon/LICENSE.txt`](assets/app-icon/LICENSE.txt) | FigCraft app icon (chameleon on yellow); replaces the previous chameleon app icon. Also drawn in the app by `crates/ui-egui/src/brand.rs` |
| `assets/ui/document-tab.svg` | Supplied by the repository owner (izaque-otaviano), 2026-10-16 | Owner-supplied SVG; origin not stated | As supplied by the repository owner | Document tab icon (a pen nib): the mark before a file's name in the document tabs, open files and recent files, tinted blue by `crates/ui-egui/src/brand.rs` |
| `docs/brand/artcraft-logo.svg`, `docs/brand/artcraft-logo.png`, `docs/brand/artcraft-logo-white.svg`, `docs/brand/artcraft-logo-white.png`, `docs/brand/artcraft-mark.svg`, `docs/brand/artcraft-mark.png`, `docs/brand/artcraft-mark-black.svg`, `docs/brand/artcraft-mark-black.png` | ArtCraft Team | storytold/craftrules `assets/brand/` | ArtCraft brand terms (`docs/brand/LICENSE-brand.txt`), not open source | Trademarks; unmodified use within FigCraft only |
| `docs/images/` (all screenshots and exports: `shot-*.png`, `art-*.png`) | FigCraft contributors | Screenshots of FigCraft showing synthetic demo documents made in FigCraft, and PNG exports of those documents by FigCraft's renderer | MIT OR Apache-2.0 | No third-party artwork |
| `examples/*.figcraft` | FigCraft contributors | Synthetic demo documents built through FigCraft's command API; invented copy, shapes and vectors drawn from scratch, no images or embedded fonts | MIT OR Apache-2.0 | Text uses Inter (OFL, from craft-fonts or the system); no third-party artwork |

## Fonts (build input, not in this repository)

Release builds embed fonts from the optional craft-fonts build input
([storytold/craft-fonts](https://github.com/storytold/craft-fonts), `CRAFT_FONTS_DIR`). Its own
`ATTRIBUTION.md` and licence files are authoritative; the packages ship each font's licence.

| Family | Licence | Upstream |
|---|---|---|
| Inter | SIL Open Font License 1.1 | https://github.com/rsms/inter |
| Roboto, Montserrat, Lato, Open Sans, Poppins, Nunito Sans, Merriweather, Playfair Display, Source Sans 3, Source Serif 4, Carlito, Caladea | SIL Open Font License 1.1 | Google Fonts / upstream repositories (see craft-fonts) |
| Liberation Sans, Serif, Mono | SIL Open Font License 1.1 | https://github.com/liberationfonts |
| BIZ UDPGothic, BIZ UDMincho, Shippori Mincho, Noto Sans Arabic | SIL Open Font License 1.1 | Google Fonts (see craft-fonts) |

egui's default fonts (compiled into the `egui`/`epaint` crates) keep their own licences (OFL / Apache-2.0 / Ubuntu Font Licence); see those crates.

The macOS menu bar is built with the muda crate (Tauri Programme, MIT OR Apache-2.0, see
`NOTICE`): code only, no images or icons; its items are FigCraft's own labels and AppKit's
standard ones (Services, Hide, Minimize, Zoom).
