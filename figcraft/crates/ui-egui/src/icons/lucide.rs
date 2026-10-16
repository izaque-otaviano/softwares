//! The icons' art: the SVG files (Lucide's, and FigCraft's originals in Lucide's style) embedded at
//! build time, rasterised with resvg as white masks at the exact physical pixel size and cached as
//! textures per (icon, size); [`paint`] tints a mask with the caller's colour.

use std::collections::HashMap;

use egui::{Color32, ColorImage, Id, Painter, Rect, TextureHandle, TextureOptions, pos2, vec2};

use super::Icon;

/// Embed `assets/ui/lucide/<key>.svg` for every key.
macro_rules! files {
    ($($key:literal,)*) => {
        /// Every embedded SVG: (key under `assets/ui/lucide/` without `.svg`, its text).
        pub(crate) static FILES: &[(&str, &str)] =
            &[$(($key, include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../assets/ui/lucide/", $key, ".svg"))),)*];
    };
}

files! {
    "align-center-horizontal",
    "align-center-vertical",
    "align-end-horizontal",
    "align-end-vertical",
    "align-horizontal-distribute-center",
    "align-start-horizontal",
    "align-start-vertical",
    "align-vertical-distribute-center",
    "align-vertical-justify-center",
    "align-vertical-justify-end",
    "align-vertical-justify-start",
    "arrow-left-right",
    "bell",
    "blocks",
    "book-open",
    "check",
    "chevron-down",
    "chevron-left",
    "chevron-right",
    "chevron-up",
    "circle",
    "circle-dot",
    "circle-play",
    "circle-plus",
    "circle-question-mark",
    "clock",
    "code-xml",
    "component",
    "contrast",
    "copy",
    "crop",
    "diamond",
    "droplet",
    "ellipsis",
    "eraser",
    "eye",
    "eye-off",
    "file",
    "flip-horizontal-2",
    "flip-vertical-2",
    "frame",
    "globe",
    "grid-3x3",
    "grip-vertical",
    "group",
    "hand",
    "house",
    "image",
    "lasso",
    "layers",
    "layout-grid",
    "layout-list",
    "layout-panel-left",
    "link",
    "list",
    "lock",
    "lock-open",
    "menu",
    "maximize",
    "message-circle",
    "minus",
    "monitor-play",
    "moon",
    "mouse-pointer-2",
    "move-up-right",
    "paint-bucket",
    "panel-left",
    "pen-tool",
    "pencil",
    "pipette",
    "play",
    "plus",
    "radio",
    "redo-2",
    "rotate-ccw",
    "rotate-cw",
    "scaling",
    "scan",
    "scissors",
    "search",
    "slice",
    "sliders-vertical",
    "smile-plus",
    "sparkles",
    "spline",
    "square",
    "square-arrow-out-up-right",
    "square-dashed-plus",
    "square-round-corner",
    "squares-exclude",
    "squares-intersect",
    "squares-subtract",
    "squares-unite",
    "star",
    "sun",
    "swatch-book",
    "text-align-center",
    "text-align-end",
    "text-align-justify",
    "text-align-start",
    "triangle",
    "triangle-alert",
    "type",
    "undo-2",
    "unlink",
    "upload",
    "vector-square",
    "x",
    "zap",
    "original/absolute-position",
    "original/arc-ratio",
    "original/arc-start",
    "original/arc-sweep",
    "original/component-set",
    "original/detach",
    "original/fill",
    "original/fill-container",
    "original/fixed",
    "original/flow-horizontal",
    "original/flow-vertical",
    "original/flow-wrap",
    "original/gap",
    "original/hug",
    "original/padding-horizontal",
    "original/padding-vertical",
    "original/section",
    "original/shape-builder",
    "original/shape-builder-remove",
    "original/variable",
    "original/variable-width",
}

/// Lucide's grid.
const GRID: f32 = 24.0;
/// The stroke width in grid units at 24 px and above (Lucide's own is 2: this is a little lighter).
const BASE_STROKE: f32 = 1.8;
/// Strokes are never thinner than this many physical pixels (small icons get thicker lines).
const MIN_STROKE_PX: f32 = 1.3;
const MAX_STROKE: f32 = 3.0;
/// The largest texture side rasterised; bigger requests are drawn from this one.
pub(crate) const MAX_PX: u32 = 512;
/// Textures kept before the cache starts over (sizes change only with the display scale).
const CACHE_CAP: usize = 1024;

#[derive(Clone, Default)]
struct Cache(HashMap<(Icon, u32), Option<TextureHandle>>);

fn cache_id() -> Id {
    Id::new("figcraft_icon_textures")
}

/// The SVG text for `key`.
pub(crate) fn file(key: &str) -> Option<&'static str> {
    FILES.iter().find(|(k, _)| *k == key).map(|(_, svg)| *svg)
}

/// The stroke width, in grid units, for an icon `px` physical pixels wide: the base width, or
/// thicker when that would be under [`MIN_STROKE_PX`] (small sizes).
pub(crate) fn stroke_units(px: u32) -> f32 {
    (MIN_STROKE_PX * GRID / px.max(1) as f32).clamp(BASE_STROKE, MAX_STROKE)
}

/// Rasterise `svg` (a 24-unit Lucide-style icon) into a `px`×`px` mask: white with the art's
/// coverage as alpha, its stroke `stroke` grid units wide. `None` when the SVG doesn't parse.
pub(crate) fn rasterize(svg: &str, px: u32, stroke: f32) -> Option<ColorImage> {
    let px = px.clamp(1, MAX_PX);
    let stroke = if stroke.is_finite() { stroke.clamp(0.25, 6.0) } else { BASE_STROKE };
    // Every icon file sets its width once, on the root element, as Lucide's own do.
    let svg = svg.replacen("stroke-width=\"2\"", &format!("stroke-width=\"{stroke:.3}\""), 1);
    let tree = resvg::usvg::Tree::from_str(&svg, &resvg::usvg::Options::default()).ok()?;
    let (w, h) = (tree.size().width(), tree.size().height());
    if !(w.is_finite() && h.is_finite() && w > 0.0 && h > 0.0) {
        return None;
    }
    let mut pixmap = resvg::tiny_skia::Pixmap::new(px, px)?;
    let side = px as f32;
    let k = side / w.max(h);
    let (tx, ty) = ((side - w * k) / 2.0, (side - h * k) / 2.0);
    resvg::render(&tree, resvg::tiny_skia::Transform::from_row(k, 0.0, 0.0, k, tx, ty), &mut pixmap.as_mut());
    // Premultiplied white: every channel is the coverage.
    let rgba: Vec<u8> = pixmap.data().chunks_exact(4).flat_map(|c| [c[3]; 4]).collect();
    Some(ColorImage::from_rgba_premultiplied([px as usize, px as usize], &rgba))
}

fn texture(ctx: &egui::Context, icon: Icon, px: u32) -> Option<TextureHandle> {
    let key = (icon, px);
    if let Some(hit) = ctx.data_mut(|d| d.get_temp_mut_or_default::<Cache>(cache_id()).0.get(&key).cloned()) {
        return hit;
    }
    let made = super::source(icon)
        .and_then(file)
        .and_then(|svg| rasterize(svg, px, stroke_units(px)))
        .map(|img| ctx.load_texture(format!("figcraft-icon-{icon:?}-{px}"), img, TextureOptions::LINEAR));
    ctx.data_mut(|d| {
        let cache = d.get_temp_mut_or_default::<Cache>(cache_id());
        if cache.0.len() >= CACHE_CAP {
            cache.0.clear();
        }
        cache.0.insert(key, made.clone());
    });
    made
}

/// The textures made so far (tests tell them apart from pictures).
#[cfg(test)]
pub(crate) fn textures(ctx: &egui::Context) -> Vec<egui::TextureId> {
    ctx.data(|d| d.get_temp::<Cache>(cache_id())).map(|c| c.0.values().flatten().map(TextureHandle::id).collect()).unwrap_or_default()
}

/// The size, in physical pixels, an icon in a box `side` points wide is drawn at (never larger
/// than the box); `None` for a box that can't hold one.
pub(crate) fn pixels(side: f32, ppp: f32) -> Option<u32> {
    if !(side.is_finite() && ppp.is_finite() && side > 0.0 && ppp > 0.0) {
        return None;
    }
    let px = (side * ppp + 1e-3).floor().clamp(0.0, MAX_PX as f32) as u32;
    (px >= 1).then_some(px)
}

/// Paint `icon` as the largest square that fits `rect`, centred and on whole physical pixels,
/// its mask tinted `tint`. Nothing for an empty, infinite or NaN box.
pub(crate) fn paint(painter: &Painter, rect: Rect, icon: Icon, tint: Color32) {
    let ctx = painter.ctx();
    let ppp = ctx.pixels_per_point();
    if !rect.is_finite() || tint.a() == 0 {
        return;
    }
    let Some(px) = pixels(rect.width().min(rect.height()), ppp) else { return };
    let pts = px as f32 / ppp;
    // On the pixel grid when that keeps it inside the box, else exactly centred.
    let place = |lo: f32, hi: f32, mid: f32| {
        let at = mid - pts / 2.0;
        let snapped = (at * ppp).round() / ppp;
        if snapped >= lo - 1e-4 && snapped + pts <= hi + 1e-4 { snapped } else { at }
    };
    let min = pos2(place(rect.min.x, rect.max.x, rect.center().x), place(rect.min.y, rect.max.y, rect.center().y));
    let Some(tex) = texture(ctx, icon, px) else { return };
    painter.image(tex.id(), Rect::from_min_size(min, vec2(pts, pts)), Rect::from_min_max(pos2(0.0, 0.0), pos2(1.0, 1.0)), tint);
}
