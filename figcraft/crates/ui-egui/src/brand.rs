//! The two pieces of UI art that come from SVG files instead of `icons.rs` primitives: the FigCraft
//! logo (the app icon, `assets/app-icon/`) and the document mark before a file's name (tabs, open
//! and recent files; `assets/ui/document-tab.svg`). Both were supplied by the repository owner, see
//! `ATTRIBUTION.md`.
//!
//! Each is rasterised with resvg at the exact physical pixel size it is shown at, so it stays crisp
//! at any display scale, and cached as a texture per size.

use std::collections::HashMap;

use egui::{Color32, ColorImage, Id, Painter, Rect, TextureHandle, TextureOptions, pos2, vec2};

/// The app icon's master, and its small-size variant (pixel-snapped border) for 32 px and below.
const LOGO: &[u8] = include_bytes!("../../../assets/app-icon/figcraft.svg");
const LOGO_SMALL: &[u8] = include_bytes!("../../../assets/app-icon/figcraft-small.svg");
/// The document mark (a pen nib), one colour: painted as a mask in the caller's colour.
const DOCUMENT: &[u8] = include_bytes!("../../../assets/ui/document-tab.svg");

/// The largest texture side rasterised; bigger requests are drawn from this one.
const MAX_PX: u32 = 1024;
/// Distinct sizes kept before the cache starts over (sizes change only with the display scale).
const CACHE_CAP: usize = 64;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Art {
    /// The full-colour FigCraft logo.
    Logo,
    /// The document mark, tinted.
    Document,
}

#[derive(Clone, Default)]
struct Cache(HashMap<(Art, u32), Option<TextureHandle>>);

fn source(art: Art, px: u32) -> &'static [u8] {
    match art {
        Art::Logo if px <= 32 => LOGO_SMALL,
        Art::Logo => LOGO,
        Art::Document => DOCUMENT,
    }
}

/// Rasterise `svg` into a `px`×`px` image (the art fitted and centred). `mask` turns it into white
/// with the art's coverage as alpha, for tinting. `None` when the SVG doesn't parse.
pub fn rasterize(svg: &[u8], px: u32, mask: bool) -> Option<ColorImage> {
    let px = px.clamp(1, MAX_PX);
    let tree = resvg::usvg::Tree::from_data(svg, &resvg::usvg::Options::default()).ok()?;
    let (w, h) = (tree.size().width(), tree.size().height());
    if !(w.is_finite() && h.is_finite() && w > 0.0 && h > 0.0) {
        return None;
    }
    let mut pixmap = resvg::tiny_skia::Pixmap::new(px, px)?;
    let side = px as f32;
    let k = side / w.max(h);
    let (tx, ty) = ((side - w * k) / 2.0, (side - h * k) / 2.0);
    resvg::render(&tree, resvg::tiny_skia::Transform::from_row(k, 0.0, 0.0, k, tx, ty), &mut pixmap.as_mut());
    let size = [px as usize, px as usize];
    if mask {
        // Premultiplied white: every channel is the coverage.
        let rgba: Vec<u8> = pixmap.data().chunks_exact(4).flat_map(|c| [c[3]; 4]).collect();
        Some(ColorImage::from_rgba_premultiplied(size, &rgba))
    } else {
        Some(ColorImage::from_rgba_premultiplied(size, pixmap.data()))
    }
}

fn texture(ctx: &egui::Context, art: Art, px: u32) -> Option<TextureHandle> {
    let id = Id::new("figcraft_brand_textures");
    if let Some(hit) = ctx.data(|d| d.get_temp::<Cache>(id).and_then(|c| c.0.get(&(art, px)).cloned())) {
        return hit;
    }
    let made = rasterize(source(art, px), px, art == Art::Document)
        .map(|img| ctx.load_texture(format!("figcraft-{art:?}-{px}"), img, TextureOptions::LINEAR));
    ctx.data_mut(|d| {
        let cache = d.get_temp_mut_or_default::<Cache>(id);
        if cache.0.len() >= CACHE_CAP {
            cache.0.clear();
        }
        cache.0.insert((art, px), made.clone());
    });
    made
}

/// The textures made so far (tests tell them apart from pictures).
#[cfg(test)]
pub(crate) fn textures(ctx: &egui::Context) -> Vec<egui::TextureId> {
    ctx.data(|d| d.get_temp::<Cache>(Id::new("figcraft_brand_textures")))
        .map(|c| c.0.values().flatten().map(TextureHandle::id).collect())
        .unwrap_or_default()
}

/// Paint `art` as the largest square that fits `rect`, centred and on whole physical pixels.
/// `tint` colours the document mark; the logo keeps its own colours (pass white).
pub fn paint(painter: &Painter, rect: Rect, art: Art, tint: Color32) {
    let ctx = painter.ctx();
    let ppp = ctx.pixels_per_point();
    let side = rect.width().min(rect.height());
    if !(side.is_finite() && ppp.is_finite() && side > 0.0 && ppp > 0.0) {
        return;
    }
    let px = (side * ppp).round().clamp(1.0, MAX_PX as f32) as u32;
    let pts = px as f32 / ppp;
    let min = rect.center() - vec2(pts, pts) / 2.0;
    let min = pos2((min.x * ppp).round() / ppp, (min.y * ppp).round() / ppp);
    let Some(tex) = texture(ctx, art, px) else { return };
    let uv = Rect::from_min_max(pos2(0.0, 0.0), pos2(1.0, 1.0));
    painter.image(tex.id(), Rect::from_min_size(min, vec2(pts, pts)), uv, tint);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_art_rasterises() {
        for (svg, mask) in [(LOGO, false), (LOGO_SMALL, false), (DOCUMENT, true)] {
            for px in [1, 14, 16, 32, 48, 96, 2000] {
                let img = rasterize(svg, px, mask).unwrap();
                let side = px.min(MAX_PX) as usize;
                assert_eq!(img.size, [side, side]);
                assert!(img.pixels.iter().any(|c| c.a() > 0), "{px} px is not blank");
            }
        }
    }

    /// The logo is the yellow tile with its dark border, edge to edge.
    #[test]
    fn the_logo_is_the_yellow_tile() {
        let img = rasterize(LOGO, 64, false).unwrap();
        let at = |x: usize, y: usize| img.pixels[y * 64 + x];
        assert_eq!(at(10, 10), Color32::from_rgb(0xff, 0xc6, 0x3d));
        let edge = at(0, 32);
        assert!(edge.r() < 0x30 && edge.a() == 255, "dark border: {edge:?}");
    }

    /// The document mark is a white mask (tinted when painted), transparent around the nib.
    #[test]
    fn the_document_mark_is_a_mask() {
        let img = rasterize(DOCUMENT, 24, true).unwrap();
        assert_eq!(img.pixels[0], Color32::TRANSPARENT);
        assert!(img.pixels.iter().all(|c| c.r() == c.a() && c.g() == c.a() && c.b() == c.a()));
    }

    #[test]
    fn junk_svg_and_sizes_dont_panic() {
        assert!(rasterize(b"not svg", 16, false).is_none());
        assert!(rasterize(b"", 0, true).is_none());
        let ctx = egui::Context::default();
        let mut out = ctx.run_ui(egui::RawInput::default(), |ui| {
            for side in [0.0, -4.0, f32::NAN, f32::INFINITY, 0.3, 14.0, 5000.0] {
                for art in [Art::Logo, Art::Document] {
                    paint(ui.painter(), Rect::from_min_size(pos2(1.3, 2.7), vec2(side, side)), art, Color32::WHITE);
                }
            }
        });
        out.textures_delta.clear();
    }
}
