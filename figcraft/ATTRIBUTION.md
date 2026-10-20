# Attribution

Every asset bundled in this repository (images, icons, fonts, data files) is listed here with its
author, source and licence. `cargo xtask assets` fails if a file under `assets/`, `docs/brand/` or
`docs/images/` is missing from this list.

FigCraft's user-interface icons are [Lucide](https://lucide.dev) icons (ISC licence, copied
unchanged into `assets/ui/lucide/`) plus a few originals drawn in Lucide's style (MIT OR
Apache-2.0, `assets/ui/lucide/original/`); `crates/ui-egui/src/icons.rs` maps each icon to its SVG
and `crates/ui-egui/src/icons/lucide.rs` rasterises them. The two owner-supplied exceptions, the
logo and the document mark, are rendered from the SVG files listed below
(`crates/ui-egui/src/brand.rs`). No icon from any other product is used.

## Assets in this repository

| Path | Author | Source | Licence | Notes |
|---|---|---|---|---|
| `assets/app-icon/figcraft-mark.svg`, `assets/app-icon/figcraft-dark.svg`, `assets/app-icon/figcraft.svg`, `assets/app-icon/figcraft-small.svg`, `assets/app-icon/figcraft-*.png`, `assets/app-icon/figcraft.ico`, `assets/app-icon/hicolor/*/apps/` | izaque-otaviano (repository owner) | The owner's pen logo, supplied 2026-10-20 (`figcraft-mark.svg` is the art as supplied, title and empty group removed; `figcraft-dark.svg` swaps its dark ink for light for the dark theme; `figcraft.svg` and `figcraft-small.svg` put it on an ice-white rounded tile for the app icon; the PNGs, `.ico` and `hicolor/` are rendered by `cargo xtask icon`; see [`assets/app-icon/README.md`](assets/app-icon/README.md)) | MIT OR Apache-2.0 (as the rest of this fork), [`assets/app-icon/LICENSE.txt`](assets/app-icon/LICENSE.txt) | FigCraft logo and app icon (a pen with a yellow tip and blue beads); replaces the chameleon. Drawn in the app by `crates/ui-egui/src/brand.rs` (the ink follows the theme) |
| `assets/app-icon/document.svg`, `assets/app-icon/document-small.svg`, `assets/app-icon/document-*.png`, `assets/app-icon/document.ico`, `assets/app-icon/hicolor/*/mimetypes/` | FigCraft contributors (the sheet), izaque-otaviano (the logo on it) | Drawn from scratch for FigCraft, 2026-10-20: a white sheet with a folded corner, the owner's logo above a stroked "FIGCRAFT" label (`document-small.svg`: no label, for 32 px and below); renders by `cargo xtask icon` | MIT OR Apache-2.0 | The `.figcraft` file icon (macOS, Windows, Linux mimetypes) and the document mark in the app (tabs, open and recent files, the recents' placeholder picture), `crates/ui-egui/src/brand.rs` |
| `assets/ui/bootstrap/LICENSE` | The Bootstrap Authors | https://icons.getbootstrap.com (bootstrap-icons 1.13.1 via npm), `LICENSE` of the package | MIT | The licence text the Bootstrap icons below are distributed under; keep it next to them |
| `assets/ui/bootstrap/align-bottom.svg` | The Bootstrap Authors | https://icons.getbootstrap.com (bootstrap-icons 1.13.1 via npm) | MIT | Bootstrap `align-bottom`, unchanged; used by `Icon::AlignBottom` (the owner's choice for the alignment buttons) |
| `assets/ui/bootstrap/align-center.svg` | The Bootstrap Authors | https://icons.getbootstrap.com (bootstrap-icons 1.13.1 via npm) | MIT | Bootstrap `align-center`, unchanged; used by `Icon::AlignHCenter` |
| `assets/ui/bootstrap/align-end.svg` | The Bootstrap Authors | https://icons.getbootstrap.com (bootstrap-icons 1.13.1 via npm) | MIT | Bootstrap `align-end`, unchanged; used by `Icon::AlignRight` |
| `assets/ui/bootstrap/align-middle.svg` | The Bootstrap Authors | https://icons.getbootstrap.com (bootstrap-icons 1.13.1 via npm) | MIT | Bootstrap `align-middle`, unchanged; used by `Icon::AlignVCenter` |
| `assets/ui/bootstrap/align-start.svg` | The Bootstrap Authors | https://icons.getbootstrap.com (bootstrap-icons 1.13.1 via npm) | MIT | Bootstrap `align-start`, unchanged; used by `Icon::AlignLeft` |
| `assets/ui/bootstrap/align-top.svg` | The Bootstrap Authors | https://icons.getbootstrap.com (bootstrap-icons 1.13.1 via npm) | MIT | Bootstrap `align-top`, unchanged; used by `Icon::AlignTop` |
| `assets/ui/lucide/LICENSE` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm), `LICENSE` of the package | ISC (and MIT for the icons derived from Feather, listed in the file) | The licence text the Lucide icons below are distributed under; keep it next to them |
| `assets/ui/lucide/align-horizontal-distribute-center.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `align-horizontal-distribute-center`, unchanged; used by `Icon::DistributeH` |
| `assets/ui/lucide/align-vertical-distribute-center.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `align-vertical-distribute-center`, unchanged; used by `Icon::DistributeV` |
| `assets/ui/lucide/align-vertical-justify-center.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `align-vertical-justify-center`, unchanged; used by `Icon::TextMiddle` |
| `assets/ui/lucide/align-vertical-justify-end.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `align-vertical-justify-end`, unchanged; used by `Icon::TextBottom` |
| `assets/ui/lucide/align-vertical-justify-start.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `align-vertical-justify-start`, unchanged; used by `Icon::TextTop` |
| `assets/ui/lucide/arrow-left-right.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `arrow-left-right`, unchanged; used by `Icon::Swap` |
| `assets/ui/lucide/bell.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `bell`, unchanged; used by `Icon::Bell` |
| `assets/ui/lucide/blocks.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `blocks`, unchanged; used by `Icon::Resources` |
| `assets/ui/lucide/book-open.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `book-open`, unchanged; used by `Icon::Library` |
| `assets/ui/lucide/check.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC, and MIT (derived from Feather, Cole Bemis; see `LICENSE`) | Lucide `check`, unchanged; used by `Icon::Check` |
| `assets/ui/lucide/chevron-down.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC, and MIT (derived from Feather, Cole Bemis; see `LICENSE`) | Lucide `chevron-down`, unchanged; used by `Icon::Chevron` |
| `assets/ui/lucide/chevron-left.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC, and MIT (derived from Feather, Cole Bemis; see `LICENSE`) | Lucide `chevron-left`, unchanged; used by `Icon::ChevronLeft` |
| `assets/ui/lucide/chevron-right.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC, and MIT (derived from Feather, Cole Bemis; see `LICENSE`) | Lucide `chevron-right`, unchanged; used by `Icon::ChevronRight` |
| `assets/ui/lucide/chevron-up.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC, and MIT (derived from Feather, Cole Bemis; see `LICENSE`) | Lucide `chevron-up`, unchanged; used by `Icon::ChevronUp` |
| `assets/ui/lucide/circle.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC, and MIT (derived from Feather, Cole Bemis; see `LICENSE`) | Lucide `circle`, unchanged; used by `Icon::Ellipse` |
| `assets/ui/lucide/circle-dot.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `circle-dot`, unchanged; used by `Icon::LivePrivate` |
| `assets/ui/lucide/circle-play.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `circle-play`, unchanged; used by `Icon::Prototype` |
| `assets/ui/lucide/circle-plus.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `circle-plus`, unchanged; used by `Icon::Assets` |
| `assets/ui/lucide/circle-question-mark.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `circle-question-mark`, unchanged; used by `Icon::Help` |
| `assets/ui/lucide/clock.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC, and MIT (derived from Feather, Cole Bemis; see `LICENSE`) | Lucide `clock`, unchanged; used by `Icon::Clock` |
| `assets/ui/lucide/code-xml.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `code-xml`, unchanged; used by `Icon::Code` |
| `assets/ui/lucide/component.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `component`, unchanged; used by `Icon::Component` |
| `assets/ui/lucide/contrast.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `contrast`, unchanged; used by `Icon::Mask` |
| `assets/ui/lucide/copy.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `copy`, unchanged; used by `Icon::WinRestore` |
| `assets/ui/lucide/crop.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `crop`, unchanged; used by `Icon::ClipContent` |
| `assets/ui/lucide/diamond.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `diamond`, unchanged; used by `Icon::Instance` |
| `assets/ui/lucide/droplet.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `droplet`, unchanged; used by `Icon::Opacity`, `Icon::Blend` |
| `assets/ui/lucide/ellipsis.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `ellipsis`, unchanged; used by `Icon::Dots` |
| `assets/ui/lucide/eraser.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `eraser`, unchanged; used by `Icon::Eraser` |
| `assets/ui/lucide/eye.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `eye`, unchanged; used by `Icon::Eye` |
| `assets/ui/lucide/eye-off.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `eye-off`, unchanged; used by `Icon::EyeOff` |
| `assets/ui/lucide/file.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `file`, unchanged; used by `Icon::Page` |
| `assets/ui/lucide/flip-horizontal-2.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `flip-horizontal-2`, unchanged; used by `Icon::FlipH` |
| `assets/ui/lucide/flip-vertical-2.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `flip-vertical-2`, unchanged; used by `Icon::FlipV` |
| `assets/ui/lucide/frame.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `frame`, unchanged; used by `Icon::Frame` |
| `assets/ui/lucide/globe.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `globe`, unchanged; used by `Icon::Online` |
| `assets/ui/lucide/grid-3x3.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `grid-3x3`, unchanged; used by `Icon::Grid` |
| `assets/ui/lucide/grip-vertical.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `grip-vertical`, unchanged; used by `Icon::DragHandle` |
| `assets/ui/lucide/group.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `group`, unchanged; used by `Icon::Group` |
| `assets/ui/lucide/hand.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `hand`, unchanged; used by `Icon::Hand` |
| `assets/ui/lucide/house.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `house`, unchanged; used by `Icon::Home` |
| `assets/ui/lucide/image.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `image`, unchanged; used by `Icon::Image` |
| `assets/ui/lucide/lasso.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `lasso`, unchanged; used by `Icon::Lasso` |
| `assets/ui/lucide/layers.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `layers`, unchanged; used by `Icon::Layers` |
| `assets/ui/lucide/line-squiggle.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `line-squiggle`, unchanged; used by `Icon::DrawMode` |
| `assets/ui/lucide/layout-grid.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `layout-grid`, unchanged; used by `Icon::LayoutGrid`, `Icon::ViewGrid` |
| `assets/ui/lucide/layout-list.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `layout-list`, unchanged; used by `Icon::AutoLayout` |
| `assets/ui/lucide/layout-panel-left.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `layout-panel-left`, unchanged; used by `Icon::Screens` |
| `assets/ui/lucide/link.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC, and MIT (derived from Feather, Cole Bemis; see `LICENSE`) | Lucide `link`, unchanged; used by `Icon::Link` |
| `assets/ui/lucide/link-2.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC, and MIT (derived from Feather, Cole Bemis; see `LICENSE`) | Lucide `link-2`, unchanged; used by `Icon::LinkOn` (proportions kept) |
| `assets/ui/lucide/link-2-off.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `link-2-off`, unchanged; used by `Icon::LinkOff` (proportions free) |
| `assets/ui/lucide/list.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `list`, unchanged; used by `Icon::ViewList` |
| `assets/ui/lucide/lock.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC, and MIT (derived from Feather, Cole Bemis; see `LICENSE`) | Lucide `lock`, unchanged; used by `Icon::Lock` |
| `assets/ui/lucide/lock-open.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `lock-open`, unchanged; used by `Icon::Unlock` |
| `assets/ui/lucide/menu.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `menu`, unchanged; used by `Icon::Menu` |
| `assets/ui/lucide/maximize.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `maximize`, unchanged; used by `Icon::Fullscreen` |
| `assets/ui/lucide/message-circle.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `message-circle`, unchanged; used by `Icon::Comment` |
| `assets/ui/lucide/minus.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC, and MIT (derived from Feather, Cole Bemis; see `LICENSE`) | Lucide `minus`, unchanged; used by `Icon::Line`, `Icon::Minus`, `Icon::WinMinimize` |
| `assets/ui/lucide/monitor-play.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `monitor-play`, unchanged; used by `Icon::Preview` |
| `assets/ui/lucide/moon.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC, and MIT (derived from Feather, Cole Bemis; see `LICENSE`) | Lucide `moon`, unchanged; used by `Icon::Moon` |
| `assets/ui/lucide/mouse-pointer-2.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `mouse-pointer-2`, unchanged; used by `Icon::Move` |
| `assets/ui/lucide/move-up-right.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `move-up-right`, unchanged; used by `Icon::Arrow` |
| `assets/ui/lucide/original/absolute-position.svg` | izaque-otaviano (repository owner), drawn with the assistance of an AI tool | Drawn for FigCraft on Lucide's 24x24 grid | MIT OR Apache-2.0 | Original icon in Lucide's style; used by `Icon::AbsolutePosition` |
| `assets/ui/lucide/original/arc-ratio.svg` | izaque-otaviano (repository owner), drawn with the assistance of an AI tool | Drawn for FigCraft on Lucide's 24x24 grid | MIT OR Apache-2.0 | Original icon in Lucide's style; used by `Icon::ArcRatio` |
| `assets/ui/lucide/original/arc-start.svg` | izaque-otaviano (repository owner), drawn with the assistance of an AI tool | Drawn for FigCraft on Lucide's 24x24 grid | MIT OR Apache-2.0 | Original icon in Lucide's style; used by `Icon::ArcStart` |
| `assets/ui/lucide/original/arc-sweep.svg` | izaque-otaviano (repository owner), drawn with the assistance of an AI tool | Drawn for FigCraft on Lucide's 24x24 grid | MIT OR Apache-2.0 | Original icon in Lucide's style; used by `Icon::ArcSweep` |
| `assets/ui/lucide/original/component-set.svg` | izaque-otaviano (repository owner), drawn with the assistance of an AI tool | Drawn for FigCraft on Lucide's 24x24 grid | MIT OR Apache-2.0 | Original icon in Lucide's style (dashed box in the manner of Lucide `square-dashed`); used by `Icon::ComponentSet` |
| `assets/ui/lucide/original/detach.svg` | izaque-otaviano (repository owner), drawn with the assistance of an AI tool | Drawn for FigCraft on Lucide's 24x24 grid | MIT OR Apache-2.0 | Original icon in Lucide's style; used by `Icon::Detach` |
| `assets/ui/lucide/original/fill.svg` | izaque-otaviano (repository owner), drawn with the assistance of an AI tool | Drawn for FigCraft on Lucide's 24x24 grid | MIT OR Apache-2.0 | Original icon in Lucide's style; used by `Icon::Fill` |
| `assets/ui/lucide/original/fill-container.svg` | izaque-otaviano (repository owner), drawn with the assistance of an AI tool | Drawn for FigCraft on Lucide's 24x24 grid | MIT OR Apache-2.0 | Original icon in Lucide's style; used by `Icon::FillContainer` |
| `assets/ui/lucide/original/fixed.svg` | izaque-otaviano (repository owner), drawn with the assistance of an AI tool | Drawn for FigCraft on Lucide's 24x24 grid | MIT OR Apache-2.0 | Original icon in Lucide's style; used by `Icon::Fixed` |
| `assets/ui/lucide/original/flow-horizontal.svg` | izaque-otaviano (repository owner), drawn with the assistance of an AI tool | Drawn for FigCraft on Lucide's 24x24 grid | MIT OR Apache-2.0 | Original icon in Lucide's style; used by `Icon::LayoutH` |
| `assets/ui/lucide/original/flow-vertical.svg` | izaque-otaviano (repository owner), drawn with the assistance of an AI tool | Drawn for FigCraft on Lucide's 24x24 grid | MIT OR Apache-2.0 | Original icon in Lucide's style; used by `Icon::LayoutV` |
| `assets/ui/lucide/original/flow-wrap.svg` | izaque-otaviano (repository owner), drawn with the assistance of an AI tool | Drawn for FigCraft on Lucide's 24x24 grid | MIT OR Apache-2.0 | Original icon in Lucide's style; used by `Icon::LayoutWrap` |
| `assets/ui/lucide/original/gap.svg` | izaque-otaviano (repository owner), drawn with the assistance of an AI tool | Drawn for FigCraft on Lucide's 24x24 grid | MIT OR Apache-2.0 | Original icon in Lucide's style; used by `Icon::Gap` |
| `assets/ui/lucide/original/hug.svg` | izaque-otaviano (repository owner), drawn with the assistance of an AI tool | Drawn for FigCraft on Lucide's 24x24 grid | MIT OR Apache-2.0 | Original icon in Lucide's style; used by `Icon::Hug` |
| `assets/ui/lucide/original/padding-horizontal.svg` | izaque-otaviano (repository owner), drawn with the assistance of an AI tool | Drawn for FigCraft on Lucide's 24x24 grid | MIT OR Apache-2.0 | Original icon in Lucide's style; used by `Icon::PaddingH` |
| `assets/ui/lucide/original/padding-vertical.svg` | izaque-otaviano (repository owner), drawn with the assistance of an AI tool | Drawn for FigCraft on Lucide's 24x24 grid | MIT OR Apache-2.0 | Original icon in Lucide's style; used by `Icon::PaddingV` |
| `assets/ui/lucide/original/section.svg` | izaque-otaviano (repository owner), drawn with the assistance of an AI tool | Drawn for FigCraft on Lucide's 24x24 grid | MIT OR Apache-2.0 | Original icon in Lucide's style; used by `Icon::Section`, `Icon::Section2` |
| `assets/ui/lucide/original/shape-builder.svg` | izaque-otaviano (repository owner), drawn with the assistance of an AI tool | Drawn for FigCraft on Lucide's 24x24 grid | MIT OR Apache-2.0 | Original icon in Lucide's style; used by `Icon::ShapeBuilder` |
| `assets/ui/lucide/original/shape-builder-remove.svg` | izaque-otaviano (repository owner), drawn with the assistance of an AI tool | Drawn for FigCraft on Lucide's 24x24 grid | MIT OR Apache-2.0 | Original icon in Lucide's style; used by `Icon::ShapeBuilderRemove` |
| `assets/ui/lucide/original/variable.svg` | izaque-otaviano (repository owner), drawn with the assistance of an AI tool | Drawn for FigCraft on Lucide's 24x24 grid | MIT OR Apache-2.0 | Original icon in Lucide's style (composed with Lucide `hexagon`, ISC); used by `Icon::Variable` |
| `assets/ui/lucide/original/variable-width.svg` | izaque-otaviano (repository owner), drawn with the assistance of an AI tool | Drawn for FigCraft on Lucide's 24x24 grid | MIT OR Apache-2.0 | Original icon in Lucide's style; used by `Icon::VariableWidth` |
| `assets/ui/lucide/paint-bucket.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `paint-bucket`, unchanged; used by `Icon::PaintBucket` |
| `assets/ui/lucide/panel-left.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `panel-left`, unchanged; used by `Icon::Panels` |
| `assets/ui/lucide/pen-tool.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `pen-tool`, unchanged; used by `Icon::Pen` |
| `assets/ui/lucide/pencil.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `pencil`, unchanged; used by `Icon::Pencil` |
| `assets/ui/lucide/pencil-ruler.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `pencil-ruler`, unchanged; used by `Icon::DesignMode` |
| `assets/ui/lucide/pipette.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `pipette`, unchanged; used by `Icon::Eyedropper` |
| `assets/ui/lucide/play.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `play`, unchanged; used by `Icon::Play` |
| `assets/ui/lucide/plus.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC, and MIT (derived from Feather, Cole Bemis; see `LICENSE`) | Lucide `plus`, unchanged; used by `Icon::Plus` |
| `assets/ui/lucide/radio.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC, and MIT (derived from Feather, Cole Bemis; see `LICENSE`) | Lucide `radio`, unchanged; used by `Icon::LiveShared` |
| `assets/ui/lucide/redo-2.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `redo-2`, unchanged; used by `Icon::Redo` |
| `assets/ui/lucide/rotate-ccw.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `rotate-ccw`, unchanged; used by `Icon::Reset` |
| `assets/ui/lucide/rotate-cw.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `rotate-cw`, unchanged; used by `Icon::Rotate` |
| `assets/ui/lucide/scaling.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `scaling`, unchanged; used by `Icon::Scale` |
| `assets/ui/lucide/scan.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `scan`, unchanged; used by `Icon::IndependentCorners` |
| `assets/ui/lucide/scissors.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `scissors`, unchanged; used by `Icon::Cut` |
| `assets/ui/lucide/search.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC, and MIT (derived from Feather, Cole Bemis; see `LICENSE`) | Lucide `search`, unchanged; used by `Icon::Search` |
| `assets/ui/lucide/slice.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `slice`, unchanged; used by `Icon::Slice` |
| `assets/ui/lucide/sliders-vertical.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `sliders-vertical`, unchanged; used by `Icon::Adjust` |
| `assets/ui/lucide/smile-plus.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `smile-plus`, unchanged; used by `Icon::Reaction` |
| `assets/ui/lucide/sparkles.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `sparkles`, unchanged; used by `Icon::Effects` |
| `assets/ui/lucide/spline.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `spline`, unchanged; used by `Icon::Bend` |
| `assets/ui/lucide/square.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC, and MIT (derived from Feather, Cole Bemis; see `LICENSE`) | Lucide `square`, unchanged; used by `Icon::Rectangle`, `Icon::StrokeIcon`, `Icon::WinMaximize` |
| `assets/ui/lucide/square-arrow-out-up-right.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `square-arrow-out-up-right`, unchanged; used by `Icon::NewWindow` |
| `assets/ui/lucide/square-dashed-plus.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `square-dashed-plus`, unchanged; used by `Icon::Slot` |
| `assets/ui/lucide/square-round-corner.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `square-round-corner`, unchanged; used by `Icon::CornerRadius` |
| `assets/ui/lucide/squares-exclude.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `squares-exclude`, unchanged; used by `Icon::Exclude` |
| `assets/ui/lucide/squares-intersect.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `squares-intersect`, unchanged; used by `Icon::Intersect` |
| `assets/ui/lucide/squares-subtract.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `squares-subtract`, unchanged; used by `Icon::Subtract` |
| `assets/ui/lucide/squares-unite.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `squares-unite`, unchanged; used by `Icon::Boolean`, `Icon::Union` |
| `assets/ui/lucide/star.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `star`, unchanged; used by `Icon::Star` |
| `assets/ui/lucide/sun.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `sun`, unchanged; used by `Icon::Sun` |
| `assets/ui/lucide/swatch-book.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `swatch-book`, unchanged; used by `Icon::Styles` |
| `assets/ui/lucide/text-align-center.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `text-align-center`, unchanged; used by `Icon::TextAlignCenter` |
| `assets/ui/lucide/text-align-end.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `text-align-end`, unchanged; used by `Icon::TextAlignRight` |
| `assets/ui/lucide/text-align-justify.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `text-align-justify`, unchanged; used by `Icon::TextAlignJustify` |
| `assets/ui/lucide/text-align-start.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `text-align-start`, unchanged; used by `Icon::TextAlignLeft` |
| `assets/ui/lucide/triangle.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC, and MIT (derived from Feather, Cole Bemis; see `LICENSE`) | Lucide `triangle`, unchanged; used by `Icon::Polygon` |
| `assets/ui/lucide/triangle-alert.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `triangle-alert`, unchanged; used by `Icon::GamutWarning` |
| `assets/ui/lucide/type.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC, and MIT (derived from Feather, Cole Bemis; see `LICENSE`) | Lucide `type`, unchanged; used by `Icon::Text` |
| `assets/ui/lucide/undo-2.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `undo-2`, unchanged; used by `Icon::Undo` |
| `assets/ui/lucide/upload.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC, and MIT (derived from Feather, Cole Bemis; see `LICENSE`) | Lucide `upload`, unchanged; used by `Icon::Export` |
| `assets/ui/lucide/vector-square.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `vector-square`, unchanged; used by `Icon::Vector` |
| `assets/ui/lucide/x.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC, and MIT (derived from Feather, Cole Bemis; see `LICENSE`) | Lucide `x`, unchanged; used by `Icon::Close` |
| `assets/ui/lucide/zap.svg` | Lucide Icons and Contributors | https://lucide.dev (lucide-static 1.58.0 via npm) | ISC | Lucide `zap`, unchanged; used by `Icon::Actions` |
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
