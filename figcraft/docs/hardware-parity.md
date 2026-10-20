# Hardware and platform parity

> **Last reviewed:** 2026-10-10 · **Last updated:** 2026-10-20 · **Change:** minor (fast scrolling: screen first, scroll drafts, speed-sized margin, decoding ahead, tiles; canvas speed on photo-heavy pages: pictures drawn from a mip pyramid kept in a cache with a byte budget and decoded ahead in parallel, box blur and shadows several times faster, zoom drafts without grain, background blur and glass, and the web build rendering in frame-sized pieces instead of freezing the page; the macOS system menu bar; smoother canvas panning and zooming: overscan render reused while panning, half-resolution drafts while zooming, no panel cache rebuilds on view changes; Windows QA pass; Display P3: gamut warning and soft-proof (true P3 blocked upstream); several windows, the prototype in a window of its own; pen pressure for the Pencil and brushes on Windows and from browser styluses) · **Target:** Figma Design (desktop app 126.10.7)

How FigCraft uses hardware and which platforms it runs on, against Figma. Figma's desktop app is
Electron with a GPU helper process; its canvas renders on the GPU (WebGL, with WebGPU rolling out
since 2025). FigCraft renders the canvas on the CPU and presents it through wgpu.

**Summary (estimated):** hardware ~60%, performance ~60%, platforms ~75%.

## Hardware

