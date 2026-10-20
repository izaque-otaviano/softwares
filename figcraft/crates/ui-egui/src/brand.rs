//! The two pieces of UI art that are the repository owner's own and not Lucide icons (`icons.rs`):
//! the FigCraft logo (the owner's pen, `assets/app-icon/figcraft-mark.svg`, with a light-ink
//! variant for the dark theme) and the document mark before a file's name (tabs, open and recent
//! files; `assets/app-icon/document.svg`, the same sheet as the `.figcraft` file icon). See
//! `ATTRIBUTION.md`.
//!
//! Each is rasterised with resvg at the exact physical pixel size it is shown at, so it stays crisp
//! at any display scale, and cached as a texture per size.

use std::collections::HashMap;

use egui::{Color32, ColorImage, Id, Painter, Rect, TextureHandle, TextureOptions, pos2, vec2};

/// The logo as drawn on light surfaces (dark ink), and on dark ones (light ink, the same colours
/// otherwise).
const LOGO: &[u8] = include_bytes!("../../../assets/app-icon/figcraft-mark.svg");
const LOGO_DARK: &[u8] = include_bytes!("../../../assets/app-icon/figcraft-dark.svg");
/// The document sheet with the logo and the extension, and (32 px and below) without the label.
const DOCUMENT: &[u8] = include_bytes!("../../../assets/app-icon/document.svg");
const DOCUMENT_SMALL: &[u8] = include_bytes!("../../../assets/app-icon/document-small.svg");

/// The largest texture side rasterised; bigger requests are drawn from this one.
const MAX_PX: u32 = 1024;
/// Distinct sizes kept before the cache starts over (sizes change only with the display scale).
const CACHE_CAP: usize = 64;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Art {
    /// The full-colour FigCraft logo.
    Logo,
    /// The document mark: the sheet with the logo, full colour.
    Document,
}

#[derive(Clone, Default)]
struct Cache(HashMap<(Art, u32, bool), Option<TextureHandle>>);

/// The file for `art` at `px` pixels, `dark` on the dark theme.
fn source(art: Art, px: u32, dark: bool) -> &'static [u8] {
    match art {
        Art::Logo if dark => LOGO_DARK,
        Art::Logo => LOGO,
        Art::Document if px <= 32 => DOCUMENT_SMALL,
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
    let dark = crate::theme::Tokens::get(ctx).dark;
    if let Some(hit) = ctx.data(|d| d.get_temp::<Cache>(id).and_then(|c| c.0.get(&(art, px, dark)).cloned())) {
        return hit;
    }
    let made =
        rasterize(source(art, px, dark), px, false).map(|img| ctx.load_texture(format!("figcraft-{art:?}-{px}-{dark}"), img, TextureOptions::LINEAR));
    ctx.data_mut(|d| {
        let cache = d.get_temp_mut_or_default::<Cache>(id);
        if cache.0.len() >= CACHE_CAP {
            cache.0.clear();
        }
        cache.0.insert((art, px, dark), made.clone());
    });
    made
}

/// The textures made so far, the icons' included (tests tell them apart from pictures).
#[cfg(test)]
pub(crate) fn textures(ctx: &egui::Context) -> Vec<egui::TextureId> {
    let mut all: Vec<egui::TextureId> = ctx
        .data(|d| d.get_temp::<Cache>(Id::new("figcraft_brand_textures")))
        .map(|c| c.0.values().flatten().map(TextureHandle::id).collect())
        .unwrap_or_default();
    all.extend(crate::icons::lucide::textures(ctx));
    all
}

/// Paint `art` as the largest square that fits `rect`, centred and on whole physical pixels.
/// Both pieces keep their own colours (the logo's ink follows the theme); `tint` only multiplies
/// them, so pass white, or white with some alpha to fade.
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
        for (svg, mask) in [(LOGO, false), (LOGO_DARK, false), (DOCUMENT, false), (DOCUMENT_SMALL, true)] {
            for px in [1, 14, 16, 32, 48, 96, 2000] {
                let img = rasterize(svg, px, mask).unwrap();
                let side = px.min(MAX_PX) as usize;
                assert_eq!(img.size, [side, side]);
                assert!(img.pixels.iter().any(|c| c.a() > 0), "{px} px is not blank");
            }
        }
    }

    /// The logo is the pen on a transparent ground, its body dark ink on the light theme and light
    /// ink on the dark one, the yellow tip in both.
    #[test]
    fn the_logo_ink_follows_the_theme() {
        let light = rasterize(LOGO, 128, false).unwrap();
        let dark = rasterize(LOGO_DARK, 128, false).unwrap();
        assert_eq!(light.pixels[0], Color32::TRANSPARENT);
        assert_eq!(dark.pixels[0], Color32::TRANSPARENT);
        let has = |img: &ColorImage, c: Color32| img.pixels.iter().filter(|p| **p == c).count() > 50;
        assert!(has(&light, Color32::from_rgb(0x1b, 0x18, 0x18)), "dark ink on light");
        assert!(has(&dark, Color32::from_rgb(0xf2, 0xf2, 0xf2)), "light ink on dark");
        assert!(!has(&dark, Color32::from_rgb(0x1b, 0x18, 0x18)), "no dark ink on dark");
        assert!(has(&light, Color32::from_rgb(0xfe, 0xbb, 0x00)) && has(&dark, Color32::from_rgb(0xfe, 0xbb, 0x00)), "yellow tip");
    }

    /// The texture cache keys on the theme: the dark variant is another texture.
    #[test]
    fn the_logo_texture_changes_with_the_theme() {
        let ctx = egui::Context::default();
        let draw = |ctx: &egui::Context| {
            let mut out = ctx.run_ui(egui::RawInput::default(), |ui| {
                paint(ui.painter(), Rect::from_min_size(pos2(0.0, 0.0), vec2(20.0, 20.0)), Art::Logo, Color32::WHITE);
            });
            out.textures_delta.clear();
        };
        crate::theme::apply(&ctx, crate::theme::Tokens::light());
        draw(&ctx);
        assert_eq!(textures(&ctx).len(), 1);
        crate::theme::apply(&ctx, crate::theme::Tokens::dark());
        draw(&ctx);
        assert_eq!(textures(&ctx).len(), 2);
    }

    /// The document mark is a white sheet with a transparent surround (full colour, never a mask).
    #[test]
    fn the_document_mark_is_a_white_sheet() {
        for (svg, px) in [(DOCUMENT, 64usize), (DOCUMENT_SMALL, 24)] {
            let img = rasterize(svg, px as u32, false).unwrap();
            assert_eq!(img.pixels[0], Color32::TRANSPARENT);
            assert_eq!(img.pixels[px * px - 1], Color32::TRANSPARENT);
            let white = img.pixels.iter().filter(|c| **c == Color32::WHITE).count();
            assert!(white * 6 > px * px, "{px}: {white} white pixels");
        }
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