| Feature | Figma | FigCraft (macOS / Windows / Linux / web) | Hours |
|---|---|---|---|
| Canvas rendering | GPU | CPU (tiny-skia), banded across cores, retained (re-renders only what an edit or pan touches), levels of detail below 50% zoom; shown through wgpu (WebGPU or WebGL2 in the browser). The canvas renders a margin of a quarter of the view around it and reuses that image while panning (nothing is rendered or uploaded until a pan has used half the margin; the next render keeps more margin ahead of the pan), renders half-resolution drafts while a wheel or pinch zoom is under way and the full image once it settles, and keeps every render within the GPU's texture limit. Pictures drawn at under half size come from a mip pyramid (levels halved with a box filter, kept in a 256 MB least-recently-used cache, 96 MB in the browser, decoded ahead in parallel); the browser draws a few bands of the view per frame instead of the whole render at once | 30–60 for a GPU path |
| Effects (blurs, glass, noise) | GPU | CPU | in the above |
| HiDPI / Retina | yes | yes (all) | — |
| Wide-gamut display (Display P3) | yes, on capable displays | colours stored and exported in P3; the screen shows sRGB: eframe/egui-wgpu 0.36 configure an 8-bit sRGB surface with no colour space option, although wgpu 30 can present Display P3 or extended sRGB on Metal, DX12, Vulkan and WebGPU (see gaps #18). The colour picker warns about colours outside sRGB and View ▸ Soft-proof sRGB stripes them on the canvas | 2–5 |
| Trackpad pinch zoom and two-finger pan | yes | yes (egui zoom delta, smooth scroll) | — |
| Pen tablet pressure (pencil, Figma Draw brushes) | yes (forum reports of regressions in 2025) | Windows pens (winit pointer input) and browser styluses that send touch events with a force (an Apple Pencil in Safari); the Pencil records it as the stroke's width profile. A mouse, macOS and Linux tablets and pens sending only pointer events in a browser report none: constant width | 1–3 |
| Several windows / multi-monitor | yes (a window per file; the prototype in a window of its own) | desktop: File ▸ New window, a tab's Open in new window or a tab dragged off the strip; each window has its own tabs, panels and canvas, draws only when it needs to and asks about unsaved changes when it closes. Only the main window has a screen-reader tree (eframe 0.36), so files stay tabs while a screen reader runs; positions aren't restored at the next start; the prototype plays in an operating-system window of its own (Options ▸ Open in new window in the presenter, or the preview pane's button) while the editor keeps working, and stays in the window it began in with a screen reader, in the browser or from a window that isn't the main one (checked headless and on a virtual X11 display, not yet on a real desktop); one window in the browser | 1–2 |
| Screen readers | partial | AccessKit tree on desktop (names, roles, states), never tested with a real screen reader; none in the browser | 4–8 + human QA |
| Keyboard layouts (non-US) | yes | keymap uses logical keys; not checked on AZERTY/QWERTZ/JIS | 1–2 |

## Performance (measured by `cargo xtask bench`, synthetic files, owner's Mac)

| Case | FigCraft | Figma |
|---|---|---|
| 50k-layer page, zoomed out, full render | ~8 ms (levels of detail) | not timed side by side |
| 10k layers: full 1440×900 render | 7–15 ms | not timed |
| 10k layers: move one layer, re-render | ~0.2 ms | not timed |
| Design system of ~300 components × 2,000 instances: recolour a main used ~900 times | 4–18 ms | not timed |
| `.figcraft` at 50k layers: save / load | ~0.09 s / ~0.16 s | n/a |
| Idle window | 0 frames, ~0% CPU | — |
| Scrolling 300 frames, 24 px a frame, 1920×1080 px, 20k layers: render jobs, render-thread time, texture uploads (container, test profile) | 26 jobs, ~0.9 s, 486 MB, no frame showing bare page background (was 300 jobs, ~1.5 s, 2,492 MB, a strip of background every frame) | not timed |
| Wheel zoom, 30 steps then settled, same file (container, test profile) | ~0.35 s render thread, 81 MB uploads (was ~0.58 s, 257 MB) | not timed |
| Fast scroll, heavy shop page, 1280×800, 14 steps of 300–400 px every 3 / 6 frames (headless, `scroll_bench_tests`): mean share of the screen bare | web 53% / 2.3% (was 100% / 100%); desktop 7% / 0.6% (was 100% / 9%) | not timed |
| UI frame while panning with the Assets panel open (2k components × 2k instances; container, test profile) | ~8 ms (was ~13–20 ms: every pan frame rebuilt the assets listing and rescanned names) | not timed |

### A photo-heavy page (2026-10-16)

The owner reported lag scrolling and zooming a large e-commerce file, on the Mac and in the browser. Measured on a
synthetic "sale" page (`figcraft_engine::synthetic_shop`: 12 screens of 1440 × 2,100, 721 layers, 72 photo fills of 48
distinct procedural JPEGs of 1.6–4 k pixels, 1.17 GB decoded, rounded clipping cards with drop shadows, ~300 texts, auto
layout), release build, 1920 × 1080 view, in a 4-core container; the browser runs the one-thread rows 2–4× slower than
native (`cargo test --release -p figcraft-engine --lib bench_shop -- --ignored --nocapture`).

| Case | Before | After |
|---|---|---|
| First render at zoom 0.25 (decodes the pictures in view) | 1,372 ms | 650–750 ms |
| Full render, 4 threads: zoom 1 / 0.5 / 0.25 / 0.1 | 94.5 / 68.7 / 49.0 / 25.4 ms | 39.6 / 28.5 / 20.6 / 10.7 ms |
| Full render, one thread (the browser's work): zoom 1 / 0.5 / 0.25 / 0.1 | 231 / 142 / 93 / 58 ms | 92.5 / 54.1 / 35.6 / 17.4 ms |
| Zoom gesture, 30 half-resolution drafts: mean / worst; the settled render after | 21.0 / 28.8 ms; 186 ms | 8.4 / 16.1 ms; 87 ms |
| Pan, 300 frames of 24 px, zoom 1 / 0.5 / 0.25: renders, render-thread time (worst) | 25: 1,036 (95) / 480 (54) / 288 (47) ms | 25: 763 (90) / 394 (83) / 273 (27) ms |
| Decoded pictures held | every picture seen, up to 256 (1.17 GB here) | at most 256 MB (96 MB in the browser), least recently used out |
| Preview against the exact render, zoom 1 / 0.5 | — | mean difference 0.52 / 0.67 of 255 per channel |
| One UI frame (test profile): idle, hover, wheel pan, pinch zoom, a photo selected | — | 0.16 / 0.19 / 0.17 / 0.25 / 0.34 ms (the UI thread was never the cost) |

Where the time went (one thread, zoom 1, pictures from mip levels, before the blur change): **drop shadows 165 of 214 ms
(77%)**, pictures ~38 ms, text ~4 ms. The box blur behind every shadow, layer blur, glass and background blur walked
its pixels four channels at a time with a bounds-checked read for each byte, and cast shadows from the whole RGBA layer:
it is now a running sum in whole rows, on the alpha channel alone for shadows (bit-identical to the old one, tested
against it), with a multiply for the division and a 256-entry tint table; blur-heavy layers cost a third of what they
did. Pictures were drawn bicubically from the decoded pixels at any scale, aliasing and striding through 48 MB
for a 300-pixel card: they now come from a reduced level (bilinear), which is also what removes the aliasing.

What changed, in order of impact: shadows and blurs (above); the picture cache (`render::mips`): decode once, levels by
halving with a box filter, the level chosen so its pixels are at most a screen pixel (none at half size or more, so
1:1 and zoomed-in canvases and every export are unchanged), one lock per picture so the bands of a parallel render
decode a photo once, a byte budget with least-recently-used eviction in place of `clear()` at 256 entries, the big
level 0 dropped after its levels are made (a view that needs level 5 of fifty photos has no use for their level 0;
level 2 is kept as a floor so zooming in from far out needs no decode), decoding ahead in parallel for the pictures
in view (`render::prefetch`, in rounds under 512 MB of simultaneous decode); drafts while zooming leave out grain,
background blur and glass and sample pictures bilinearly (a page with a frosted header: 95 → 81 ms at zoom 1, 69 → 49 ms
at 0.5), and the canvas asks for one draft at a time; in the browser the render runs in pieces (`Retained::begin` /
`Sliced::step`: a picture decode or a band of rows each, about 8 ms of them a frame, sized from how long rows take),
a newer request waiting for the render under way, and the image identical to the whole render within the bands'
anti-aliasing.

Left out: a Web Worker (it needs hand-written JS glue, and shared memory the static hosts' headers don't allow), so a
single large picture still decodes in one piece in the browser (hundreds of ms for a 12-megapixel JPEG; a decoder that
scales while decoding would fix it); uploading only the strips a pan renders (the texture is replaced whole, ~13 MB
a render); a pre-scaled copy of each picture at the zoom (blits instead of sampling, ~30% of the rest); the O(radius)
spread morphology of shadows with a spread on groups.

Nothing has been timed against Figma on the same document (needs `.fig` import). 

### Dragging layers (2026-10-19)

The owner reported jank dragging layers. Measured with `drag_jank_tests` (60 pointer moves at 60 Hz through the real UI
frame, container, dev profile with optimised deps; `cargo test -p figcraft-ui-egui --lib drag_jank_report -- --ignored
--nocapture`, add `--release` on a quiet machine). The five hypotheses:

| # | Hypothesis | Verdict (measured) |
|---|---|---|
| 1 | Move logic runs per raw event, not per frame | Ruled out: `Session::pointer` ran once per frame (egui hands the canvas one position a frame; the same-position check and the one-render-in-flight rule hold); 3 events a frame = 3 `pointer` calls, 0.06 ms each, ~0.2 ms a frame |
| 2 | Snap candidates re-gathered every Move | Ruled out: `Targets::gather` 0 times during 60 moves (once in `move_down`); `snap_move` 0.007 ms a move |
| 3 | Auto layout solved every Move | Partly: a move inside a list solves its frame (10 `layout_frame` calls in 60 moves, only when the slot changes), 0.02 ms in `normalize`; a free move solves none |
| 4 | `preview` rebuilds derived state | Ruled out: clone + closure 0.03 ms (persistent maps), `normalize` 0.01-0.02 ms, comparison 0.01 ms; the whole engine side of a frame is under 0.15 ms (5,000 layers: 0.2 ms) |
| 5 | Copy plan falls back to redrawing | Partly. Opaque moves at ppp 1 and 2 use the copy on 60 of 60 renders; at zoom 1.37 (and any zoom where the snapped move is not whole device pixels) 0 of 60 are copied ("fractional delta") and each redraws ~64 kpx (render 10 ms vs 1 ms). Left out (see below). The real cost was elsewhere: |

Dominant cause (not in the list): the **areas the copy path still draws** were far bigger than the strips. A photo in a
rounded clipping card with a shadow redrew ~71,000 px a move: the card's clip was inset along its whole edge for the
corners, the layer's paint bounds counted the shadow reach twice and ignored the card's clip, and the card's drop shadow
(blur of a 560 px layer) and photo fill were redrawn for every strip. Now: the clip insets only its corners (repaired
after the copy), a layer's changed area stops at its clipping ancestors, a drop shadow that cannot show in the drawn rows
(inside an opaque card, clear of its corners) is not cast and the layer keeps no margin for it, shadows of opaque
one-outline layers are cast from the outline over their reach instead of from the layer's pixels, and copies move rows
with `copy_from_slice` instead of cloning each source. Pixels are the same as before (`shadow_shortcut_tests` compares
every shortcut with the long way round; `moved_tests` and `retained_tests` compare patches with full renders).

| Scenario (p50 / p95 ms) | UI frame before | after | Render before | after |
|---|---|---|---|---|
| Photo in a clipping card, zoom 1 | 1.04 / 1.45 | 0.77 / 1.00 | 41.5 / 58.9 | 11.1 / 16.3 |
| Rectangle with a shadow, zoom 1 | 0.98 / 1.22 | 0.70 / 0.95 | 6.2 / 8.7 | 3.4 / 5.3 |
| Rectangle, ppp 2 | 1.13 / 1.72 | 0.73 / 1.02 | 5.0 / 6.3 | 2.3 / 2.5 |
| Inside an auto layout frame (1 render in 60 moves) | 1.01 / 1.33 | 0.83 / 1.22 | 38.6 | ~51 (noise; same path) |

Left out: moves that are not whole device pixels (zoom 1.37, snapping off) still redraw their area; a layer inside an
auto layout frame still re-solves and redraws the frame when the slot changes; a photo's strips are drawn from the
mip level at full cost per strip; release numbers were not taken (build time).

## Platforms

| Platform | Figma | FigCraft | Notes |
|---|---|---|---|
| macOS | desktop app (Intel and Apple silicon) | universal `.dmg`, signed and notarized (v0.2.0) | where nearly all QA happens. The system menu bar shows FigCraft's menus (app menu, File … Libraries, Window, Help; muda, MIT OR Apache-2.0), built from the same tree as the logo's menu; ⌘/⌃ shortcuts are native key equivalents (2026-10-16: compile-checked for `aarch64-apple-darwin` and `x86_64-apple-darwin`, not yet seen on a Mac) |
| Windows x64 / arm64 | desktop app | `.msi` and portable zip for x64, x86 and arm64 | built in CI; Windows: QA pass done 2026-10-11, findings in PR |
| Linux | none (browser only) | AppImage, `.deb`, `.rpm`, Flatpak, tarball, x86_64 and aarch64; riscv64 tarball | CI tests run here |
| FreeBSD | none | tarball | |
| Web | primary (figma.com) | `figcraft-web` (WASM, WebGPU/WebGL2), web zip | no accessibility tree; file access through the browser |
| iOS / Android | apps: view, comment, mirror prototypes | none (the web build is not touch-first) | 20–40 h for a viewer |

## Revision history

| Date | Change | Summary |
|---|---|---|
| 2026-10-20 | minor | Fast scrolling on photo-heavy pages (owner's video, web on Chrome/Mac: grey on the side being scrolled to, filled ~1 s later in blocks). Five changes: the renderer draws the bands of what the screen shows first and hands the image over as soon as they are done, then patches in the margin (web and desktop; the desktop thread now runs the same `Stepper`, a whole area a piece); a fast pan (over 3,000 px/s) renders at half resolution and refines 150 ms after it slows; the margin ahead of a pan follows its speed × the measured render latency (up to 1.25 screens, within `render_cap`), less behind, and still after a pan more is drawn ahead; a render the scroll went past is given up for the newer one but its drawing is kept (`Retained::abandon`: the undrawn bands become holes the next render draws), so nothing is redone; pictures within three screens decode ahead, nearest first, while nothing renders (`prefetch::Ahead`, stops at 3/4 of the picture cache); finished renders leave 128 px tiles per file (192 MB desktop, 40 MB web, LRU, dropped by the areas an edit touches) that scrolling back copies. Measured headless (`scroll_bench_tests`, heavy shop page, 1280×800, 14 steps of 300–400 px): web, a step every 3 frames, mean grey 100% → 53%, screen covered 743 → 519 ms after the stop; a step every 6 frames 100% → 2.3% (worst frame 41%), each step's screen covered in 127 → 20 ms; desktop, a step every 3 frames 100% → 7%, every 6 frames 9% → 0.6%. The desktop's final refine after a stop is slower (34–67 → ~320 ms: 150 ms settle plus a full-resolution render); left: GPU drawing of pictures (see gaps 7). Percentages unchanged |
| 2026-10-19 | minor | Dragging layers: measured the five suspected causes (per-event handling, snap candidates, auto layout solves, preview rebuilds, copy fallbacks) and found the cost in the areas the copy path still drew: a photo in a rounded clipping card with a shadow redrew ~71 kpx a move. Render per move 41.5 → 11.1 ms (p50) for that case, 6.2 → 3.4 with a shadow, 5.0 → 2.3 at ppp 2; UI frame ~1.0 → ~0.8 ms. Counters in `figcraft_engine::perf` / `figcraft_render::perf`, tests `drag_jank_tests`, `shadow_shortcut_tests`. Percentages unchanged |
| 2026-10-19 | minor | Canvas: dragging layers and switching tabs (see the gaps page for the drag numbers). Tabs: each open file keeps its own render (the render thread holds one retained image per file under a 384 MB budget, least recently used first) and its own picture on the canvas (a texture per tab, 256 MB), so going back to a tab shows its picture in the first frame (0.6–0.9 ms, 0.000% of the pixels different from when it was left) instead of the other file's picture for the whole render (30.7% of the pixels wrong for 31 ms at 1× and 149 ms at 2× on a small shop page; seconds on a big one) and the render that refines it patches the kept image (the picture doesn't change: 0.000%); after the canvas is quiet for 0.35 s (0.05 s over a tab) the render thread draws the tab beside the active one or under the pointer in the background (not in the browser, where the window's own render comes first: the picture and the kept render per tab still apply there); the decoded picture cache (mip pyramids) holds 640 MB on the desktop (256 MB) so the photos of several open files stay decoded. Tests: `canvas_tabs_tests`. Left: a never-opened file's first render still takes the time it takes (it is rendered ahead only after the canvas has been quiet); the web build keeps one render at a time |
| 2026-10-16 | minor | Canvas speed on photo-heavy pages (owner's report: lag scrolling and zooming a big e-commerce file, on the Mac and in the browser). Measured first on a synthetic sale page (12 screens, 72 photo fills of 1.6–4 k pixel pictures, shadows, rounded clipping cards): drop shadows were 77% of a one-thread render, pictures about a fifth. The box blur is a running sum in rows (alpha only for shadows, bit-identical to the old one), pictures at under half size draw from a mip pyramid in a byte-budgeted LRU cache decoded ahead in parallel (exports and 1:1 canvases unchanged), zoom drafts skip grain, background blur and glass, and the browser renders in pieces of about 8 ms a frame. Full render at zoom 1: 94.5 → 39.6 ms (4 threads), 231 → 92.5 ms (one thread); zoom gesture drafts 21 → 8.4 ms; first render 1,372 → ~700 ms; decoded pictures held: unbounded → 256 MB (96 MB in the browser). Performance 60% unchanged (nothing timed against Figma) |
| 2026-10-16 | minor | macOS system menu bar (owner's report: it showed only "FigCraft"): FigCraft's menus in it, from the main menu's tree (`menu_model`), with the Mac app, Window and Help menus; Quit asks about unsaved changes. Cross-checked from Linux with `cargo check/clippy --target aarch64-apple-darwin` / `x86_64-apple-darwin` (ring's C build script skipped for the check: `--config 'target.<triple>.ring_core_0_17_14_.rustc-link-search=[]'`); the look and the key handling still need a Mac. Platforms ~75% unchanged |
| 2026-10-15 | minor | Several windows, the presenter's part: the prototype can play in an operating-system window of its own while the editor keeps working (integration of the presenter branches); the row said "presenter in its own window" and "the presenter stays inside its window" at once, and now says what is built and that it hasn't been seen on a real desktop. No number moves. |
| 2026-10-15 | minor | Smoother canvas panning and zooming (owner's Windows report: stutter while panning and zooming, a grey band while scrolling down). Root causes: each pan frame rendered the exact viewport, so the strip a pan uncovered showed bare page background until the render arrived, and every frame converted and uploaded a whole-screen texture; each zoom frame rendered a full-resolution image; and every pan or zoom frame bumped the document revision, which rebuilt the panels' per-document caches (the assets listing, the CJK name scan…). Now the canvas renders a quarter-view margin and reuses it while panning, zoom frames render half-resolution drafts, and view changes leave the revision alone. Measured in the container (test profile): 300 scroll frames 300 → 26 render jobs and 2,492 → 486 MB of uploads with no bare frames; a zoom 257 → 81 MB; UI frames panning with a large Assets panel ~13–20 → ~8 ms (`canvas_scroll_tests`). Percentages and hours unchanged |
| 2026-10-11 | minor | Windows QA pass (gap 8): everyday workflows on Windows 11 through the desktop app and MCP; fixed: unsaved changes lost when the app was killed or crashed (recovery copies every few seconds, reopened at the next start), Ctrl+arrows/Backspace/Delete acting on the whole line in text (now by word; Ctrl+Home/End to the text's ends), scrubbed fields snapping back on release, typing on a field Tab reached, Escape not closing dialogs, skewed or vanishing linear gradients, hints cut off at the panel edge, the window-close question in English in the Spanish interface. Percentages and hours unchanged |
| 2026-10-11 | minor | Display P3 honest minimum (gap 18): the colour picker of a Display P3 file warns when a colour is outside sRGB (Outside sRGB, with what the canvas and exports do), and View ▸ Soft-proof sRGB (`view.proofSrgb`) stripes the canvas pixels sRGB can't show. Why the canvas still shows sRGB: wgpu 30 can present Display P3 or extended-range sRGB surfaces (Metal, DX12, Vulkan, WebGPU canvases), but eframe/egui-wgpu 0.36 configure an 8-bit sRGB surface with no option for the format or colour space, and egui's renderer writes sRGB-encoded UI colours; showing P3 needs those two upstream (or a patched egui-wgpu). Hardware 13–27 h → 12–26 h; gap 18 6–12 h → 5–11 h; percentages, feature breadth (~79%) and ready for real work (~47%) unchanged at this rounding; full parity ~363–697 h → ~362–696 h |
| 2026-10-11 | minor | Several windows (gap 18): File ▸ New window, a tab's Open in new window or a tab dragged off the tab strip opens files in another window with its own tabs, panels and canvas, sharing the files, preferences, libraries and clipboard; each window draws only when it needs to (idle: ~0% CPU), closing one closes its files after asking about unsaved changes (the main window too, which takes over another window instead of quitting; the last window quits), and the control channel and MCP open, list, focus and capture windows (`window.new`, `window.list`, `window.focus`, `window` on any request); the screen-reader tree covers the main window only (eframe 0.36), so with a screen reader running files stay tabs; one window in the browser. Hardware 55% → 60%, 13–27 h → 10–21 h; gap 18 6–12 h → 4–8 h (P3 on screen left); feature breadth (~79%) and ready for real work (~47%) unchanged at this rounding; full parity ~363–697 h → ~360–691 h |
| 2026-10-11 | minor | Stretch and scatter brushes and pen pressure landed (gap 9): eight brushes drawn in code (four stretched along the path, four scattered with spacing, size, rotation and scatter jitter from a seed) in the stroke settings, drawn everywhere strokes are and flattened by outline stroke; the Pencil records pen pressure as the stroke's width profile (Windows pens, browser styluses; macOS and Linux tablets report none) and can draw with a brush; Figma Draw extras breadth 45% → 65%, ready 30% → 45%, 10–18 h → 5–9 h; Strokes 2–4 h → 1–3 h; Hardware 50% → 55%, 15–30 h → 13–27 h; feature breadth (~79%) and ready for real work (~47%) unchanged at this rounding; full parity ~380–725 h → ~375–715 h |
| 2026-10-10 | major | Created from the 2026-10-10 re-measure |
